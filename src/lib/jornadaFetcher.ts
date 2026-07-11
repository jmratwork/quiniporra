import { z } from 'zod';
import { cacheGet, cacheSet, TTL_JORNADA_MS } from './cache';
import { JornadaFetchError } from './errors';
import { obtenerPartidosMundoDeportivo, limpiaNombreEquipo } from './mundoDeportivo';
import { fetchTextoExterno } from './fetchExterno';

// Se reexporta para no romper a quien lo importaba desde aquí.
export { JornadaFetchError };

/**
 * Obtención automática de la jornada actual de La Quiniela.
 *
 * ARQUITECTURA DE FUENTES (comprobada con peticiones reales, 2026-07):
 *
 *  1. CABECERA — SELAE, `GET /servicios/proximosv3?game_id=LAQU&num=1`
 *     Devuelve el número de jornada, año, fecha de cierre y `id_sorteo` de la
 *     próxima jornada abierta a apuestas. NO incluye los emparejamientos.
 *
 *  2. LOS 15 PARTIDOS — Mundo Deportivo (fuente primaria).
 *     Los endpoints de SELAE NO publican los emparejamientos de la jornada
 *     abierta: `buscadorSorteos` solo devuelve jornadas ya celebradas. Mundo
 *     Deportivo sí publica el boleto vigente, así que de ahí salen los 15
 *     partidos. Ver `src/lib/mundoDeportivo.ts`.
 *
 *  3. RESPALDO — SELAE, `GET /servicios/buscadorSorteos?...`
 *     Útil cuando la jornada ya se celebró (o si Mundo Deportivo cambia).
 *     Ojo: las fechas son de 8 dígitos (AAAAMMDD), sin hora.
 *
 * Si nada funciona se lanza JornadaFetchError y el panel de admin ofrece el
 * FALLBACK MANUAL. La app nunca depende en exclusiva de una fuente externa.
 *
 * Todas las peticiones se hacen en servidor, nunca desde el navegador.
 */

const BASE = 'https://www.loteriasyapuestas.es/servicios';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.loteriasyapuestas.es/es/la-quiniela',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  'X-Requested-With': 'XMLHttpRequest',
};

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export type FuentePartidos = 'MUNDO_DEPORTIVO' | 'SELAE';

export interface PartidoJornada {
  numero: number; // 1..15
  local: string;
  visitante: string;
  esPleno: boolean; // true si numero === 15
}

export interface JornadaObtenida {
  jornada: string; // p. ej. "Jornada 72 - 2026"
  numeroJornada: number | null;
  fechaCierre: string | null; // ISO 8601
  fechaSorteo: string | null; // ISO 8601
  idSorteo: string | null;
  celebrada: boolean; // true si los partidos vienen de una jornada ya celebrada
  fuente: FuentePartidos;
  partidos: PartidoJornada[]; // exactamente 15
}

const jornadaValidada = z.object({
  jornada: z.string().min(1),
  numeroJornada: z.number().int().positive().nullable(),
  fechaCierre: z.string().nullable(),
  fechaSorteo: z.string().nullable(),
  idSorteo: z.string().nullable(),
  celebrada: z.boolean(),
  fuente: z.enum(['MUNDO_DEPORTIVO', 'SELAE']),
  partidos: z
    .array(
      z.object({
        numero: z.number().int().min(1).max(15),
        local: z.string().min(1).max(80),
        visitante: z.string().min(1).max(80),
        esPleno: z.boolean(),
      }),
    )
    .length(15),
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalizaNombre(v: unknown): string {
  if (typeof v !== 'string') return '';
  // Mismo saneado defensivo que la ruta de Mundo Deportivo: elimina caracteres
  // de control/bidi/invisibles y limita la longitud antes de tocar BD/UI/PDF.
  return limpiaNombreEquipo(v);
}

function primerCampo(obj: Record<string, unknown>, claves: string[]): unknown {
  for (const k of claves) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

/** "2026-07-12 00:00:00" | ISO -> ISO 8601, o null. */
function aIso(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const s = v.includes('T') ? v : v.replace(' ', 'T');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Extrae "AAAAMMDD" sin desfase de zona horaria. */
function aYmd(fechaRaw: unknown): string | null {
  if (typeof fechaRaw !== 'string') return null;
  const m = fechaRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** Suma días a una fecha "AAAAMMDD" (aritmética en UTC). */
function ymdMasDias(ymd: string, dias: number): string {
  const fecha = new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))),
  );
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  return `${fecha.getUTCFullYear()}${mm}${dd}`;
}

async function pedirJson(url: string): Promise<unknown> {
  // fetch con timeout y límite de tamaño (ver src/lib/fetchExterno.ts).
  const res = await fetchTextoExterno(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new JornadaFetchError(
      `SELAE respondió ${res.status} en ${url.replace(BASE, '')}.`,
      `HTTP ${res.status} ${res.statusText}. La fuente puede estar bloqueando peticiones automatizadas (Akamai).`,
    );
  }
  const texto = res.texto;
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new JornadaFetchError(
      'SELAE no devolvió JSON válido (posible página de bloqueo).',
      texto.slice(0, 200),
    );
  }
  // Estos endpoints devuelven un string cuando no hay datos o los parámetros fallan.
  if (typeof json === 'string') {
    throw new JornadaFetchError('SELAE no devolvió datos para la consulta.', json);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Cabecera del próximo sorteo (SELAE, proximosv3)
// ---------------------------------------------------------------------------

export interface CabeceraSorteo {
  numeroJornada: number | null;
  anyo: string | null;
  fechaCierre: string | null;
  fechaSorteo: string | null;
  fechaSorteoYmd: string | null;
  idSorteo: string | null;
}

function parseaCabecera(data: unknown): CabeceraSorteo {
  const arr = Array.isArray(data) ? data : [data];
  const primero = arr.find((x) => x && typeof x === 'object') as
    | Record<string, unknown>
    | undefined;
  if (!primero) throw new JornadaFetchError('SELAE no devolvió ningún sorteo próximo.');

  const jornadaNum = primerCampo(primero, ['jornada', 'numeroJornada', 'numero']);
  const fechaRaw = primerCampo(primero, ['fecha', 'fecha_sorteo', 'fechaSorteo']);
  return {
    numeroJornada:
      typeof jornadaNum === 'number'
        ? jornadaNum
        : typeof jornadaNum === 'string' && /^\d+$/.test(jornadaNum)
          ? parseInt(jornadaNum, 10)
          : null,
    anyo: (primerCampo(primero, ['anyo', 'anio']) as string | undefined) ?? null,
    fechaCierre: aIso(primerCampo(primero, ['cierre', 'fechaCierre'])),
    fechaSorteo: aIso(fechaRaw),
    fechaSorteoYmd: aYmd(fechaRaw),
    idSorteo:
      (primerCampo(primero, ['id_sorteo', 'idSorteo']) as string | number | undefined)
        ?.toString() ?? null,
  };
}

/** Solo la cabecera (diagnóstico y script de prueba). */
export async function obtenerCabeceraJornada(): Promise<CabeceraSorteo> {
  return parseaCabecera(await pedirJson(`${BASE}/proximosv3?game_id=LAQU&num=1`));
}

// ---------------------------------------------------------------------------
// Partidos desde SELAE (respaldo; solo jornadas ya publicadas/celebradas)
// ---------------------------------------------------------------------------

const CLAVES_LOCAL = ['local', 'equipoLocal', 'equipo1', 'nombreLocal'];
const CLAVES_VISITANTE = ['visitante', 'equipoVisitante', 'equipo2', 'nombreVisitante'];
const CLAVES_ORDEN = ['posicion', 'orden', 'numero', 'num', 'idx'];

function buscaArrayPartidos(nodo: unknown, prof = 0): Record<string, unknown>[] | null {
  if (prof > 6 || nodo === null || typeof nodo !== 'object') return null;
  if (Array.isArray(nodo)) {
    const objetos = nodo.filter(
      (x) => x && typeof x === 'object' && !Array.isArray(x),
    ) as Record<string, unknown>[];
    if (
      objetos.length >= 14 &&
      objetos.length <= 16 &&
      objetos.every(
        (o) =>
          primerCampo(o, CLAVES_LOCAL) !== undefined &&
          primerCampo(o, CLAVES_VISITANTE) !== undefined,
      )
    ) {
      return objetos;
    }
    for (const item of nodo) {
      const r = buscaArrayPartidos(item, prof + 1);
      if (r) return r;
    }
    return null;
  }
  for (const v of Object.values(nodo as Record<string, unknown>)) {
    const r = buscaArrayPartidos(v, prof + 1);
    if (r) return r;
  }
  return null;
}

function extraePartidosSelae(sorteo: Record<string, unknown>): PartidoJornada[] {
  const arr =
    Array.isArray(sorteo.partidos) &&
    (sorteo.partidos as unknown[]).every((p) => p && typeof p === 'object')
      ? (sorteo.partidos as Record<string, unknown>[])
      : buscaArrayPartidos(sorteo);

  if (!arr) {
    throw new JornadaFetchError(
      'No se encontró la lista de partidos en la respuesta de SELAE.',
    );
  }

  const partidos = arr.map((o, i) => {
    const ordenRaw = primerCampo(o, CLAVES_ORDEN);
    const numero =
      typeof ordenRaw === 'number'
        ? ordenRaw
        : typeof ordenRaw === 'string' && /^\d+$/.test(ordenRaw.trim())
          ? parseInt(ordenRaw.trim(), 10)
          : i + 1;
    return {
      numero,
      local: normalizaNombre(primerCampo(o, CLAVES_LOCAL)),
      visitante: normalizaNombre(primerCampo(o, CLAVES_VISITANTE)),
    };
  });

  partidos.sort((a, b) => a.numero - b.numero);
  return partidos.map((p, i) => ({
    numero: i + 1,
    local: p.local,
    visitante: p.visitante,
    esPleno: i + 1 === 15,
  }));
}

async function buscarSorteos(
  ymdInicio: string,
  ymdFin: string,
  celebrados: boolean,
): Promise<Record<string, unknown>[]> {
  const url =
    `${BASE}/buscadorSorteos?game_id=LAQU&celebrados=${celebrados}` +
    `&fechaInicioInclusiva=${ymdInicio}&fechaFinInclusiva=${ymdFin}`;
  const data = await pedirJson(url);
  const arr = Array.isArray(data) ? data : [data];
  return arr.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
}

/** Intenta los partidos de la jornada de la cabecera vía SELAE (respaldo). */
async function partidosDesdeSelae(cab: CabeceraSorteo): Promise<PartidoJornada[]> {
  if (!cab.fechaSorteoYmd) {
    throw new JornadaFetchError('SELAE no indicó la fecha del próximo sorteo.');
  }
  const inicio = ymdMasDias(cab.fechaSorteoYmd, -6);
  const fin = ymdMasDias(cab.fechaSorteoYmd, 2);

  let sorteos: Record<string, unknown>[] = [];
  for (const celebrados of [false, true]) {
    try {
      const r = await buscarSorteos(inicio, fin, celebrados);
      if (r.length) {
        sorteos = r;
        break;
      }
    } catch {
      /* seguimos probando */
    }
  }

  const objetivo =
    sorteos.find((s) => cab.idSorteo && String(s.id_sorteo) === cab.idSorteo) ??
    sorteos.find((s) => Array.isArray(s.partidos) && (s.partidos as unknown[]).length >= 14);

  if (!objetivo) {
    throw new JornadaFetchError(
      'SELAE no publica todavía los partidos de la jornada abierta.',
    );
  }
  return extraePartidosSelae(objetivo);
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

function nombreJornada(cab: CabeceraSorteo | null): string {
  if (cab?.numeroJornada != null) {
    return `Jornada ${cab.numeroJornada}${cab.anyo ? ` - ${cab.anyo}` : ''}`;
  }
  return 'Jornada actual de La Quiniela';
}

/**
 * Obtiene la jornada actual (la próxima abierta a apuestas) con sus 15 partidos.
 * Lanza JornadaFetchError si ninguna fuente responde: entonces toca el
 * formulario manual del panel de admin.
 */
export async function obtenerJornadaActual(
  opts: { usarCache?: boolean } = {},
): Promise<JornadaObtenida> {
  const usarCache = opts.usarCache ?? true;
  const CLAVE = 'jornada-actual';
  if (usarCache) {
    const cacheada = cacheGet<JornadaObtenida>(CLAVE);
    if (cacheada) return cacheada;
  }

  // 1) Cabecera de SELAE: mejor esfuerzo, no es bloqueante.
  let cab: CabeceraSorteo | null = null;
  let errorCabecera: string | null = null;
  try {
    cab = await obtenerCabeceraJornada();
  } catch (e) {
    errorCabecera = e instanceof JornadaFetchError ? e.message : String(e);
  }

  // 2) Partidos: Mundo Deportivo (primaria) -> SELAE (respaldo).
  const errores: string[] = [];
  let partidos: PartidoJornada[] | null = null;
  let fuente: FuentePartidos = 'MUNDO_DEPORTIVO';
  let celebrada = false;

  try {
    partidos = await obtenerPartidosMundoDeportivo();
  } catch (e) {
    errores.push(
      `Mundo Deportivo: ${e instanceof JornadaFetchError ? e.message : String(e)}`,
    );
  }

  if (!partidos && cab) {
    try {
      partidos = await partidosDesdeSelae(cab);
      fuente = 'SELAE';
      celebrada = true;
    } catch (e) {
      errores.push(`SELAE: ${e instanceof JornadaFetchError ? e.message : String(e)}`);
    }
  }

  if (!partidos) {
    if (errorCabecera) errores.push(`Cabecera SELAE: ${errorCabecera}`);
    throw new JornadaFetchError(
      'No se pudieron obtener los 15 partidos de la jornada.',
      `${errores.join(' | ')}. Usa el formulario manual del panel de administración.`,
    );
  }

  const resultado: JornadaObtenida = {
    jornada: nombreJornada(cab),
    numeroJornada: cab?.numeroJornada ?? null,
    fechaCierre: cab?.fechaCierre ?? null,
    fechaSorteo: cab?.fechaSorteo ?? null,
    idSorteo: cab?.idSorteo ?? null,
    celebrada,
    fuente,
    partidos,
  };

  const parsed = jornadaValidada.safeParse(resultado);
  if (!parsed.success) {
    throw new JornadaFetchError(
      'Los datos obtenidos no superaron la validación.',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }

  cacheSet(CLAVE, parsed.data, TTL_JORNADA_MS);
  return parsed.data;
}

/**
 * Última jornada disponible en SELAE con sus 15 partidos (retrocede por
 * ventanas de fechas). Se usa como diagnóstico en el script de prueba.
 */
export async function obtenerUltimaJornadaConPartidos(
  hoyYmd: string,
): Promise<JornadaObtenida> {
  const errores: string[] = [];
  for (let i = 0; i < 6; i++) {
    const fin = ymdMasDias(hoyYmd, -i * 20);
    const inicio = ymdMasDias(fin, -25);
    try {
      const sorteos = await buscarSorteos(inicio, fin, true);
      const conPartidos = sorteos
        .filter((s) => Array.isArray(s.partidos) && (s.partidos as unknown[]).length >= 14)
        .sort((a, b) =>
          String(b.fecha_sorteo ?? '').localeCompare(String(a.fecha_sorteo ?? '')),
        );
      if (conPartidos.length) {
        const s = conPartidos[0];
        const numero =
          typeof s.jornada === 'number'
            ? s.jornada
            : typeof s.jornada === 'string' && /^\d+$/.test(s.jornada)
              ? parseInt(s.jornada, 10)
              : null;
        const anyo = typeof s.anyo === 'string' ? s.anyo : null;
        const resultado: JornadaObtenida = {
          jornada: numero != null ? `Jornada ${numero}${anyo ? ` - ${anyo}` : ''}` : 'Jornada',
          numeroJornada: numero,
          fechaCierre: null,
          fechaSorteo: aIso(s.fecha_sorteo),
          idSorteo: s.id_sorteo != null ? String(s.id_sorteo) : null,
          celebrada: true,
          fuente: 'SELAE',
          partidos: extraePartidosSelae(s),
        };
        return jornadaValidada.parse(resultado);
      }
    } catch (e) {
      errores.push(e instanceof JornadaFetchError ? e.message : String(e));
    }
  }
  throw new JornadaFetchError(
    'No se encontró ninguna jornada con partidos en SELAE.',
    errores.join(' | '),
  );
}

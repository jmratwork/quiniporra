import { z } from 'zod';
import { cacheGet, cacheSet, TTL_JORNADA_MS } from './cache';

/**
 * Obtención automática de la jornada actual de La Quiniela desde la web
 * oficial de Loterías y Apuestas del Estado (SELAE).
 *
 * ESTRUCTURA REAL DE LOS ENDPOINTS (inspeccionada en desarrollo, 2026-07):
 *
 *  - GET /servicios/proximosv3?game_id=LAQU&num=N
 *      Devuelve un array con la CABECERA de los próximos sorteos (jornada
 *      abierta a apuestas): { fecha, cierre, id_sorteo, anyo, jornada, ... }.
 *      NO incluye los emparejamientos.
 *
 *  - GET /servicios/buscadorSorteos?game_id=LAQU&celebrados=<bool>
 *        &fechaInicioInclusiva=AAAAMMDD&fechaFinInclusiva=AAAAMMDD
 *      IMPORTANTE: las fechas son de 8 dígitos (AAAAMMDD), no llevan hora.
 *      Devuelve un array de sorteos, cada uno con la lista `partidos` (15):
 *        { posicion, idLocal, local, idVisitante, visitante, signo, marcador, ... }
 *      Es la fuente de los 15 emparejamientos.
 *
 * LIMITACIÓN REAL: `buscadorSorteos` solo devuelve jornadas cuyos partidos ya
 * están publicados (habitualmente jornadas celebradas o muy próximas). Si la
 * jornada abierta aún no tiene sus partidos publicados, no se encuentran y el
 * flujo cae al FALLBACK MANUAL del panel de admin.
 *
 * NOTA sobre bloqueos: estos endpoints exigen cabeceras de navegador
 * (User-Agent, Accept, Referer). El `fetch` de Node.js las envía y suele pasar
 * la protección Akamai; algunos clientes (p. ej. curl) pueden recibir 403.
 * La petición se hace SIEMPRE en servidor, nunca desde el navegador.
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

export class JornadaFetchError extends Error {
  constructor(
    message: string,
    public readonly detalle?: string,
  ) {
    super(message);
    this.name = 'JornadaFetchError';
  }
}

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

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
  partidos: PartidoJornada[]; // exactamente 15
}

// ---------------------------------------------------------------------------
// Validación estricta del resultado final
// ---------------------------------------------------------------------------

const jornadaValidada = z.object({
  jornada: z.string().min(1),
  numeroJornada: z.number().int().positive().nullable(),
  fechaCierre: z.string().nullable(),
  fechaSorteo: z.string().nullable(),
  idSorteo: z.string().nullable(),
  celebrada: z.boolean(),
  partidos: z
    .array(
      z.object({
        numero: z.number().int().min(1).max(15),
        local: z.string().min(1),
        visitante: z.string().min(1),
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
  return v.replace(/\s+/g, ' ').trim();
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

/** Extrae "AAAAMMDD" de una fecha "2026-07-12 ..." sin desfase de zona horaria. */
function aYmd(fechaRaw: unknown): string | null {
  if (typeof fechaRaw !== 'string') return null;
  const m = fechaRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** Suma días a una fecha "AAAAMMDD" (aritmética en UTC). */
function ymdMasDias(ymd: string, dias: number): string {
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const fecha = new Date(Date.UTC(y, mo - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const yy = fecha.getUTCFullYear();
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

async function pedirJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSER_HEADERS,
      // Next 15: fetch ya no cachea por defecto; lo hacemos explícito.
      cache: 'no-store',
    });
  } catch (e) {
    throw new JornadaFetchError(
      'No se pudo conectar con la web de SELAE.',
      e instanceof Error ? e.message : String(e),
    );
  }
  if (!res.ok) {
    throw new JornadaFetchError(
      `SELAE respondió ${res.status} en ${url.replace(BASE, '')}.`,
      `HTTP ${res.status} ${res.statusText}. La fuente puede estar bloqueando peticiones automatizadas (Akamai).`,
    );
  }
  const texto = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new JornadaFetchError(
      'SELAE no devolvió JSON válido (posible página de bloqueo).',
      texto.slice(0, 200),
    );
  }
  // Los endpoints devuelven un string cuando no hay datos o hay un error de parámetros.
  if (typeof json === 'string') {
    throw new JornadaFetchError('SELAE no devolvió datos para la consulta.', json);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Paso 1: cabecera del próximo sorteo (proximosv3)
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
  if (!primero) {
    throw new JornadaFetchError('SELAE no devolvió ningún sorteo próximo.');
  }
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

// ---------------------------------------------------------------------------
// Paso 2: los 15 partidos (buscadorSorteos)
// ---------------------------------------------------------------------------

const CLAVES_LOCAL = ['local', 'equipoLocal', 'equipo1', 'nombreLocal'];
const CLAVES_VISITANTE = ['visitante', 'equipoVisitante', 'equipo2', 'nombreVisitante'];
const CLAVES_ORDEN = ['posicion', 'orden', 'numero', 'num', 'idx'];

/** Busca recursivamente un array que parezca la lista de partidos. */
function buscaArrayPartidos(
  nodo: unknown,
  prof = 0,
): Record<string, unknown>[] | null {
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

/** Extrae y normaliza los 15 partidos de un objeto sorteo de buscadorSorteos. */
function extraePartidos(sorteo: Record<string, unknown>): PartidoJornada[] {
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
      esPleno: false,
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

/** Consulta buscadorSorteos en un rango de fechas (AAAAMMDD). */
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

// ---------------------------------------------------------------------------
// Construcción del resultado
// ---------------------------------------------------------------------------

function construyeJornada(
  cab: CabeceraSorteo,
  sorteo: Record<string, unknown>,
  celebrada: boolean,
): JornadaObtenida {
  const partidos = extraePartidos(sorteo);
  const numero =
    cab.numeroJornada ??
    (typeof sorteo.jornada === 'number'
      ? sorteo.jornada
      : typeof sorteo.jornada === 'string' && /^\d+$/.test(sorteo.jornada)
        ? parseInt(sorteo.jornada, 10)
        : null);
  const anyo =
    cab.anyo ?? (typeof sorteo.anyo === 'string' ? sorteo.anyo : null);

  const resultado: JornadaObtenida = {
    jornada:
      numero != null
        ? `Jornada ${numero}${anyo ? ` - ${anyo}` : ''}`
        : `Jornada de La Quiniela${anyo ? ` - ${anyo}` : ''}`,
    numeroJornada: numero,
    fechaCierre: cab.fechaCierre,
    fechaSorteo: cab.fechaSorteo ?? aIso(sorteo.fecha_sorteo),
    idSorteo:
      cab.idSorteo ??
      (sorteo.id_sorteo != null ? String(sorteo.id_sorteo) : null),
    celebrada,
    partidos,
  };

  const parsed = jornadaValidada.safeParse(resultado);
  if (!parsed.success) {
    throw new JornadaFetchError(
      'Los datos obtenidos de SELAE no superaron la validación.',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// API pública del módulo
// ---------------------------------------------------------------------------

/**
 * Obtiene la jornada actual (la próxima abierta a apuestas) de La Quiniela.
 * Lanza JornadaFetchError si la fuente falla o los partidos aún no están
 * publicados (en ese caso, el flujo debe usar el fallback manual).
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

  // Paso 1: cabecera de la próxima jornada abierta.
  const cab = parseaCabecera(await pedirJson(`${BASE}/proximosv3?game_id=LAQU&num=1`));

  if (!cab.fechaSorteoYmd) {
    throw new JornadaFetchError('SELAE no indicó la fecha del próximo sorteo.');
  }

  // Paso 2: buscar los partidos de esa jornada en una ventana alrededor de su fecha.
  const inicio = ymdMasDias(cab.fechaSorteoYmd, -6);
  const fin = ymdMasDias(cab.fechaSorteoYmd, 2);

  const errores: string[] = [];
  let sorteos: Record<string, unknown>[] = [];
  for (const celebrados of [false, true]) {
    try {
      const r = await buscarSorteos(inicio, fin, celebrados);
      if (r.length) {
        sorteos = r;
        break;
      }
    } catch (e) {
      errores.push(e instanceof JornadaFetchError ? e.message : String(e));
    }
  }

  // Preferimos el sorteo cuyo id_sorteo coincide con el de la cabecera.
  const objetivo =
    sorteos.find((s) => cab.idSorteo && String(s.id_sorteo) === cab.idSorteo) ??
    sorteos.find(
      (s) => Array.isArray(s.partidos) && (s.partidos as unknown[]).length >= 14,
    );

  if (!objetivo) {
    throw new JornadaFetchError(
      'Los partidos de la jornada abierta aún no están publicados en SELAE.',
      `Cabecera obtenida (jornada ${cab.numeroJornada}, cierre ${cab.fechaCierre}), ` +
        `pero buscadorSorteos no devolvió sus 15 partidos. ${errores.join(' | ')} ` +
        'Usa el formulario manual del panel de administración.',
    );
  }

  const resultado = construyeJornada(cab, objetivo, false);
  cacheSet(CLAVE, resultado, TTL_JORNADA_MS);
  return resultado;
}

/** Solo la cabecera (diagnóstico y script de prueba). */
export async function obtenerCabeceraJornada(): Promise<CabeceraSorteo> {
  return parseaCabecera(await pedirJson(`${BASE}/proximosv3?game_id=LAQU&num=1`));
}

/**
 * Obtiene la última jornada disponible en SELAE con sus 15 partidos (busca
 * hacia atrás por rangos de fechas). Se usa en el script de prueba para
 * demostrar el parser con datos reales aunque la jornada abierta todavía no
 * tenga partidos publicados.
 */
export async function obtenerUltimaJornadaConPartidos(
  hoyYmd: string,
): Promise<JornadaObtenida> {
  const errores: string[] = [];
  // Retrocede en ventanas de ~20 días hasta encontrar sorteos con partidos.
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
        const cabFalsa: CabeceraSorteo = {
          numeroJornada:
            typeof s.jornada === 'number'
              ? s.jornada
              : typeof s.jornada === 'string' && /^\d+$/.test(s.jornada)
                ? parseInt(s.jornada, 10)
                : null,
          anyo: typeof s.anyo === 'string' ? s.anyo : null,
          fechaCierre: null,
          fechaSorteo: aIso(s.fecha_sorteo),
          fechaSorteoYmd: aYmd(s.fecha_sorteo),
          idSorteo: s.id_sorteo != null ? String(s.id_sorteo) : null,
        };
        return construyeJornada(cabFalsa, s, true);
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

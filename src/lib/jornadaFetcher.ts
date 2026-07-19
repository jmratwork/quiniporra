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

/**
 * Minutos que la hora local de Europe/Madrid va por delante de UTC en un
 * instante dado (60 en invierno CET, 120 en verano CEST).
 */
function offsetMadridMin(utcMs: number): number {
  const d = new Date(utcMs);
  const enMadrid = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const enUtc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((enMadrid.getTime() - enUtc.getTime()) / 60000);
}

/** Interpreta unos componentes naive como hora de España y devuelve ISO UTC. */
function naiveMadridAIso(
  Y: number,
  Mo: number,
  D: number,
  h: number,
  mi: number,
  se: number,
): string | null {
  // Rechaza valores fuera de rango (fechas inválidas).
  if (Mo < 1 || Mo > 12 || D < 1 || D > 31 || h > 23 || mi > 59 || se > 59) return null;
  const utcGuess = Date.UTC(Y, Mo - 1, D, h, mi, se);
  if (Number.isNaN(utcGuess)) return null;
  const real = utcGuess - offsetMadridMin(utcGuess) * 60000;
  const d = new Date(real);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Convierte una fecha de SELAE a ISO 8601 (UTC), o null si es nula/inválida.
 * Contempla: fechas ya con zona horaria (Z/±hh:mm), fechas naive sin zona
 * ("YYYY-MM-DD HH:MM:SS", interpretadas como hora de España) y solo-fecha.
 */
export function aIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '') return null;

  // Ya trae zona horaria explícita -> se respeta.
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Naive con hora: "YYYY-MM-DD HH:MM[:SS]" o con "T".
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return naiveMadridAIso(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  }

  // Solo fecha: "YYYY-MM-DD" -> medianoche de España.
  const md = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (md) return naiveMadridAIso(+md[1], +md[2], +md[3], 0, 0, 0);

  // Último recurso: que lo intente Date (formatos raros); null si no cuela.
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

/** Lista (segura) de claves de un objeto: solo nombres, nunca valores. */
function clavesDe(o: object): string {
  const ks = Object.keys(o as Record<string, unknown>);
  return ks.slice(0, 20).join(',') + (ks.length > 20 ? `…(+${ks.length - 20})` : '');
}

/** Descripción SEGURA de la forma de una respuesta: tipo, tamaño y claves. */
function describeForma(json: unknown): string {
  if (Array.isArray(json)) {
    const primero = json.find((x) => x && typeof x === 'object' && !Array.isArray(x));
    return `array(${json.length})${primero ? ` claves[0]: ${clavesDe(primero)}` : ''}`;
  }
  if (json && typeof json === 'object') return `objeto claves: ${clavesDe(json)}`;
  return `tipo ${typeof json}`;
}

async function pedirJson(url: string): Promise<unknown> {
  const ruta = url.replace(BASE, '');
  // fetch con timeout y límite de tamaño (ver src/lib/fetchExterno.ts).
  const res = await fetchTextoExterno(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    // Registro seguro: solo el estado, nunca el cuerpo.
    console.warn(`[jornadaFetcher] GET ${ruta} -> HTTP ${res.status} ${res.statusText}`);
    throw new JornadaFetchError(
      `SELAE respondió ${res.status} en ${ruta}.`,
      `HTTP ${res.status} ${res.statusText}. La fuente puede estar bloqueando peticiones automatizadas (Akamai).`,
    );
  }
  const texto = res.texto;
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    console.warn(`[jornadaFetcher] GET ${ruta} -> ${res.status} pero JSON no válido`);
    throw new JornadaFetchError(
      'SELAE no devolvió JSON válido (posible página de bloqueo).',
      texto.slice(0, 200),
    );
  }
  // Estos endpoints devuelven un string cuando no hay datos o los parámetros fallan.
  if (typeof json === 'string') {
    console.warn(`[jornadaFetcher] GET ${ruta} -> ${res.status} string: "${json.slice(0, 80)}"`);
    throw new JornadaFetchError('SELAE no devolvió datos para la consulta.', json);
  }
  // Registro seguro de la forma (estado, tipo JSON y CLAVES reales; sin valores).
  console.info(`[jornadaFetcher] GET ${ruta} -> ${res.status}; ${describeForma(json)}`);
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

// Variantes de nombres de campo (SELAE cambia formato sin avisar).
const CLAVES_JORNADA = [
  'jornada',
  'numeroJornada',
  'numero_jornada',
  'numJornada',
  'num_jornada',
  'nroJornada',
];
const CLAVES_ANYO = ['anyo', 'anio', 'año', 'year', 'temporada'];
const CLAVES_CIERRE = [
  'cierre',
  'fechaCierre',
  'fecha_cierre',
  'fechacierre',
  'cierreApuestas',
  'fecha_fin',
  'fechaFin',
];
const CLAVES_FECHA = [
  'fecha',
  'fecha_sorteo',
  'fechaSorteo',
  'fechaCelebracion',
  'fecha_celebracion',
];
const CLAVES_ID = ['id_sorteo', 'idSorteo', 'idsorteo', 'id'];

/** Busca una clave en el objeto y, si no está, en sus objetos anidados. */
function primerCampoProfundo(
  obj: Record<string, unknown>,
  claves: string[],
  prof = 0,
): unknown {
  const directo = primerCampo(obj, claves);
  if (directo !== undefined) return directo;
  if (prof >= 3) return undefined;
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const r = primerCampoProfundo(v as Record<string, unknown>, claves, prof + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

/** ¿Este objeto parece la cabecera de un sorteo (tiene jornada/cierre/fecha/id)? */
function pareceSorteo(obj: Record<string, unknown>): boolean {
  return (
    primerCampo(obj, CLAVES_JORNADA) !== undefined ||
    primerCampo(obj, CLAVES_CIERRE) !== undefined ||
    primerCampo(obj, CLAVES_FECHA) !== undefined ||
    primerCampo(obj, CLAVES_ID) !== undefined
  );
}

/**
 * Localiza el objeto "sorteo" en una respuesta que puede venir como array de
 * objetos (proximosv3), objeto único, o envuelto en una clave (p. ej.
 * { data: [...] }, { sorteos: [...] }, { resultado: {...} }).
 */
function localizaSorteo(data: unknown, prof = 0): Record<string, unknown> | null {
  if (prof > 5 || data === null || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const it of data) {
      const r = localizaSorteo(it, prof + 1);
      if (r) return r;
    }
    return null;
  }
  const obj = data as Record<string, unknown>;
  if (pareceSorteo(obj)) return obj;
  for (const v of Object.values(obj)) {
    const r = localizaSorteo(v, prof + 1);
    if (r) return r;
  }
  return null;
}

/** Convierte un valor a entero positivo, o null. */
function aEntero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

/**
 * Parsea la cabecera del sorteo de forma robusta: admite objetos anidados y
 * varias variantes de nombres de campo (numero_jornada, fecha_cierre, …).
 * Exportada para pruebas unitarias.
 */
export function parseaCabecera(data: unknown): CabeceraSorteo {
  const sorteo = localizaSorteo(data);
  if (!sorteo) {
    console.warn(
      `[jornadaFetcher] cabecera SELAE: no se encontró ningún sorteo; ${describeForma(data)}`,
    );
    throw new JornadaFetchError('SELAE no devolvió ningún sorteo próximo.');
  }

  const numeroJornada = aEntero(primerCampoProfundo(sorteo, CLAVES_JORNADA));
  const fechaCierre = aIso(primerCampoProfundo(sorteo, CLAVES_CIERRE));
  const fechaRaw = primerCampoProfundo(sorteo, CLAVES_FECHA);
  const anyoRaw = primerCampoProfundo(sorteo, CLAVES_ANYO);
  const idRaw = primerCampoProfundo(sorteo, CLAVES_ID);

  // Aviso de diagnóstico si falta lo esencial (claves reales, sin valores).
  if (numeroJornada === null || fechaCierre === null) {
    console.warn(
      `[jornadaFetcher] cabecera SELAE incompleta ` +
        `(numeroJornada=${numeroJornada}, fechaCierre=${fechaCierre === null ? 'null' : 'ok'}); ` +
        `claves reales: ${clavesDe(sorteo)}`,
    );
  }

  return {
    numeroJornada,
    anyo: anyoRaw != null ? String(anyoRaw) : null,
    fechaCierre,
    fechaSorteo: aIso(fechaRaw),
    fechaSorteoYmd: aYmd(fechaRaw),
    idSorteo: idRaw != null ? String(idRaw) : null,
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

  // No creamos una jornada "genérica": exigimos número de jornada y fecha de
  // cierre reales de la cabecera. Si faltan, error EXPLÍCITO y REINTENTABLE
  // (el cron lo reintenta; el admin puede usar el formulario manual).
  if (!cab || cab.numeroJornada === null || cab.fechaCierre === null) {
    throw new JornadaFetchError(
      'No se pudo determinar el número de jornada y la fecha de cierre desde SELAE.',
      `${errorCabecera ? `Cabecera: ${errorCabecera}. ` : ''}` +
        `numeroJornada=${cab?.numeroJornada ?? 'null'}, fechaCierre=${cab?.fechaCierre ?? 'null'}. ` +
        'Reintentable en el siguiente disparo del cron; si persiste, usa el formulario manual.',
    );
  }

  const resultado: JornadaObtenida = {
    jornada: nombreJornada(cab),
    numeroJornada: cab.numeroJornada,
    fechaCierre: cab.fechaCierre,
    fechaSorteo: cab.fechaSorteo,
    idSorteo: cab.idSorteo,
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

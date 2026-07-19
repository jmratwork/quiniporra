import { JornadaFetchError } from './errors';
import { fetchTextoExterno } from './fetchExterno';
import { fechaCierreDesdeDiaSemana } from './fechas';

/**
 * Obtención de los 15 partidos del boleto VIGENTE de La Quiniela desde la
 * página pública de Mundo Deportivo.
 *
 * ¿Por qué esta fuente? Los endpoints JSON de SELAE (`proximosv3`,
 * `buscadorSorteos`) NO publican los emparejamientos de la jornada abierta a
 * apuestas: solo la cabecera (número de jornada, fechas) y, en el caso de
 * `buscadorSorteos`, los partidos de jornadas ya celebradas. Mundo Deportivo
 * sí publica el boleto en curso, así que es la fuente de los 15 partidos.
 *
 * La página NO es una API legible por máquina, así que el parser es
 * deliberadamente defensivo. La estructura real (comprobada) tiene dos bloques:
 *
 *   Bloque 1 (tabla compacta) — la posición va en la línea SIGUIENTE:
 *       "ESPAÑA - BÉLGICA"
 *       "1"
 *     Este bloque suele omitir el Pleno al 15.
 *
 *   Bloque 2 (fichas detalladas) — la posición va en la línea ANTERIOR con punto:
 *       "15."
 *       "SARPSBORG - VIKING"
 *     Aquí sí aparece el Pleno al 15.
 *
 * Por eso se busca la posición en este orden: misma línea → línea anterior con
 * punto ("15.") → línea siguiente numérica → vecindad ampliada. Buscar primero
 * hacia delante sin más daría falsos positivos (los botones "1 / X / 2" y los
 * porcentajes son números sueltos).
 *
 * La petición se hace siempre en servidor, nunca desde el navegador.
 */

export const MUNDO_DEPORTIVO_QUINIELA_URL =
  'https://www.mundodeportivo.com/servicios/quiniela';

export interface PartidoBoleto {
  numero: number; // 1..15
  local: string;
  visitante: string;
  esPleno: boolean; // numero === 15
}

const TOTAL = 15;
const RUIDO = ['POLITICA', 'TERMINOS', 'COOKIES', 'PUBLICIDAD', 'AVISO'];

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

function desescapaHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** Convierte el HTML en líneas de texto limpias. */
export function htmlALineas(html: string): string[] {
  let t = desescapaHtml(html);
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '\n');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|li|td|tr|h\d|span)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');

  const lineas: string[] = [];
  for (const bruta of t.split(/\r?\n/)) {
    const linea = bruta.replace(/\s+/g, ' ').trim();
    if (linea && linea !== '* * *' && !/^[.\s]+$/.test(linea)) lineas.push(linea);
  }
  return lineas;
}

/**
 * Saneado defensivo del nombre de equipo antes de guardarlo/mostrarlo.
 *
 * El texto viene de una página remota y acaba en la base de datos, en la UI y
 * en el PDF: eliminamos caracteres de control y ángulos, colapsamos espacios y
 * limitamos la longitud. Ningún marcado ni carga oculta debe viajar dentro de
 * un "nombre de equipo".
 */
export function limpiaNombreEquipo(nombre: string, maxLen = 48): string {
  let s = desescapaHtml(String(nombre));
  // Elimina: controles ASCII, DEL, ángulos, y caracteres Unicode invisibles /
  // bidireccionales (soft hyphen, zero-width, marcas de dirección, LRO/RLO,
  // aislantes, BOM) que podrían usarse para inyección indirecta o Trojan Source.
  s = s.replace(
    /[\x00-\x1f\x7f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff<>]/g,
    ' ',
  );
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, maxLen);
}

/** "ESPAÑA" -> "España"; "IFK MARIEHAMN" -> "Ifk Mariehamn". */
export function capitaliza(nombre: string): string {
  return nombre
    .toLocaleLowerCase('es-ES')
    .replace(/(^|[\s\-'/.])([\p{L}\p{N}])/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase('es-ES'));
}

/** Clave de deduplicación insensible a mayúsculas/acentos. */
function claveEquipos(local: string, visitante: string): string {
  const norm = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  return `${norm(local)}|${norm(visitante)}`;
}

// ---------------------------------------------------------------------------
// Detección de partidos y posiciones
// ---------------------------------------------------------------------------

/** ¿La línea parece un emparejamiento "Local - Visitante"? */
export function pareceUnPartido(linea: string): boolean {
  if (!linea.includes(' - ') || linea.length > 80) return false;
  const up = linea.toUpperCase();
  if (RUIDO.some((r) => up.includes(r))) return false;
  const i = linea.indexOf(' - ');
  const local = linea.slice(0, i).trim();
  const visitante = linea.slice(i + 3).trim();
  return local.length >= 2 && visitante.length >= 2;
}

const enRango = (n: number) => Number.isInteger(n) && n >= 1 && n <= TOTAL;

/**
 * Extrae la posición cuando viene en la propia línea:
 *   "15 Real Madrid - Barcelona", "Real Madrid - Barcelona 15",
 *   "Pleno al 15: Real Madrid - Barcelona".
 */
export function posicionEnMismaLinea(linea: string): [number | null, string] {
  const c = linea.replace(/\s+/g, ' ').trim();

  let m = c.match(/^(\d{1,2})[.)]?\s+(.+?\s+-\s+.+)$/);
  if (m && enRango(Number(m[1]))) return [Number(m[1]), m[2].trim()];

  m = c.match(/^(.+?\s+-\s+.+?)\s+(\d{1,2})$/);
  if (m && enRango(Number(m[2]))) return [Number(m[2]), m[1].trim()];

  if (/PLENO/i.test(c) && c.includes('15') && c.includes(' - ')) {
    const texto = c
      .replace(/pleno\s*(al)?\s*15/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s:\-]+|[\s:\-]+$/g, '');
    if (texto.includes(' - ')) return [15, texto];
  }
  return [null, c];
}

/**
 * Busca la posición en las líneas vecinas.
 * Orden deliberado: "15." anterior → número siguiente → número anterior →
 * vecindad ampliada. Ver la nota de cabecera del módulo.
 */
export function posicionCercana(lineas: string[], i: number): number | null {
  const anterior = (lineas[i - 1] ?? '').trim();
  const siguiente = (lineas[i + 1] ?? '').trim();

  const conPunto = anterior.match(/^(\d{1,2})[.)]$/);
  if (conPunto && enRango(Number(conPunto[1]))) return Number(conPunto[1]);

  if (/^\d{1,2}$/.test(siguiente) && enRango(Number(siguiente))) return Number(siguiente);
  if (/^\d{1,2}$/.test(anterior) && enRango(Number(anterior))) return Number(anterior);

  for (const dir of [-1, 1]) {
    for (let off = 2; off < 8; off++) {
      const j = i + dir * off;
      if (j < 0 || j >= lineas.length) continue;
      const n = lineas[j].trim();
      const m = n.match(/^(\d{1,2})[.)]?$/);
      if (m && enRango(Number(m[1]))) return Number(m[1]);
      if (/PLENO/i.test(n) && n.includes('15')) return 15;
    }
  }
  return null;
}

/** Parsea el HTML del boleto y devuelve los partidos encontrados (0..15). */
export function parseaBoleto(html: string): PartidoBoleto[] {
  return partidosDeLineas(htmlALineas(html));
}

/** Extrae los partidos a partir de las líneas ya limpias del HTML. */
export function partidosDeLineas(lineas: string[]): PartidoBoleto[] {
  const partidos: PartidoBoleto[] = [];
  const posicionesVistas = new Set<number>();
  const parejasVistas = new Set<string>();

  for (let i = 0; i < lineas.length; i++) {
    const [posLinea, linea] = posicionEnMismaLinea(lineas[i]);
    if (!pareceUnPartido(linea)) continue;

    const numero = posLinea ?? posicionCercana(lineas, i);
    if (numero == null) continue;

    const idx = linea.indexOf(' - ');
    const local = limpiaNombreEquipo(linea.slice(0, idx));
    const visitante = limpiaNombreEquipo(linea.slice(idx + 3));
    if (!local || !visitante) continue;

    const clave = claveEquipos(local, visitante);
    if (posicionesVistas.has(numero) || parejasVistas.has(clave)) continue;

    partidos.push({
      numero,
      local: capitaliza(local),
      visitante: capitaliza(visitante),
      esPleno: numero === TOTAL,
    });
    posicionesVistas.add(numero);
    parejasVistas.add(clave);
  }

  partidos.sort((a, b) => a.numero - b.numero);
  return partidos;
}

// ---------------------------------------------------------------------------
// Cabecera del boleto (jornada, año, cierre) desde Mundo Deportivo
// ---------------------------------------------------------------------------

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function sinTildes(s: string): string {
  return s
    .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export interface CabeceraBoleto {
  numeroJornada: number | null;
  anyo: string | null;
  fechaCierre: string | null; // ISO 8601 o null
}

/**
 * Extrae de las líneas del boleto: número de jornada ("Jornada 73"), año
 * ("2026") y fecha de cierre a partir del "Horario de cierre"
 * ("Viernes 17 (18:00)"), infiriendo la fecha concreta (día de la semana + día
 * del mes) en hora de España. Cualquier campo que no se pueda extraer -> null.
 */
export function parseaCabeceraBoleto(
  lineas: string[],
  ahoraMs: number = Date.now(),
): CabeceraBoleto {
  let numeroJornada: number | null = null;
  let anyo: string | null = null;

  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^jornada\s+(\d{1,3})$/i);
    if (m) {
      numeroJornada = parseInt(m[1], 10);
      const sig = (lineas[i + 1] ?? '').trim();
      if (/^\d{4}$/.test(sig)) anyo = sig;
      break;
    }
  }

  const RE_CIERRE =
    /(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+(\d{1,2})[^)]*\((\d{1,2}):(\d{2})\)/i;
  // Preferimos el cierre general ("Particulares") sobre variantes (DNP…); si no,
  // el primer candidato válido.
  let cierreLinea: string | null = null;
  for (const l of lineas) {
    if (!RE_CIERRE.test(l)) continue;
    if (/particular/i.test(l)) {
      cierreLinea = l;
      break;
    }
    if (cierreLinea === null) cierreLinea = l;
  }

  let fechaCierre: string | null = null;
  if (cierreLinea) {
    const m = cierreLinea.match(RE_CIERRE);
    const wd = m ? DIAS_SEMANA[sinTildes(m[1])] : undefined;
    if (m && wd !== undefined) {
      fechaCierre = fechaCierreDesdeDiaSemana(wd, +m[2], +m[3], +m[4], ahoraMs);
    }
  }

  return { numeroJornada, anyo, fechaCierre };
}

export interface BoletoMundoDeportivo extends CabeceraBoleto {
  partidos: PartidoBoleto[];
}

/**
 * Descarga el boleto vigente de Mundo Deportivo y devuelve la cabecera (número
 * de jornada, año, fecha de cierre) junto con los 15 partidos. Mundo Deportivo
 * es accesible desde Vercel (a diferencia de SELAE, bloqueado por Akamai).
 * Lanza JornadaFetchError si la página falla o no se obtienen los 15 partidos.
 */
export async function obtenerBoletoMundoDeportivo(
  timeoutMs = 25_000,
): Promise<BoletoMundoDeportivo> {
  const res = await fetchTextoExterno(MUNDO_DEPORTIVO_QUINIELA_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
    },
    timeoutMs,
  });

  console.info(`[mundoDeportivo] GET /servicios/quiniela -> ${res.status}`);
  if (!res.ok) {
    throw new JornadaFetchError(
      `Mundo Deportivo respondió ${res.status}.`,
      `HTTP ${res.status} ${res.statusText}`,
    );
  }

  const lineas = htmlALineas(res.texto);
  const partidos = partidosDeLineas(lineas);

  if (partidos.length !== TOTAL) {
    throw new JornadaFetchError(
      `Se esperaban ${TOTAL} partidos y se encontraron ${partidos.length}.`,
      partidos.length === 14
        ? 'La página no publica todavía el Pleno al 15. Usa el formulario manual.'
        : 'La estructura de la página puede haber cambiado. Usa el formulario manual.',
    );
  }

  const esperado = Array.from({ length: TOTAL }, (_, i) => i + 1);
  if (!esperado.every((n, i) => partidos[i]?.numero === n)) {
    throw new JornadaFetchError(
      'Los partidos obtenidos no están numerados del 1 al 15.',
      partidos.map((p) => p.numero).join(','),
    );
  }

  const cabecera = parseaCabeceraBoleto(lineas);
  console.info(
    `[mundoDeportivo] cabecera: jornada=${cabecera.numeroJornada}, anyo=${cabecera.anyo}, ` +
      `cierre=${cabecera.fechaCierre ?? 'null'}`,
  );

  return { ...cabecera, partidos };
}

/**
 * Utilidades de fecha para las fuentes de la jornada.
 *
 * Las fechas de SELAE y Mundo Deportivo vienen en hora local de España sin zona
 * horaria. Como el servidor de Vercel corre en UTC, hay que interpretarlas
 * explícitamente como `Europe/Madrid` (CET/CEST según DST) para no desplazarlas.
 *
 * Vive en su propio módulo para que jornadaFetcher y mundoDeportivo lo compartan
 * sin dependencias circulares.
 */

/** Minutos que Europe/Madrid va por delante de UTC en un instante (60 o 120). */
export function offsetMadridMin(utcMs: number): number {
  const d = new Date(utcMs);
  const enMadrid = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const enUtc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((enMadrid.getTime() - enUtc.getTime()) / 60000);
}

/** Interpreta unos componentes naive como hora de España y devuelve ISO UTC. */
export function naiveMadridAIso(
  Y: number,
  Mo: number,
  D: number,
  h: number,
  mi: number,
  se: number,
): string | null {
  if (Mo < 1 || Mo > 12 || D < 1 || D > 31 || h > 23 || mi > 59 || se > 59) return null;
  const utcGuess = Date.UTC(Y, Mo - 1, D, h, mi, se);
  if (Number.isNaN(utcGuess)) return null;
  const real = utcGuess - offsetMadridMin(utcGuess) * 60000;
  const d = new Date(real);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Convierte una fecha de las fuentes a ISO 8601 (UTC), o null si es nula o
 * inválida. Contempla: fechas con zona horaria (Z/±hh:mm), fechas naive sin
 * zona ("YYYY-MM-DD HH:MM:SS", interpretadas como hora de España) y solo-fecha.
 */
export function aIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '') return null;

  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return naiveMadridAIso(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);

  const md = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (md) return naiveMadridAIso(+md[1], +md[2], +md[3], 0, 0, 0);

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface PartesMadrid {
  anio: number;
  mes: number; // 1-12
  dia: number; // 1-31
  weekday: number; // 0=domingo … 6=sábado
}

const NOMBRE_A_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Componentes (año/mes/día/día-semana) de un instante en hora de Madrid. */
export function enMadridPartes(utcMs: number): PartesMadrid {
  const d = new Date(utcMs);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const val = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(d);
  return {
    anio: Number(val('year')),
    mes: Number(val('month')),
    dia: Number(val('day')),
    weekday: NOMBRE_A_WEEKDAY[wd] ?? 0,
  };
}

/**
 * Dada una descripción parcial de cierre (día de la semana + día del mes +
 * hora), busca la fecha concreta más cercana en el futuro (desde ~3 días antes
 * de `ahoraMs`) que cumpla ambos, en hora de Madrid, y devuelve su ISO. La doble
 * condición "día de la semana + día del mes" hace la inferencia robusta.
 */
export function fechaCierreDesdeDiaSemana(
  weekday: number,
  dia: number,
  hh: number,
  mm: number,
  ahoraMs: number = Date.now(),
): string | null {
  for (let off = -3; off <= 120; off++) {
    const p = enMadridPartes(ahoraMs + off * 86_400_000);
    if (p.dia === dia && p.weekday === weekday) {
      return naiveMadridAIso(p.anio, p.mes, dia, hh, mm, 0);
    }
  }
  return null;
}

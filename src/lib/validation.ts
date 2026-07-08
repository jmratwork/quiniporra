import { z } from 'zod';

/**
 * Validaciones de entrada y del dominio de La Quiniela.
 *
 * - Partidos 1-14: se apuesta con signos de {"1","X","2"}.
 * - Partido 15 (Pleno al 15): se apuestan los goles de cada equipo por
 *   separado, con valores de {"0","1","M"}.
 *
 * La multiplicidad define cuántos signos/valores hay que marcar:
 *   SIMPLE = 1, DOBLE = 2, TRIPLE = 3 (todos).
 */

export const SIGNOS_1X2 = ['1', 'X', '2'] as const;
export const VALORES_PLENO = ['0', '1', 'M'] as const;

export type Signo1X2 = (typeof SIGNOS_1X2)[number];
export type ValorPleno = (typeof VALORES_PLENO)[number];

export const MULTIPLICIDADES = ['SIMPLE', 'DOBLE', 'TRIPLE'] as const;
export type Multiplicidad = (typeof MULTIPLICIDADES)[number];

/** Número de marcas exigidas por multiplicidad. */
export function marcasExigidas(m: Multiplicidad): number {
  switch (m) {
    case 'SIMPLE':
      return 1;
    case 'DOBLE':
      return 2;
    case 'TRIPLE':
      return 3;
  }
}

/**
 * Estructura tipada de los signos apostados.
 * - Para partidos 1-14: { tipo: '1X2', valores: Signo1X2[] }.
 * - Para el pleno (15):  { tipo: 'PLENO', local: ValorPleno[], visitante: ValorPleno[] }.
 */
export const signos1x2Schema = z.object({
  tipo: z.literal('1X2'),
  valores: z.array(z.enum(SIGNOS_1X2)).min(1).max(3),
});

export const signosPlenoSchema = z.object({
  tipo: z.literal('PLENO'),
  local: z.array(z.enum(VALORES_PLENO)).min(1).max(3),
  visitante: z.array(z.enum(VALORES_PLENO)).min(1).max(3),
});

export const signosSchema = z.discriminatedUnion('tipo', [
  signos1x2Schema,
  signosPlenoSchema,
]);

export type Signos = z.infer<typeof signosSchema>;
export type Signos1X2 = z.infer<typeof signos1x2Schema>;
export type SignosPleno = z.infer<typeof signosPlenoSchema>;

function sinDuplicados<T>(arr: readonly T[]): boolean {
  return new Set(arr).size === arr.length;
}

/**
 * Comprueba que unos signos cumplen la multiplicidad exigida para un partido.
 * Devuelve un mensaje de error o null si son válidos.
 */
export function validaSignosContraMultiplicidad(
  signos: Signos,
  multiplicidad: Multiplicidad,
  esPleno: boolean,
): string | null {
  const n = marcasExigidas(multiplicidad);

  if (esPleno) {
    if (signos.tipo !== 'PLENO') {
      return 'El partido 15 (Pleno al 15) requiere valores de goles por equipo.';
    }
    if (signos.local.length !== n || signos.visitante.length !== n) {
      return `El Pleno al 15 con multiplicidad ${multiplicidad} exige ${n} valor(es) por equipo.`;
    }
    if (!sinDuplicados(signos.local) || !sinDuplicados(signos.visitante)) {
      return 'Los valores del Pleno al 15 no pueden repetirse por equipo.';
    }
    return null;
  }

  if (signos.tipo !== '1X2') {
    return 'Los partidos 1-14 requieren signos 1, X o 2.';
  }
  if (signos.valores.length !== n) {
    return `La multiplicidad ${multiplicidad} exige marcar exactamente ${n} signo(s).`;
  }
  if (!sinDuplicados(signos.valores)) {
    return 'No se puede repetir el mismo signo.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Esquemas de las peticiones de la API
// ---------------------------------------------------------------------------

/** Un partido introducido a mano en el formulario de fallback. */
export const partidoManualSchema = z.object({
  numero: z.number().int().min(1).max(15),
  local: z.string().trim().min(1, 'Falta el equipo local').max(80),
  visitante: z.string().trim().min(1, 'Falta el equipo visitante').max(80),
});

/** Cuerpo de POST /api/quiniela/manual */
export const quinielaManualSchema = z.object({
  jornada: z.string().trim().min(1, 'Falta el nombre de la jornada').max(120),
  fechaCierre: z.string().datetime().optional().nullable(),
  partidos: z
    .array(partidoManualSchema)
    .length(15, 'Debe haber exactamente 15 partidos'),
});

export type QuinielaManualInput = z.infer<typeof quinielaManualSchema>;

/** Cuerpo de POST /api/invitaciones */
export const invitacionInputSchema = z.object({
  numeroPartido: z.number().int().min(1).max(15),
  nombreJugador: z.string().trim().min(1, 'Falta el nombre del jugador').max(80),
  multiplicidad: z.enum(MULTIPLICIDADES),
});

export type InvitacionInput = z.infer<typeof invitacionInputSchema>;

/** Cuerpo de POST /api/apuestas */
export const apuestaInputSchema = z.object({
  token: z.string().trim().min(1, 'Falta el token de invitación'),
  signos: signosSchema,
});

export type ApuestaInput = z.infer<typeof apuestaInputSchema>;

/**
 * Valida que un conjunto de 15 partidos manuales es coherente:
 * números 1..15 sin huecos ni duplicados.
 */
export function validaNumeracionPartidos(
  partidos: { numero: number }[],
): string | null {
  const numeros = partidos.map((p) => p.numero).sort((a, b) => a - b);
  for (let i = 0; i < 15; i++) {
    if (numeros[i] !== i + 1) {
      return 'Los partidos deben numerarse del 1 al 15 sin huecos ni repetidos.';
    }
  }
  return null;
}

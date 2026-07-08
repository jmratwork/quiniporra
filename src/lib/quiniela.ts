import { prisma } from './prisma';
import type { Signos } from './validation';
import { signosSchema } from './validation';

/**
 * Lógica de dominio y estado de la Quiniela.
 *
 * Reglas:
 *  - Solo puede existir una Quiniela activa a la vez.
 *  - Estado ABIERTA mientras queden partidos sin apostar.
 *  - Pasa a CERRADA automáticamente cuando los 15 partidos tienen apuesta
 *    (esto se hace de forma transaccional al registrar la apuesta n.º 15).
 */

export const TOTAL_PARTIDOS = 15;

/** Deserializa de forma segura el JSON de signos guardado en la BD. */
export function parseSignos(json: unknown): Signos | null {
  const r = signosSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** Representación legible de unos signos, para UI y PDF. */
export function signosATexto(signos: Signos | null): string {
  if (!signos) return '';
  if (signos.tipo === '1X2') return signos.valores.join(' ');
  return `L:${signos.local.join('')} V:${signos.visitante.join('')}`;
}

/**
 * Obtiene la Quiniela activa con sus partidos, apuestas e invitaciones.
 * Devuelve null si no hay ninguna.
 */
export async function getQuinielaActiva() {
  return prisma.quiniela.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      partidos: {
        orderBy: { numero: 'asc' },
        include: {
          apuesta: true,
          invitaciones: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });
}

type QuinielaActiva = NonNullable<Awaited<ReturnType<typeof getQuinielaActiva>>>;

/** Número de partidos que ya tienen apuesta. */
export function partidosApostados(q: QuinielaActiva): number {
  return q.partidos.filter((p) => p.apuesta !== null).length;
}

/**
 * Vista pública: no revela los signos hasta que la Quiniela está CERRADA.
 */
export function vistaPublica(q: QuinielaActiva) {
  const cerrada = q.estado === 'CERRADA';
  return {
    id: q.id,
    jornada: q.jornada,
    estado: q.estado,
    origen: q.origen,
    fechaCierre: q.fechaCierre,
    apostados: partidosApostados(q),
    total: TOTAL_PARTIDOS,
    partidos: q.partidos.map((p) => ({
      numero: p.numero,
      local: p.local,
      visitante: p.visitante,
      esPleno: p.esPleno,
      estado: p.apuesta ? ('APOSTADO' as const) : ('PENDIENTE' as const),
      // Los signos y el apostante solo se muestran cuando está CERRADA.
      signos: cerrada && p.apuesta ? parseSignos(p.apuesta.signos) : null,
      nombreJugador: cerrada && p.apuesta ? p.apuesta.nombreJugador : null,
    })),
  };
}

/**
 * Vista de administración: incluye multiplicidad, invitaciones y su estado.
 * Nunca expone el token (solo se guarda su hash); muestra el estado.
 */
export function vistaAdmin(q: QuinielaActiva) {
  return {
    id: q.id,
    jornada: q.jornada,
    estado: q.estado,
    origen: q.origen,
    fechaCierre: q.fechaCierre,
    createdAt: q.createdAt,
    apostados: partidosApostados(q),
    total: TOTAL_PARTIDOS,
    partidos: q.partidos.map((p) => ({
      numero: p.numero,
      local: p.local,
      visitante: p.visitante,
      esPleno: p.esPleno,
      multiplicidad: p.multiplicidad,
      estado: p.apuesta ? ('APOSTADO' as const) : ('PENDIENTE' as const),
      signos: p.apuesta ? parseSignos(p.apuesta.signos) : null,
      nombreJugador: p.apuesta?.nombreJugador ?? null,
      invitaciones: p.invitaciones.map((inv) => ({
        id: inv.id,
        nombreJugador: inv.nombreJugador,
        multiplicidad: inv.multiplicidad,
        estado: inv.estado,
        createdAt: inv.createdAt,
        usedAt: inv.usedAt,
      })),
    })),
  };
}

export type VistaPublica = ReturnType<typeof vistaPublica>;
export type VistaAdmin = ReturnType<typeof vistaAdmin>;

import { prisma } from './prisma';
import { obtenerJornadaActual } from './jornadaFetcher';

/**
 * Carga automática (programada) de la jornada actual de La Quiniela.
 *
 * Se dispara desde un cron (lunes y jueves a las 18:00 de Barcelona, ver
 * vercel.json) y también podría llamarse manualmente. Es **idempotente y NO
 * destructiva**: nunca borra una porra en curso.
 *
 * Regla de decisión (ver `decidirAccionCarga`):
 *  - No hay ninguna quiniela           -> crear.
 *  - Ya existe la MISMA jornada         -> sin cambios (idempotente).
 *  - Existe otra jornada YA TERMINADA   -> reemplazar (CERRADA/CADUCADA o
 *    pasada su fechaCierre; la anterior ya no admite apuestas).
 *  - Existe otra jornada ABIERTA en curso -> omitir (no se destruye una porra
 *    con apuestas a medias; se reintentará en el siguiente disparo).
 */

export type AccionCarga = 'crear' | 'sin-cambios' | 'reemplazar' | 'omitir-activa';

export interface ExistenteMin {
  jornada: string;
  estado: 'ABIERTA' | 'CERRADA' | 'CADUCADA';
  fechaCierre: Date | null;
}

export function decidirAccionCarga(
  existente: ExistenteMin | null,
  jornadaNueva: string,
  ahora = Date.now(),
): AccionCarga {
  if (!existente) return 'crear';
  if (existente.jornada === jornadaNueva) return 'sin-cambios';

  const terminada =
    existente.estado === 'CERRADA' ||
    existente.estado === 'CADUCADA' ||
    (existente.fechaCierre !== null && ahora > existente.fechaCierre.getTime());

  return terminada ? 'reemplazar' : 'omitir-activa';
}

export interface ResultadoCarga {
  accion: AccionCarga;
  jornada: string;
}

/**
 * Obtiene la jornada actual de la fuente y aplica la acción que corresponda.
 * Lanza JornadaFetchError si la fuente falla (el cron devolverá 502 y se
 * reintentará en el siguiente disparo).
 */
export async function cargarJornadaAutomatica(): Promise<ResultadoCarga> {
  const jornada = await obtenerJornadaActual();

  const existente = await prisma.quiniela.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, jornada: true, estado: true, fechaCierre: true },
  });

  const accion = decidirAccionCarga(existente, jornada.jornada);

  if (accion === 'sin-cambios' || accion === 'omitir-activa') {
    return { accion, jornada: jornada.jornada };
  }

  await prisma.$transaction(async (tx) => {
    if (accion === 'reemplazar' && existente) {
      await tx.quiniela.delete({ where: { id: existente.id } });
    }
    await tx.quiniela.create({
      data: {
        jornada: jornada.jornada,
        fechaCierre: jornada.fechaCierre ? new Date(jornada.fechaCierre) : null,
        estado: 'ABIERTA',
        origen: 'AUTOMATICO',
        partidos: {
          create: jornada.partidos.map((p) => ({
            numero: p.numero,
            local: p.local,
            visitante: p.visitante,
            esPleno: p.esPleno,
          })),
        },
      },
    });
  });

  return { accion, jornada: jornada.jornada };
}

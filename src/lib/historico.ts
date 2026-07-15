import { Prisma } from '@prisma/client';
import { parseSignos } from './quiniela';
import type { BoletoPdf } from './pdf';

/**
 * Archivado de jornadas terminadas (M4).
 *
 * Antes de reemplazar/borrar una Quiniela que tenga apuestas, se guarda un
 * snapshot en `historicos_quiniela` para no perder el boleto (la carga
 * automática del cron reemplaza sin confirmación). El snapshot es directamente
 * consumible por el generador de PDF (`BoletoPdf`).
 */

type PartidoConApuesta = {
  numero: number;
  local: string;
  visitante: string;
  esPleno: boolean;
  apuesta: { signos: Prisma.JsonValue; nombreJugador: string } | null;
};

/** Construye el snapshot (forma de BoletoPdf) a partir de los partidos+apuesta. */
export function construirSnapshot(
  jornada: string,
  fechaCierre: Date | null,
  partidos: PartidoConApuesta[],
): BoletoPdf {
  return {
    jornada,
    fechaCierre: fechaCierre ? fechaCierre.toISOString() : null,
    partidos: partidos
      .slice()
      .sort((a, b) => a.numero - b.numero)
      .map((p) => ({
        numero: p.numero,
        local: p.local,
        visitante: p.visitante,
        esPleno: p.esPleno,
        signos: p.apuesta ? parseSignos(p.apuesta.signos) : null,
        nombreJugador: p.apuesta?.nombreJugador ?? null,
      })),
  };
}

/**
 * Archiva la Quiniela indicada dentro de una transacción, SI tiene al menos una
 * apuesta (si no, no hay nada que conservar). Debe llamarse antes de borrarla.
 */
export async function archivarQuiniela(
  tx: Prisma.TransactionClient,
  quinielaId: string,
): Promise<void> {
  const q = await tx.quiniela.findUnique({
    where: { id: quinielaId },
    include: {
      partidos: { orderBy: { numero: 'asc' }, include: { apuesta: true } },
    },
  });
  if (!q) return;

  const apostados = q.partidos.filter((p) => p.apuesta !== null).length;
  if (apostados === 0) return; // nada que conservar

  const snapshot = construirSnapshot(q.jornada, q.fechaCierre, q.partidos);

  await tx.historicoQuiniela.create({
    data: {
      jornada: q.jornada,
      fechaCierre: q.fechaCierre,
      estado: q.estado,
      apostados,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}

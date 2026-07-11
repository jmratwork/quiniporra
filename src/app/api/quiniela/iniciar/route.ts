import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requiereSesionAdmin } from '@/lib/auth';
import { obtenerJornadaActual } from '@/lib/jornadaFetcher';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quiniela/iniciar
 * Carga automática de la jornada actual desde SELAE y crea la Quiniela con
 * sus 15 partidos.
 *
 * Requiere PIN. Cuerpo opcional: { confirmar?: boolean }.
 *  - Si ya existe una Quiniela activa y no se envía confirmar=true, responde
 *    409 con { requiereConfirmacion: true } para que el admin confirme el
 *    reemplazo (borra partidos, invitaciones y apuestas anteriores).
 *  - Si la fuente externa falla, responde 502 con un mensaje claro para que
 *    el admin use el formulario manual.
 */
export async function POST(req: NextRequest) {
  try {
    await requiereSesionAdmin(req);
    const body = await req.json().catch(() => ({}));

    const confirmar = body?.confirmar === true;

    const existente = await prisma.quiniela.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (existente && !confirmar) {
      return error(
        'Ya existe una Quiniela activa. Confirma para reemplazarla.',
        409,
      );
    }

    // Petición externa (siempre en servidor). Lanza JornadaFetchError -> 502.
    const jornada = await obtenerJornadaActual();

    const creada = await prisma.$transaction(async (tx) => {
      if (existente) {
        // Borra la anterior en cascada (partidos, invitaciones, apuestas).
        await tx.quiniela.delete({ where: { id: existente.id } });
      }
      return tx.quiniela.create({
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
        include: { partidos: { orderBy: { numero: 'asc' } } },
      });
    });

    return ok({ quiniela: creada }, 201);
  } catch (e) {
    return manejaError(e);
  }
}

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requiereSesionAdmin } from '@/lib/auth';
import {
  quinielaManualSchema,
  validaNumeracionPartidos,
} from '@/lib/validation';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/quiniela/manual
 * Fallback: crear la jornada introduciendo los 15 partidos a mano.
 * Requiere PIN. Cuerpo: { jornada, fechaCierre?, partidos[15], confirmar? }.
 */
export async function POST(req: NextRequest) {
  try {
    requiereSesionAdmin(req);
    const body = await req.json().catch(() => ({}));

    const datos = quinielaManualSchema.parse(body);

    const errNum = validaNumeracionPartidos(datos.partidos);
    if (errNum) return error(errNum, 400);

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

    const creada = await prisma.$transaction(async (tx) => {
      if (existente) {
        await tx.quiniela.delete({ where: { id: existente.id } });
      }
      return tx.quiniela.create({
        data: {
          jornada: datos.jornada,
          fechaCierre: datos.fechaCierre ? new Date(datos.fechaCierre) : null,
          estado: 'ABIERTA',
          origen: 'MANUAL',
          partidos: {
            create: datos.partidos.map((p) => ({
              numero: p.numero,
              local: p.local,
              visitante: p.visitante,
              esPleno: p.numero === 15,
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

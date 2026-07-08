import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verificaAdmin } from '@/lib/auth';
import { invitacionInputSchema } from '@/lib/validation';
import { generaToken, hashToken } from '@/lib/tokens';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invitaciones
 * Crea una invitación para un partido concreto con una multiplicidad
 * obligatoria. Devuelve el token/enlace UNA SOLA VEZ (después solo se guarda
 * su hash). Requiere PIN.
 *
 * Cuerpo: { numeroPartido, nombreJugador, multiplicidad }.
 * Se pueden generar varias invitaciones para el mismo partido (distintos
 * jugadores); gana quien apueste primero.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    verificaAdmin(req, body);

    const datos = invitacionInputSchema.parse(body);

    const q = await prisma.quiniela.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!q) {
      return error('No hay ninguna Quiniela activa.', 404);
    }
    if (q.estado === 'CERRADA') {
      return error('La Quiniela está cerrada; no admite más invitaciones.', 409);
    }

    const partido = await prisma.partido.findUnique({
      where: { quinielaId_numero: { quinielaId: q.id, numero: datos.numeroPartido } },
      include: { apuesta: true },
    });
    if (!partido) {
      return error(`El partido nº ${datos.numeroPartido} no existe.`, 404);
    }
    if (partido.apuesta) {
      return error('Ese partido ya está apostado.', 409);
    }

    const token = generaToken();
    const tokenHash = hashToken(token);

    // La multiplicidad del partido queda fijada por la invitación.
    await prisma.$transaction([
      prisma.invitacion.create({
        data: {
          partidoId: partido.id,
          nombreJugador: datos.nombreJugador,
          multiplicidad: datos.multiplicidad,
          tokenHash,
          estado: 'PENDIENTE',
        },
      }),
      prisma.partido.update({
        where: { id: partido.id },
        data: { multiplicidad: datos.multiplicidad },
      }),
    ]);

    const base = req.nextUrl.origin;
    return ok(
      {
        token,
        enlace: `${base}/apostar/${token}`,
        partido: { numero: partido.numero, local: partido.local, visitante: partido.visitante },
        multiplicidad: datos.multiplicidad,
        nombreJugador: datos.nombreJugador,
      },
      201,
    );
  } catch (e) {
    return manejaError(e);
  }
}

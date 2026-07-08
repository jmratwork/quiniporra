import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/tokens';
import { marcasExigidas } from '@/lib/validation';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invitaciones/[token]
 * Datos para la pantalla del jugador: el partido asignado, su nombre, la
 * multiplicidad exigida y si la invitación sigue disponible.
 *
 * Next 15: `params` es asíncrono -> hay que hacer `await params`.
 *
 * Regla "el primero que llega, apuesta": si el partido ya tiene apuesta o la
 * invitación ya fue usada/anulada, se informa de que llega tarde (409).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const inv = await prisma.invitacion.findUnique({
      where: { tokenHash },
      include: {
        partido: {
          include: { apuesta: true, quiniela: true },
        },
      },
    });

    if (!inv) {
      return error('Invitación no encontrada o enlace no válido.', 404);
    }

    const base = {
      nombreJugador: inv.nombreJugador,
      multiplicidad: inv.multiplicidad,
      marcasExigidas: marcasExigidas(inv.multiplicidad),
      partido: {
        numero: inv.partido.numero,
        local: inv.partido.local,
        visitante: inv.partido.visitante,
        esPleno: inv.partido.esPleno,
      },
      jornada: inv.partido.quiniela.jornada,
    };

    // ¿Llega tarde? El partido ya está apostado o la invitación no está pendiente.
    if (inv.partido.apuesta || inv.estado !== 'PENDIENTE') {
      // Si el partido ya se apostó por otro, anulamos esta invitación.
      if (inv.partido.apuesta && inv.estado === 'PENDIENTE') {
        await prisma.invitacion.update({
          where: { id: inv.id },
          data: { estado: 'ANULADA' },
        });
      }
      return error('Llegas tarde: este partido ya ha sido apostado.', 409, undefined);
    }

    return ok({ disponible: true, ...base });
  } catch (e) {
    return manejaError(e);
  }
}

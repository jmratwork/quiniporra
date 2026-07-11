import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requiereSesionAdmin } from '@/lib/auth';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/invitaciones/[id]
 * Anula manualmente una invitación PENDIENTE (el enlace deja de servir para
 * apostar). Requiere sesión de administración. No se puede anular una
 * invitación ya USADA (tiene una apuesta registrada).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requiereSesionAdmin(req);
    const { id } = await params;

    const inv = await prisma.invitacion.findUnique({ where: { id } });
    if (!inv) {
      return error('Invitación no encontrada.', 404);
    }
    if (inv.estado === 'USADA') {
      return error('No se puede anular una invitación ya utilizada.', 409);
    }

    await prisma.invitacion.update({
      where: { id },
      data: { estado: 'ANULADA' },
    });
    return ok({ ok: true });
  } catch (e) {
    return manejaError(e);
  }
}

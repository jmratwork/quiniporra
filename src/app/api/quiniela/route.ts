import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQuinielaActiva, vistaAdmin, vistaPublica } from '@/lib/quiniela';
import { extraePin } from '@/lib/auth';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quiniela
 * Estado completo de la Quiniela activa.
 *  - Sin PIN: vista pública (sin signos hasta que esté CERRADA, sin tokens).
 *  - Con PIN correcto (x-admin-pin): vista de administración (multiplicidad,
 *    invitaciones y su estado).
 */
export async function GET(req: NextRequest) {
  try {
    const q = await getQuinielaActiva();
    if (!q) {
      return ok({ quiniela: null });
    }

    const pin = extraePin(req);
    const esAdmin = !!pin && !!process.env.ADMIN_PIN && pin === process.env.ADMIN_PIN;

    return ok({ quiniela: esAdmin ? vistaAdmin(q) : vistaPublica(q), esAdmin });
  } catch (e) {
    return manejaError(e);
  }
}

/**
 * DELETE /api/quiniela
 * Reinicia todo: borra la Quiniela activa (y en cascada partidos,
 * invitaciones y apuestas). Requiere PIN.
 */
export async function DELETE(req: NextRequest) {
  try {
    // Autenticación por cabecera (DELETE sin cuerpo).
    const pin = extraePin(req);
    if (!process.env.ADMIN_PIN) {
      return error('ADMIN_PIN no está configurado en el servidor.', 500);
    }
    if (!pin || pin !== process.env.ADMIN_PIN) {
      return error('PIN de administración incorrecto.', 401);
    }

    const activa = await prisma.quiniela.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (activa) {
      await prisma.quiniela.delete({ where: { id: activa.id } });
    }
    return ok({ ok: true });
  } catch (e) {
    return manejaError(e);
  }
}

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQuinielaActiva, vistaAdmin, vistaPublica } from '@/lib/quiniela';
import { tieneSesionAdmin, requiereSesionAdmin } from '@/lib/auth';
import { ok, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quiniela
 * Estado completo de la Quiniela activa.
 *  - Sin sesión: vista pública (sin signos hasta que esté CERRADA, sin tokens).
 *  - Con sesión de administración válida: vista de administración.
 */
export async function GET(req: NextRequest) {
  // La autenticación (cookie de sesión) NO depende de la base de datos: se
  // calcula primero, para que el admin pueda entrar aunque no exista ninguna
  // Quiniela o la BD no responda.
  const esAdmin = tieneSesionAdmin(req);

  try {
    const q = await getQuinielaActiva();
    return ok({
      quiniela: q ? (esAdmin ? vistaAdmin(q) : vistaPublica(q)) : null,
      esAdmin,
    });
  } catch (e) {
    console.error('GET /api/quiniela — error de base de datos:', e);
    return ok({ quiniela: null, esAdmin, errorBd: true });
  }
}

/**
 * DELETE /api/quiniela
 * Reinicia todo: borra la Quiniela activa (y en cascada partidos,
 * invitaciones y apuestas). Requiere sesión de administración.
 */
export async function DELETE(req: NextRequest) {
  try {
    requiereSesionAdmin(req);

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

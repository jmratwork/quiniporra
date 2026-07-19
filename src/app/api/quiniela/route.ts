import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getQuinielaActiva,
  caducarSiProcede,
  vistaAdmin,
  vistaPublica,
} from '@/lib/quiniela';
import { tieneSesionAdmin, requiereSesionAdmin } from '@/lib/auth';
import { archivarQuiniela } from '@/lib/historico';
import { ok, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quiniela
 * Estado completo de la Quiniela activa.
 *  - Sin sesión: vista pública (sin signos hasta que esté CERRADA, sin tokens).
 *  - Con sesión de administración válida: vista de administración.
 */
export async function GET(req: NextRequest) {
  // Autenticación por cookie de sesión (firma + revocación). La comprobación de
  // revocación es fail-open ante fallo de BD, para no bloquear el acceso.
  const esAdmin = await tieneSesionAdmin(req);

  try {
    const q = await getQuinielaActiva();
    if (q) await caducarSiProcede(q); // cierre por tiempo perezoso
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
 *
 * Antes de borrar se archiva el boleto (si tenía apuestas), igual que hacen la
 * carga automática y los formularios de carga (M4), para no perder el histórico.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requiereSesionAdmin(req);

    const activa = await prisma.quiniela.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (activa) {
      await prisma.$transaction(async (tx) => {
        await archivarQuiniela(tx, activa.id);
        await tx.quiniela.delete({ where: { id: activa.id } });
      });
    }
    return ok({ ok: true });
  } catch (e) {
    return manejaError(e);
  }
}

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requiereSesionAdmin } from '@/lib/auth';
import { ok, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/historico
 * Lista los boletos de jornadas terminadas archivadas (M4). Requiere sesión.
 * No devuelve el snapshot completo (solo metadatos); el PDF se obtiene en
 * /api/admin/historico/[id]/pdf.
 */
export async function GET(req: NextRequest) {
  try {
    await requiereSesionAdmin(req);
    const historicos = await prisma.historicoQuiniela.findMany({
      orderBy: { archivadaEn: 'desc' },
      take: 100,
      select: {
        id: true,
        jornada: true,
        fechaCierre: true,
        estado: true,
        apostados: true,
        archivadaEn: true,
      },
    });
    return ok({ historicos });
  } catch (e) {
    return manejaError(e);
  }
}

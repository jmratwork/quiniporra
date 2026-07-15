import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requiereSesionAdmin } from '@/lib/auth';
import { generarPdfBoleto, type BoletoPdf } from '@/lib/pdf';
import { error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/historico/[id]/pdf
 * Regenera el PDF del boleto de una jornada archivada a partir de su snapshot.
 * Requiere sesión de administración.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requiereSesionAdmin(req);
    const { id } = await params;

    const hist = await prisma.historicoQuiniela.findUnique({ where: { id } });
    if (!hist) {
      return error('Boleto archivado no encontrado.', 404);
    }

    const pdf = await generarPdfBoleto(hist.snapshot as unknown as BoletoPdf);
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="quiniporra-historico.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return manejaError(e);
  }
}

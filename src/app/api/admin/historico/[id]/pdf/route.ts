import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requiereSesionAdmin } from '@/lib/auth';
import { generarPdfBoleto, boletoPdfSchema } from '@/lib/pdf';
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

    // No confiamos a ciegas en el JSON almacenado: validamos su forma antes de
    // pasarlo a pdf-lib (defensa ante corrupción o deriva del esquema).
    const parsed = boletoPdfSchema.safeParse(hist.snapshot);
    if (!parsed.success) {
      return error('El boleto archivado tiene un formato no válido.', 500);
    }

    const pdf = await generarPdfBoleto(parsed.data);
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

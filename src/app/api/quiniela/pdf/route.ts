import { getQuinielaActiva, vistaPublica } from '@/lib/quiniela';
import { generarPdfBoleto } from '@/lib/pdf';
import { error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quiniela/pdf
 * Genera y devuelve el PDF del boleto. Solo si la Quiniela está CERRADA
 * (409 en caso contrario). Sin autenticación.
 */
export async function GET() {
  try {
    const q = await getQuinielaActiva();
    if (!q) {
      return error('No hay ninguna Quiniela activa.', 404);
    }
    if (q.estado !== 'CERRADA') {
      return error('El PDF solo está disponible cuando la Quiniela está cerrada.', 409);
    }

    // Ruta pública: usamos la vista pública (no la de admin) por defensa en
    // profundidad. Con la quiniela CERRADA expone los mismos signos/nombres, y
    // el PDF solo consume numero/local/visitante/esPleno/signos/nombreJugador.
    const vista = vistaPublica(q);
    const pdf = await generarPdfBoleto({
      jornada: vista.jornada,
      fechaCierre: vista.fechaCierre,
      partidos: vista.partidos.map((p) => ({
        numero: p.numero,
        local: p.local,
        visitante: p.visitante,
        esPleno: p.esPleno,
        signos: p.signos,
        nombreJugador: p.nombreJugador,
      })),
    });

    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="quiniporra-jornada.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return manejaError(e);
  }
}

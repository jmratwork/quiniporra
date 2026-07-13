import { NextRequest } from 'next/server';
import { cargarJornadaAutomatica } from '@/lib/cargaJornada';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/jornada
 * Carga automática de la jornada actual. La invoca el cron de Vercel (lunes y
 * viernes a las 10:00 de Barcelona, ver vercel.json).
 *
 * Autenticación: cabecera `Authorization: Bearer <CRON_SECRET>` que Vercel añade
 * automáticamente cuando `CRON_SECRET` está definido. En producción es
 * obligatorio; en desarrollo, si no hay CRON_SECRET, se permite (para pruebas).
 *
 * La carga es idempotente y no destructiva (ver lib/cargaJornada.ts): 502 si la
 * fuente externa falla.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return error('No autorizado.', 401);
      }
    } else if (process.env.NODE_ENV === 'production') {
      return error('CRON_SECRET no está configurado en el servidor.', 500);
    }

    const resultado = await cargarJornadaAutomatica();
    return ok(resultado);
  } catch (e) {
    return manejaError(e);
  }
}

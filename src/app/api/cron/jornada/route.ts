import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { cargarJornadaAutomatica } from '@/lib/cargaJornada';
import { podarEstadoAuth } from '@/lib/authStore';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

const CRON_SECRET_MIN = 32;

/** Comparación en tiempo constante de la cabecera Authorization. */
function bearerValido(header: string | null, secret: string): boolean {
  const esperado = Buffer.from(`Bearer ${secret}`, 'utf8');
  const recibido = Buffer.from(header ?? '', 'utf8');
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/**
 * GET /api/cron/jornada
 * Carga automática de la jornada actual. La invoca el cron de Vercel (lunes y
 * viernes a las 10:00 de Barcelona, ver vercel.json).
 *
 * Autenticación: cabecera `Authorization: Bearer <CRON_SECRET>` que Vercel añade
 * automáticamente cuando `CRON_SECRET` está definido (comparada en tiempo
 * constante). En producción es OBLIGATORIO y debe tener al menos 32 caracteres;
 * en desarrollo, si no hay CRON_SECRET, se permite (para pruebas).
 *
 * La carga es idempotente y no destructiva (ver lib/cargaJornada.ts): 502 si la
 * fuente externa falla.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const esProd = process.env.NODE_ENV === 'production';

    if (esProd && (!secret || secret.length < CRON_SECRET_MIN)) {
      return error(
        `CRON_SECRET no está configurado correctamente (mín. ${CRON_SECRET_MIN} caracteres).`,
        500,
      );
    }
    if (secret) {
      if (!bearerValido(req.headers.get('authorization'), secret)) {
        return error('No autorizado.', 401);
      }
    }
    // En desarrollo sin CRON_SECRET, se permite (para pruebas locales).

    // Poda oportunista de tablas de estado de auth (best-effort).
    await podarEstadoAuth();

    const resultado = await cargarJornadaAutomatica();
    return ok(resultado);
  } catch (e) {
    return manejaError(e);
  }
}

import { NextRequest } from 'next/server';
import { requiereSesionAdmin } from '@/lib/auth';
import { cargarJornadaAutomatica } from '@/lib/cargaJornada';
import { ipDe } from '@/lib/rateLimit';
import { rateLimitPersistente } from '@/lib/authStore';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jornada
 * Carga la jornada actual AHORA, sin esperar al cron. Mismas reglas que la
 * carga programada (idempotente y no destructiva, ver lib/cargaJornada.ts),
 * pero sin caché: siempre consulta la fuente. Requiere sesión de admin.
 *
 * Para sustituir una jornada ABIERTA en plazo (p. ej. una cargada por error),
 * primero se usa "Reiniciar" (archiva y borra) y luego esta carga.
 */
export async function POST(req: NextRequest) {
  try {
    await requiereSesionAdmin(req);

    // Cada carga consulta webs externas: 6 cada 10 minutos sobra, y evita que
    // unos clics repetidos acaben en un bloqueo por parte de la fuente.
    const rl = await rateLimitPersistente(`jornada:${ipDe(req)}`, 6, 10 * 60 * 1000);
    if (!rl.permitido) {
      return error('Demasiadas cargas seguidas. Espera unos minutos.', 429);
    }

    const resultado = await cargarJornadaAutomatica({ usarCache: false });
    return ok(resultado);
  } catch (e) {
    return manejaError(e);
  }
}

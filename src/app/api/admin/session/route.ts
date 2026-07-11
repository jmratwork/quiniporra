import { NextRequest } from 'next/server';
import { tieneSesionAdmin } from '@/lib/auth';
import { totpRequerido } from '@/lib/totp';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/session
 * Estado de la sesión para la pantalla de login:
 *  - autenticado: si ya hay una cookie de sesión válida.
 *  - totpRequerido: si el login debe pedir el código de doble factor.
 */
export async function GET(req: NextRequest) {
  return ok({
    autenticado: tieneSesionAdmin(req),
    totpRequerido: totpRequerido(),
  });
}

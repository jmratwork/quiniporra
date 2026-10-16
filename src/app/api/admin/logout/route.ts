import { NextRequest } from 'next/server';
import { revocarSesion } from '@/lib/auth';
import { COOKIE_SESION } from '@/lib/session';
import { ok, error } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/logout
 * Cierra la sesión: revoca su jti (deja de ser válido aunque el token esté en
 * otro sitio) y borra la cookie del navegador.
 *
 * Si la revocación no se puede guardar (BD caída), la cookie se borra igual
 * pero se responde 500: el token seguiría valiendo hasta caducar (≤8 h) y el
 * admin debe saberlo, en vez de recibir un falso ok.
 */
export async function POST(req: NextRequest) {
  let revocada = true;
  try {
    await revocarSesion(req);
  } catch (e) {
    console.error('[SEGURIDAD] no se pudo revocar la sesión en el logout:', e);
    revocada = false;
  }

  const res = revocada
    ? ok({ ok: true })
    : error(
        'No se pudo cerrar la sesión en el servidor; seguirá activa hasta que caduque (máx. 8 h).',
        500,
      );
  res.cookies.set(COOKIE_SESION, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return res;
}

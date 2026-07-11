import { NextRequest } from 'next/server';
import { revocarSesion } from '@/lib/auth';
import { COOKIE_SESION } from '@/lib/session';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/logout
 * Cierra la sesión: revoca su jti (deja de ser válido aunque el token esté en
 * otro sitio) y borra la cookie del navegador.
 */
export async function POST(req: NextRequest) {
  await revocarSesion(req);
  const res = ok({ ok: true });
  res.cookies.set(COOKIE_SESION, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return res;
}

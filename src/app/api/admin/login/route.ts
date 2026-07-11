import { NextRequest } from 'next/server';
import { pinCorrecto } from '@/lib/auth';
import { comprobarTotp } from '@/lib/totp';
import { crearTokenSesion, COOKIE_SESION, TTL_SESION_MS } from '@/lib/session';
import { ipDe } from '@/lib/rateLimit';
import { rateLimitPersistente, pasoTotpYaUsado } from '@/lib/authStore';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login
 * Doble factor: { pin, code }. Verifica el PIN (primer factor) y el código
 * TOTP (segundo factor). Si ambos son correctos, emite la cookie de sesión.
 *
 * Está limitado por IP (rate limiting) para frenar la fuerza bruta del código.
 * No revela cuál de los dos factores ha fallado.
 */
export async function POST(req: NextRequest) {
  try {
    // Límite: 5 intentos cada 10 minutos por IP (compartido entre instancias).
    const rl = await rateLimitPersistente(`login:${ipDe(req)}`, 5, 10 * 60 * 1000);
    if (!rl.permitido) {
      const min = Math.ceil(rl.resetEnMs / 60000);
      return error(
        `Demasiados intentos. Vuelve a probar en ${min} minuto(s).`,
        429,
      );
    }

    const body = await req.json().catch(() => ({}));
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    const code = typeof body?.code === 'string' ? body.code : '';

    // Primer factor. Se comprueba antes de tocar el TOTP para no "consumir" el
    // código (anti-replay) en intentos con el PIN incorrecto. El mensaje de
    // error es el mismo en ambos casos: no revela qué factor ha fallado.
    if (!pinCorrecto(pin)) {
      return error('PIN o código de verificación incorrecto.', 401);
    }
    // Segundo factor: validez criptográfica + anti-replay (paso ya usado).
    // comprobarTotp puede lanzar 500 si falta la configuración en producción.
    const totp = comprobarTotp(code);
    if (!totp.valido) {
      return error('PIN o código de verificación incorrecto.', 401);
    }
    if (totp.paso !== null && (await pasoTotpYaUsado(totp.paso))) {
      return error('PIN o código de verificación incorrecto.', 401);
    }

    const res = ok({ ok: true });
    res.cookies.set(COOKIE_SESION, crearTokenSesion(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: Math.floor(TTL_SESION_MS / 1000),
    });
    return res;
  } catch (e) {
    return manejaError(e);
  }
}

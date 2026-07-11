import { NextRequest } from 'next/server';
import { pinCorrecto } from '@/lib/auth';
import { comprobarTotp, totpRequerido } from '@/lib/totp';
import { crearTokenSesion, COOKIE_SESION, TTL_SESION_MS } from '@/lib/session';
import { ipDe } from '@/lib/rateLimit';
import { rateLimitPersistente, pasoTotpYaUsado } from '@/lib/authStore';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login
 * Login en DOS pasos:
 *  - Paso 1: cuerpo { pin }. Verifica solo el PIN (primer factor).
 *      · PIN incorrecto -> 401.
 *      · PIN correcto y hace falta 2FA -> 200 { requiereCodigo: true }.
 *      · PIN correcto y NO hace falta 2FA (dev) -> emite la cookie de sesión.
 *  - Paso 2: cuerpo { pin, code }. Verifica PIN + código TOTP y, si son
 *      correctos, emite la cookie de sesión (401 si el código es incorrecto).
 *
 * Limitado por IP (rate limiting) para frenar la fuerza bruta.
 */
export async function POST(req: NextRequest) {
  try {
    // Límite: 10 peticiones cada 10 minutos por IP (el flujo usa 2 por login).
    const rl = await rateLimitPersistente(`login:${ipDe(req)}`, 10, 10 * 60 * 1000);
    if (!rl.permitido) {
      const min = Math.ceil(rl.resetEnMs / 60000);
      return error(`Demasiados intentos. Vuelve a probar en ${min} minuto(s).`, 429);
    }

    const body = await req.json().catch(() => ({}));
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    const code = typeof body?.code === 'string' ? body.code : '';

    // Primer factor.
    if (!pinCorrecto(pin)) {
      return error('PIN de administración incorrecto.', 401);
    }

    // Segundo factor (si procede).
    if (totpRequerido()) {
      if (!code) {
        // Paso 1 superado: pedimos el código de verificación.
        return ok({ requiereCodigo: true });
      }
      // comprobarTotp puede lanzar 500 si falta la configuración en producción.
      const totp = comprobarTotp(code);
      if (!totp.valido) {
        return error('Código de verificación incorrecto.', 401);
      }
      if (totp.paso !== null && (await pasoTotpYaUsado(totp.paso))) {
        return error('Código de verificación incorrecto.', 401);
      }
    }

    // Éxito: emite la cookie de sesión.
    const res = ok({ autenticado: true });
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

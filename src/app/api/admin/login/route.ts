import { NextRequest } from 'next/server';
import { pinCorrecto } from '@/lib/auth';
import { comprobarTotp, totpRequerido } from '@/lib/totp';
import { crearTokenSesion, COOKIE_SESION, TTL_SESION_MS } from '@/lib/session';
import { ipDe } from '@/lib/rateLimit';
import { rateLimitPersistente, pasoTotpYaUsado, type ResultadoRate } from '@/lib/authStore';
import { ok, error, manejaError } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Mismo mensaje si falla el PIN o el código: el paso 2 no revela cuál.
const CREDENCIALES_INCORRECTAS = 'PIN o código de verificación incorrecto.';

/** Respuesta cuando un límite de intentos rechaza la petición. */
function limiteSuperado(rl: ResultadoRate) {
  if (rl.errorBd) {
    return error(
      'El servicio de autenticación no está disponible temporalmente. Reinténtalo en unos minutos.',
      503,
    );
  }
  const min = Math.ceil(rl.resetEnMs / 60000);
  return error(`Demasiados intentos. Vuelve a probar en ${min} minuto(s).`, 429);
}

/**
 * POST /api/admin/login
 * Login en DOS pasos:
 *  - Paso 1: cuerpo { pin }.
 *      · Hace falta 2FA -> 200 { requiereCodigo: true } SIN comprobar el PIN,
 *        para que esta respuesta no sirva de oráculo para adivinarlo.
 *      · NO hace falta 2FA (dev) -> comprueba el PIN y emite la cookie de sesión.
 *  - Paso 2: cuerpo { pin, code }. Comprueba PIN y código TOTP a la vez y, si
 *      son correctos, emite la cookie de sesión. Si falla cualquiera, 401 con
 *      un mensaje único que no dice cuál.
 *
 * Doble límite de intentos: por IP y global (todas las IP sumadas).
 */
export async function POST(req: NextRequest) {
  try {
    // Por IP: 10 peticiones cada 10 minutos (el flujo usa 2 por login).
    // fail-closed: si la BD no responde, se rechaza (evita fuerza bruta
    // distribuida entre instancias) con un 503 reintentable, no un 429.
    const rlIp = await rateLimitPersistente(`login:${ipDe(req)}`, 10, 10 * 60 * 1000, {
      failClosed: true,
    });
    if (!rlIp.permitido) return limiteSuperado(rlIp);

    // Global: 30 peticiones por hora sumando todas las IP. Frena a quien rota
    // de IP (botnet, IPv6) para esquivar el límite anterior; a cambio, un
    // ataque así puede bloquear el login del admin hasta que pase la hora.
    const rlGlobal = await rateLimitPersistente('login:global', 30, 60 * 60 * 1000, {
      failClosed: true,
    });
    if (!rlGlobal.permitido) return limiteSuperado(rlGlobal);

    const body = await req.json().catch(() => ({}));
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    const code = typeof body?.code === 'string' ? body.code : '';

    if (totpRequerido()) {
      if (!code) {
        // Paso 1: pedimos el código de verificación sin mirar el PIN.
        return ok({ requiereCodigo: true });
      }
      // Paso 2: ambos factores a la vez. comprobarTotp puede lanzar 500 si
      // falta la configuración en producción.
      const pinOk = pinCorrecto(pin);
      const totp = comprobarTotp(code);
      if (!pinOk || !totp.valido) {
        return error(CREDENCIALES_INCORRECTAS, 401);
      }
      if (totp.paso !== null && (await pasoTotpYaUsado(totp.paso))) {
        return error(CREDENCIALES_INCORRECTAS, 401);
      }
    } else if (!pinCorrecto(pin)) {
      // Sin 2FA (solo en desarrollo) el PIN es el único factor.
      return error('PIN de administración incorrecto.', 401);
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

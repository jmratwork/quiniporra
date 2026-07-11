import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Sesión de administración mediante cookie firmada (HMAC-SHA256).
 *
 * Tras superar el doble factor (PIN + código TOTP) se emite un token firmado
 * con SESSION_SECRET y una caducidad corta. El token no guarda ningún secreto:
 * solo `{ exp }` firmado, así que no se puede falsificar sin el secreto.
 *
 * La cookie se marca httpOnly + Secure + SameSite=Strict, de modo que no es
 * accesible desde JavaScript ni viaja en peticiones de terceros.
 */

export const COOKIE_SESION = 'quiniporra_admin';
export const TTL_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas

function secreto(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET es obligatorio en producción.');
  }
  return 'sesion-desarrollo-insegura';
}

function firma(payload: string): string {
  return createHmac('sha256', secreto()).update(payload).digest('hex');
}

function comparaHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Crea un token de sesión firmado que caduca en TTL_SESION_MS. */
export function crearTokenSesion(ahora = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: ahora + TTL_SESION_MS }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${firma(payload)}`;
}

/** Comprueba que un token de sesión es válido (firma correcta y no caducado). */
export function sesionValida(token: string | undefined, ahora = Date.now()): boolean {
  if (!token) return false;
  const punto = token.lastIndexOf('.');
  if (punto <= 0) return false;
  const payload = token.slice(0, punto);
  const sig = token.slice(punto + 1);
  if (!comparaHex(firma(payload), sig)) return false;
  try {
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof datos.exp === 'number' && ahora < datos.exp;
  } catch {
    return false;
  }
}

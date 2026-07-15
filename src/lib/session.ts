import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

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

// Longitud mínima en producción (alineada con randomBytes(32) del .env.example).
const SECRETO_MIN = 32;

function secreto(): string {
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!s || s.length < SECRETO_MIN) {
      throw new Error(
        `SESSION_SECRET es obligatorio y debe tener al menos ${SECRETO_MIN} caracteres en producción.`,
      );
    }
    return s;
  }
  return s && s.length > 0 ? s : 'sesion-desarrollo-insegura';
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

export interface DatosSesion {
  exp: number;
  jti: string;
}

/**
 * Crea un token de sesión firmado que caduca en TTL_SESION_MS. Incluye un `jti`
 * aleatorio que permite revocar la sesión de forma selectiva (ver M4).
 */
export function crearTokenSesion(ahora = Date.now()): string {
  const datos: DatosSesion = {
    exp: ahora + TTL_SESION_MS,
    jti: randomBytes(16).toString('hex'),
  };
  const payload = Buffer.from(JSON.stringify(datos), 'utf8').toString('base64url');
  return `${payload}.${firma(payload)}`;
}

/**
 * Verifica firma y caducidad y devuelve el payload ({ exp, jti }) o null.
 * Es la base de `sesionValida`; expone el `jti` para la revocación.
 */
export function leerToken(
  token: string | undefined,
  ahora = Date.now(),
): DatosSesion | null {
  if (!token) return null;
  const punto = token.lastIndexOf('.');
  if (punto <= 0) return null;
  const payload = token.slice(0, punto);
  const sig = token.slice(punto + 1);
  if (!comparaHex(firma(payload), sig)) return null;
  try {
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof datos.exp !== 'number' || ahora >= datos.exp) return null;
    if (typeof datos.jti !== 'string' || datos.jti.length === 0) return null;
    return { exp: datos.exp, jti: datos.jti };
  } catch {
    return null;
  }
}

/** Comprueba que un token de sesión es válido (firma correcta y no caducado). */
export function sesionValida(token: string | undefined, ahora = Date.now()): boolean {
  return leerToken(token, ahora) !== null;
}

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

// En producción, prefijo `__Host-`: el navegador solo acepta la cookie si es
// Secure, con Path=/ y sin Domain, así que ni un subdominio ni una página HTTP
// pueden plantarla o sobrescribirla. En desarrollo (http://localhost) va sin
// prefijo, porque algunos navegadores no aceptan cookies Secure por HTTP.
export const COOKIE_SESION =
  process.env.NODE_ENV === 'production' ? '__Host-quiniporra_admin' : 'quiniporra_admin';
export const TTL_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas

// Longitud mínima fuera de desarrollo (alineada con randomBytes(32) del .env.example).
const SECRETO_MIN = 32;

function secreto(): string {
  const s = process.env.SESSION_SECRET;
  // Solo `next dev` admite el valor por defecto: producción, tests o un
  // despliegue sin NODE_ENV exigen el secreto real (fail-closed).
  if (process.env.NODE_ENV === 'development') {
    return s && s.length > 0 ? s : 'sesion-desarrollo-insegura';
  }
  if (!s || s.length < SECRETO_MIN) {
    throw new Error(
      `SESSION_SECRET es obligatorio y debe tener al menos ${SECRETO_MIN} caracteres (fuera de desarrollo).`,
    );
  }
  return s;
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

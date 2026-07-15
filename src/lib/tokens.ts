import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Generación y verificación de tokens de invitación.
 *
 * Un token es aleatorio (32 bytes) y en la base de datos solo se guarda su
 * HMAC-SHA256 (firmado con INVITACION_SECRET). Así, aunque alguien acceda a
 * la BD, no puede reconstruir los enlaces; y solo quien tenga el token
 * original (enviado por WhatsApp/email por el admin) puede apostar.
 *
 * En producción INVITACION_SECRET es obligatorio. En desarrollo se usa un
 * valor por defecto para no bloquear el arranque.
 */

const SECRETO_MIN = 32;

function secreto(): string {
  const s = process.env.INVITACION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!s || s.length < SECRETO_MIN) {
      throw new Error(
        `INVITACION_SECRET es obligatorio y debe tener al menos ${SECRETO_MIN} caracteres en producción.`,
      );
    }
    return s;
  }
  return s && s.length > 0 ? s : 'secreto-desarrollo-inseguro';
}

/** Genera un token aleatorio para enviar al jugador (no se guarda tal cual). */
export function generaToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Calcula el hash (HMAC-SHA256) que sí se persiste en la BD. */
export function hashToken(token: string): string {
  return createHmac('sha256', secreto()).update(token).digest('hex');
}

/** Comparación en tiempo constante de dos hashes en hexadecimal. */
export function comparaHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

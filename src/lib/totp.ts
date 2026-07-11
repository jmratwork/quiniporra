import { authenticator } from 'otplib';
import { AdminAuthError } from './auth';

/**
 * Segundo factor de autenticación: código TOTP de una app de autenticación
 * (Google Authenticator, Authy, 1Password…).
 *
 * El secreto compartido vive en la variable de entorno TOTP_SECRET (base32),
 * estable entre instancias serverless. El enrolamiento se hace una vez con
 * `npm run totp:setup`.
 *
 * - En producción TOTP_SECRET es OBLIGATORIO.
 * - En desarrollo, si no está configurado, se OMITE el segundo factor (con un
 *   aviso) para no bloquear el arranque local; el PIN sigue siendo obligatorio.
 *
 * Este módulo hace SOLO la comprobación criptográfica (pura, sin estado). El
 * anti-replay (que un código no se use dos veces) vive en el almacén compartido
 * `lib/authStore.ts` porque debe funcionar entre instancias serverless.
 */

// Ventana de ±1 paso (30 s) para tolerar desfase de reloj del móvil.
authenticator.options = { window: 1, step: 30 };

export function totpConfigurado(): boolean {
  return !!process.env.TOTP_SECRET;
}

/** ¿Se exige el segundo factor? Siempre en producción; en dev solo si hay secreto. */
export function totpRequerido(): boolean {
  return totpConfigurado() || process.env.NODE_ENV === 'production';
}

export interface ResultadoTotp {
  /** El código es válido criptográficamente (o el 2FA está desactivado en dev). */
  valido: boolean;
  /**
   * Paso de tiempo TOTP al que corresponde el código (para el anti-replay), o
   * null cuando no aplica (2FA desactivado en desarrollo).
   */
  paso: number | null;
}

/**
 * Comprueba un código TOTP de 6 dígitos contra TOTP_SECRET (sin anti-replay).
 * Lanza AdminAuthError(500) si falta el secreto en producción.
 */
export function comprobarTotp(code: string): ResultadoTotp {
  const secreto = process.env.TOTP_SECRET;

  if (!secreto) {
    if (process.env.NODE_ENV === 'production') {
      throw new AdminAuthError(500, 'TOTP_SECRET no está configurado en el servidor.');
    }
    console.warn(
      '[totp] TOTP_SECRET no configurado: se omite el segundo factor (solo en desarrollo).',
    );
    return { valido: true, paso: null };
  }

  const limpio = (code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpio)) return { valido: false, paso: null };

  // checkDelta devuelve el desfase (-1, 0, 1) respecto al paso actual, o null.
  const delta = authenticator.checkDelta(limpio, secreto);
  if (delta === null) return { valido: false, paso: null };

  const paso = Math.floor(Date.now() / 1000 / 30) + delta;
  return { valido: true, paso };
}

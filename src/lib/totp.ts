import { verifySync } from 'otplib';
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

// Parámetros RFC 6238 (otplib usa por defecto SHA-1 y 6 dígitos).
const PERIODO_S = 30; // segundos por paso de tiempo.
// Tolerancia de ±30 s = ventana de ±1 paso, para el desfase de reloj del móvil.
const TOLERANCIA_S = 30;

// Longitud mínima del secreto base32 en producción: 26 chars ≈ 128 bits de
// entropía (otplib v13 además rechaza cualquier secreto de menos de 16 bytes).
// `npm run totp:setup` genera uno de 160 bits; esto evita que un operador ponga
// a mano un valor corto/débil en las variables de entorno.
const TOTP_SECRET_MIN = 26;

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

  // En producción, un secreto demasiado corto no ofrece la entropía esperada:
  // fail-closed (500) en vez de aceptar un segundo factor debilitado.
  if (process.env.NODE_ENV === 'production' && secreto.length < TOTP_SECRET_MIN) {
    throw new AdminAuthError(
      500,
      `TOTP_SECRET es demasiado corto (mín. ${TOTP_SECRET_MIN} caracteres base32).`,
    );
  }

  const limpio = (code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpio)) return { valido: false, paso: null };

  // Comprobación en tiempo constante contra la ventana de tolerancia. Devuelve
  // el paso de tiempo consumido (`timeStep`), que alimenta el anti-replay
  // compartido en authStore (nunca se acepta dos veces el mismo paso).
  const r = verifySync({
    secret: secreto,
    token: limpio,
    period: PERIODO_S,
    epochTolerance: TOLERANCIA_S,
  });
  // Usamos siempre la estrategia TOTP (por defecto), cuyo resultado válido trae
  // `timeStep`. El type guard descarta la variante HOTP (imposible aquí).
  if (!r.valid || !('timeStep' in r)) return { valido: false, paso: null };
  return { valido: true, paso: r.timeStep };
}

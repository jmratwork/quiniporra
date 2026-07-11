import { authenticator } from 'otplib';
import { AdminAuthError } from './auth';

/**
 * Segundo factor de autenticación: código TOTP de una app de autenticación
 * (Google Authenticator, Authy, 1Password…).
 *
 * El secreto compartido vive en la variable de entorno TOTP_SECRET (base32),
 * estable entre instancias serverless. El enrolamiento se hace una vez con
 * `npm run totp:setup`, que genera el secreto y el QR para escanearlo.
 *
 * - En producción TOTP_SECRET es OBLIGATORIO.
 * - En desarrollo, si no está configurado, se OMITE el segundo factor (con un
 *   aviso) para no bloquear el arranque local; el PIN sigue siendo obligatorio.
 */

// Ventana de ±1 paso (30 s) para tolerar desfase de reloj del móvil.
authenticator.options = { window: 1, step: 30 };

// Anti-replay: el último "paso" de tiempo consumido con éxito. Un mismo código
// no puede usarse dos veces dentro de su ventana de validez.
let ultimoStep = -1;

export function totpConfigurado(): boolean {
  return !!process.env.TOTP_SECRET;
}

/** ¿Se exige el segundo factor? Siempre en producción; en dev solo si hay secreto. */
export function totpRequerido(): boolean {
  return totpConfigurado() || process.env.NODE_ENV === 'production';
}

/**
 * Verifica un código TOTP de 6 dígitos contra TOTP_SECRET.
 * Devuelve true/false; lanza AdminAuthError(500) si falta el secreto en prod.
 */
export function verificarTotp(code: string): boolean {
  const secreto = process.env.TOTP_SECRET;

  if (!secreto) {
    if (process.env.NODE_ENV === 'production') {
      throw new AdminAuthError(500, 'TOTP_SECRET no está configurado en el servidor.');
    }
    // Desarrollo sin 2FA configurado: se omite el segundo factor.
    console.warn(
      '[totp] TOTP_SECRET no configurado: se omite el segundo factor (solo en desarrollo).',
    );
    return true;
  }

  const limpio = (code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpio)) return false;

  // checkDelta devuelve el desfase (-1, 0, 1) respecto al paso actual, o null.
  const delta = authenticator.checkDelta(limpio, secreto);
  if (delta === null) return false;

  const pasoActual = Math.floor(Date.now() / 1000 / 30);
  const paso = pasoActual + delta;
  if (paso <= ultimoStep) return false; // anti-replay
  ultimoStep = paso;
  return true;
}

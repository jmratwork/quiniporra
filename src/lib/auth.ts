import { NextRequest } from 'next/server';
import { COOKIE_SESION, sesionValida } from './session';

/**
 * Autenticación del panel de administración.
 *
 * Doble factor:
 *   1. PIN (algo que sabes)      → variable de entorno ADMIN_PIN.
 *   2. Código TOTP (algo que tienes) → ver lib/totp.ts.
 *
 * Una vez superados ambos en /api/admin/login se emite una cookie de sesión
 * firmada (lib/session.ts). Las rutas protegidas ya NO reciben el PIN en cada
 * petición: validan esa cookie con requiereSesionAdmin().
 *
 * En producción el PIN debe tener al menos 12 caracteres; si no, se considera
 * mal configurado y se rechaza cualquier acceso.
 */

const PIN_MINIMO_PRODUCCION = 12;

export class AdminAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

function pinConfigurado(): string {
  const pin = process.env.ADMIN_PIN;
  if (!pin || pin.trim().length === 0) {
    throw new AdminAuthError(500, 'ADMIN_PIN no está configurado en el servidor.');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    pin.length < PIN_MINIMO_PRODUCCION
  ) {
    throw new AdminAuthError(
      500,
      `ADMIN_PIN debe tener al menos ${PIN_MINIMO_PRODUCCION} caracteres en producción.`,
    );
  }
  return pin;
}

/** Comparación en tiempo constante para evitar ataques de temporización. */
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let resultado = 0;
  for (let i = 0; i < a.length; i++) {
    resultado |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return resultado === 0;
}

/** Primer factor: ¿el PIN recibido es correcto? (usado solo en el login) */
export function pinCorrecto(pin: string): boolean {
  const esperado = pinConfigurado();
  return typeof pin === 'string' && comparaSeguro(pin, esperado);
}

/** ¿La petición trae una cookie de sesión de administración válida? */
export function tieneSesionAdmin(req: NextRequest): boolean {
  return sesionValida(req.cookies.get(COOKIE_SESION)?.value);
}

/** Exige sesión de administración válida; lanza AdminAuthError(401) si no. */
export function requiereSesionAdmin(req: NextRequest): void {
  if (!tieneSesionAdmin(req)) {
    throw new AdminAuthError(401, 'Sesión de administración no válida o caducada.');
  }
}

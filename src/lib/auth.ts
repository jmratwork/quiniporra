import { NextRequest } from 'next/server';

/**
 * Autenticación del panel de administración mediante PIN.
 *
 * El PIN se lee de la variable de entorno ADMIN_PIN. Se acepta:
 *   - Cabecera `x-admin-pin`
 *   - Campo `pin` en el cuerpo JSON de la petición
 *
 * En producción el PIN debe tener al menos 12 caracteres; si no, se
 * considera mal configurado y se rechaza cualquier acceso.
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

/**
 * Comparación en tiempo constante para evitar ataques de temporización.
 */
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let resultado = 0;
  for (let i = 0; i < a.length; i++) {
    resultado |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return resultado === 0;
}

/**
 * Extrae el PIN de la cabecera o del cuerpo ya parseado.
 */
export function extraePin(
  req: NextRequest,
  body?: unknown,
): string | null {
  const cabecera = req.headers.get('x-admin-pin');
  if (cabecera && cabecera.length > 0) return cabecera;
  if (
    body &&
    typeof body === 'object' &&
    'pin' in body &&
    typeof (body as { pin: unknown }).pin === 'string'
  ) {
    return (body as { pin: string }).pin;
  }
  return null;
}

/**
 * Verifica el PIN de admin. Lanza AdminAuthError(401) si es incorrecto
 * o AdminAuthError(500) si el servidor está mal configurado.
 */
export function verificaAdmin(req: NextRequest, body?: unknown): void {
  const esperado = pinConfigurado();
  const recibido = extraePin(req, body);
  if (!recibido || !comparaSeguro(recibido, esperado)) {
    throw new AdminAuthError(401, 'PIN de administración incorrecto.');
  }
}

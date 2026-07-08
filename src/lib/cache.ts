/**
 * Caché en memoria muy simple con expiración (TTL).
 *
 * Se usa para no repetir la petición externa a SELAE si el admin pulsa
 * "Iniciar" varias veces seguidas. En serverless la memoria no se comparte
 * entre instancias, pero sí evita ráfagas dentro de una misma instancia,
 * que es el caso que nos interesa.
 */

interface Entrada<T> {
  valor: T;
  expiraEn: number;
}

const almacen = new Map<string, Entrada<unknown>>();

export function cacheGet<T>(clave: string): T | null {
  const e = almacen.get(clave);
  if (!e) return null;
  if (Date.now() > e.expiraEn) {
    almacen.delete(clave);
    return null;
  }
  return e.valor as T;
}

export function cacheSet<T>(clave: string, valor: T, ttlMs: number): void {
  almacen.set(clave, { valor, expiraEn: Date.now() + ttlMs });
}

export function cacheDelete(clave: string): void {
  almacen.delete(clave);
}

/** TTL por defecto para la jornada obtenida de SELAE: 10 minutos. */
export const TTL_JORNADA_MS = 10 * 60 * 1000;

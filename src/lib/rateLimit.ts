/**
 * Rate limiting en memoria por clave (p. ej. IP), con ventana deslizante
 * simple. Objetivo: frenar la fuerza bruta del login de administración
 * (un código TOTP son solo 10^6 combinaciones).
 *
 * En serverless la memoria no se comparte entre instancias, así que no es un
 * límite global perfecto, pero sí frena ráfagas dentro de una instancia, que
 * es donde se concentra un ataque. Para un límite estricto y distribuido se
 * usaría un almacén compartido (Redis, Upstash…).
 */

interface Registro {
  count: number;
  reset: number; // timestamp en ms en el que se reinicia la ventana
}

const registros = new Map<string, Registro>();

export interface ResultadoRate {
  permitido: boolean;
  restante: number;
  resetEnMs: number;
}

export function rateLimit(
  clave: string,
  max: number,
  ventanaMs: number,
): ResultadoRate {
  const ahora = Date.now();
  const r = registros.get(clave);

  if (!r || ahora > r.reset) {
    registros.set(clave, { count: 1, reset: ahora + ventanaMs });
    return { permitido: true, restante: max - 1, resetEnMs: ventanaMs };
  }

  if (r.count >= max) {
    return { permitido: false, restante: 0, resetEnMs: r.reset - ahora };
  }

  r.count += 1;
  return { permitido: true, restante: max - r.count, resetEnMs: r.reset - ahora };
}

/** IP del cliente a partir de las cabeceras habituales de proxy (Vercel). */
export function ipDe(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'desconocida';
}

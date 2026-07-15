import { prisma } from './prisma';
import { rateLimit as rateLimitMemoria } from './rateLimit';

/**
 * Estado de autenticación COMPARTIDO entre instancias serverless (Postgres).
 *
 * En Vercel cada función puede correr en instancias distintas y reiniciarse en
 * frío, así que un contador en memoria no sirve para el rate limiting ni para
 * el anti-replay del TOTP, ni para revocar sesiones. Aquí se persiste en BD.
 *
 * Modo de fallo ante error de BD (diferenciado por función):
 *  - `rateLimitPersistente`: **fail-safe** → cae al limitador EN MEMORIA (al
 *    menos protege por instancia), nunca deja el login sin ningún límite.
 *  - `pasoTotpYaUsado` / `sesionRevocada`: **fail-open** (bajo impacto: el
 *    anti-replay solo dejaría reenviar el MISMO código, no probar nuevos; y una
 *    revocación no aplicada caduca sola en ≤8 h).
 */

// ---------------------------------------------------------------------------
// Rate limiting persistente (ventana fija), atómico y sin condición de carrera
// ---------------------------------------------------------------------------

export interface ResultadoRate {
  permitido: boolean;
  resetEnMs: number;
}

export async function rateLimitPersistente(
  clave: string,
  max: number,
  ventanaMs: number,
): Promise<ResultadoRate> {
  const ahora = Date.now();
  const reset = new Date(ahora + ventanaMs);
  try {
    // Check-and-increment ATÓMICO en una sola sentencia (UPSERT con CASE), para
    // evitar el TOCTOU del patrón "leer -> decidir -> escribir": peticiones
    // concurrentes ya no pueden colar más intentos que el límite. La comparación
    // de la ventana usa now() del propio Postgres. Parametrizado (sin inyección).
    const filas = await prisma.$queryRaw<{ contador: number; reset: Date }[]>`
      INSERT INTO "rate_limits" ("clave", "contador", "reset")
      VALUES (${clave}, 1, ${reset})
      ON CONFLICT ("clave") DO UPDATE SET
        "contador" = CASE WHEN "rate_limits"."reset" < now()
                          THEN 1 ELSE "rate_limits"."contador" + 1 END,
        "reset"    = CASE WHEN "rate_limits"."reset" < now()
                          THEN ${reset} ELSE "rate_limits"."reset" END
      RETURNING "contador", "reset";
    `;
    const fila = filas[0];
    const contador = Number(fila.contador);
    const resetEnMs = Math.max(0, fila.reset.getTime() - ahora);
    return { permitido: contador <= max, resetEnMs };
  } catch (e) {
    // Fail-SAFE: si la BD no responde, no dejamos el login sin límite; usamos el
    // limitador en memoria (protección por instancia) como segunda capa.
    console.warn('[authStore] rate limit BD no disponible; fallback en memoria:', e);
    const r = rateLimitMemoria(clave, max, ventanaMs);
    return { permitido: r.permitido, resetEnMs: r.resetEnMs };
  }
}

// ---------------------------------------------------------------------------
// M3 — Anti-replay del TOTP (paso de tiempo consumido)
// ---------------------------------------------------------------------------

/**
 * Registra el paso de tiempo TOTP consumido y responde si YA se había usado.
 * Avanza `ultimoStep` de forma atómica: si no avanza, es que el paso es <= al
 * último → replay.
 */
export async function pasoTotpYaUsado(paso: number): Promise<boolean> {
  try {
    await prisma.totpStep.upsert({
      where: { id: 1 },
      create: { id: 1, ultimoStep: 0 },
      update: {},
    });
    const res = await prisma.totpStep.updateMany({
      where: { id: 1, ultimoStep: { lt: paso } },
      data: { ultimoStep: paso },
    });
    return res.count === 0; // 0 => no avanzó => paso ya usado (replay)
  } catch (e) {
    console.warn('[authStore] anti-replay no disponible (fail-open):', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// M4 — Revocación de sesiones
// ---------------------------------------------------------------------------

export async function sesionRevocada(jti: string): Promise<boolean> {
  try {
    const row = await prisma.sesionRevocada.findUnique({ where: { jti } });
    return row !== null;
  } catch (e) {
    console.warn('[authStore] revocación no disponible (fail-open):', e);
    return false;
  }
}

/** Revoca un jti hasta su expiración natural, y poda las entradas caducadas. */
export async function revocarJti(jti: string, expiraEn: Date): Promise<void> {
  try {
    await prisma.sesionRevocada.upsert({
      where: { jti },
      create: { jti, expiraEn },
      update: {},
    });
    await prisma.sesionRevocada.deleteMany({ where: { expiraEn: { lt: new Date() } } });
  } catch (e) {
    console.warn('[authStore] no se pudo revocar la sesión:', e);
  }
}

// ---------------------------------------------------------------------------
// Poda de tablas de estado (evita crecimiento sin límite)
// ---------------------------------------------------------------------------

/**
 * Borra las filas caducadas de `sesiones_revocadas` (ya expiradas) y de
 * `rate_limits` (ventana ya vencida). Se llama de forma oportunista desde el
 * cron. Best-effort: un fallo de BD no interrumpe nada.
 */
export async function podarEstadoAuth(): Promise<void> {
  const ahora = new Date();
  try {
    await prisma.sesionRevocada.deleteMany({ where: { expiraEn: { lt: ahora } } });
    await prisma.rateLimit.deleteMany({ where: { reset: { lt: ahora } } });
  } catch (e) {
    console.warn('[authStore] no se pudo podar el estado de auth:', e);
  }
}

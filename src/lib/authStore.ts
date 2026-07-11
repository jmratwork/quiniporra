import { prisma } from './prisma';

/**
 * Estado de autenticación COMPARTIDO entre instancias serverless (Postgres).
 *
 * En Vercel cada función puede correr en instancias distintas y reiniciarse en
 * frío, así que un contador en memoria no sirve para el rate limiting ni para
 * el anti-replay del TOTP (M3), ni para revocar sesiones (M4). Aquí se persiste
 * en BD.
 *
 * Todas las funciones son **fail-open** ante un error de BD: si la base de datos
 * no responde, no se bloquea el login (se registra un aviso). Es una decisión
 * de disponibilidad para un panel de un solo admin; la seguridad de fondo sigue
 * recayendo en PIN + TOTP + cookie firmada.
 */

// ---------------------------------------------------------------------------
// M3 — Rate limiting persistente (ventana fija)
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
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.rateLimit.findUnique({ where: { clave } });
      if (!row || row.reset.getTime() < ahora) {
        const reset = new Date(ahora + ventanaMs);
        await tx.rateLimit.upsert({
          where: { clave },
          create: { clave, contador: 1, reset },
          update: { contador: 1, reset },
        });
        return { permitido: true, resetEnMs: ventanaMs };
      }
      const resetEnMs = row.reset.getTime() - ahora;
      if (row.contador >= max) return { permitido: false, resetEnMs };
      await tx.rateLimit.update({
        where: { clave },
        data: { contador: { increment: 1 } },
      });
      return { permitido: true, resetEnMs };
    });
  } catch (e) {
    console.warn('[authStore] rate limit no disponible (fail-open):', e);
    return { permitido: true, resetEnMs: 0 };
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

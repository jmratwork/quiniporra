import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { generateSync } from 'otplib';
import { POST as login } from '../src/app/api/admin/login/route';
import { POST as logout } from '../src/app/api/admin/logout/route';
import { pinCorrecto } from '../src/lib/auth';
import { COOKIE_SESION, crearTokenSesion } from '../src/lib/session';

// Secreto TOTP de test (el mismo que tests/totp.test.ts) y PIN de test.
const SECRET = 'DHOCR5QS3PWP66CFOFNZYRFACEGQS7HY';
const PIN = 'pin-de-test-suficientemente-largo';

// authStore usa Postgres: se sustituye por dobles controlables desde cada test.
const store = vi.hoisted(() => ({
  /** Clave de rate limit que se rechaza (null = todas permitidas). */
  bloqueada: null as string | null,
  revocarFalla: false,
  llamadasRate: [] as { clave: string; max: number; ventanaMs: number }[],
}));

vi.mock('../src/lib/authStore', () => ({
  rateLimitPersistente: async (clave: string, max: number, ventanaMs: number) => {
    store.llamadasRate.push({ clave, max, ventanaMs });
    return { permitido: clave !== store.bloqueada, resetEnMs: 60_000 };
  },
  pasoTotpYaUsado: async () => false,
  sesionRevocada: async () => false,
  revocarJti: async () => {
    if (store.revocarFalla) throw new Error('BD caída');
  },
}));

beforeAll(() => {
  process.env.ADMIN_PIN = PIN;
  process.env.TOTP_SECRET = SECRET;
  process.env.SESSION_SECRET = 'secreto-de-test-para-la-firma-hmac';
});

beforeEach(() => {
  store.bloqueada = null;
  store.revocarFalla = false;
  store.llamadasRate = [];
});

function peticion(ruta: string, cuerpo?: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-vercel-forwarded-for': '203.0.113.7',
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://localhost${ruta}`, {
    method: 'POST',
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

const codigoValido = () => generateSync({ secret: SECRET });
const codigoInvalido = () => (codigoValido() === '000000' ? '111111' : '000000');

describe('POST /api/admin/login', () => {
  it('paso 1: pide el código sin comprobar el PIN (misma respuesta con PIN bueno o malo)', async () => {
    const malo = await login(peticion('/api/admin/login', { pin: 'incorrecto' }));
    const bueno = await login(peticion('/api/admin/login', { pin: PIN }));

    expect(malo.status).toBe(200);
    expect(bueno.status).toBe(200);
    expect(await malo.json()).toEqual({ requiereCodigo: true });
    expect(await bueno.json()).toEqual({ requiereCodigo: true });
    expect(malo.cookies.get(COOKIE_SESION)).toBeUndefined();
  });

  it('paso 2: PIN incorrecto o código incorrecto -> 401 con el mismo mensaje y sin cookie', async () => {
    const pinMalo = await login(
      peticion('/api/admin/login', { pin: 'incorrecto', code: codigoValido() }),
    );
    const codigoMalo = await login(
      peticion('/api/admin/login', { pin: PIN, code: codigoInvalido() }),
    );

    expect(pinMalo.status).toBe(401);
    expect(codigoMalo.status).toBe(401);
    expect((await pinMalo.json()).error).toBe((await codigoMalo.json()).error);
    expect(pinMalo.cookies.get(COOKIE_SESION)).toBeUndefined();
    expect(codigoMalo.cookies.get(COOKIE_SESION)).toBeUndefined();
  });

  it('paso 2: PIN y código correctos -> 200 y cookie de sesión httpOnly + SameSite=Strict', async () => {
    const res = await login(peticion('/api/admin/login', { pin: PIN, code: codigoValido() }));

    expect(res.status).toBe(200);
    expect(res.cookies.get(COOKIE_SESION)?.value).toBeTruthy();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/httponly/i);
    expect(setCookie).toMatch(/samesite=strict/i);
  });

  it('aplica el límite por IP y además el global (30 por hora)', async () => {
    await login(peticion('/api/admin/login', { pin: PIN }));

    expect(store.llamadasRate).toEqual([
      { clave: 'login:203.0.113.7', max: 10, ventanaMs: 10 * 60 * 1000 },
      { clave: 'login:global', max: 30, ventanaMs: 60 * 60 * 1000 },
    ]);
  });

  it('con el límite global agotado responde 429 aunque la IP no haya llegado a su límite', async () => {
    store.bloqueada = 'login:global';
    const res = await login(peticion('/api/admin/login', { pin: PIN, code: codigoValido() }));

    expect(res.status).toBe(429);
    expect(res.cookies.get(COOKIE_SESION)).toBeUndefined();
  });
});

describe('pinCorrecto (comparación en tiempo constante)', () => {
  it('acepta solo el PIN exacto', () => {
    expect(pinCorrecto(PIN)).toBe(true);
    expect(pinCorrecto(PIN.slice(0, -1) + 'X')).toBe(false); // misma longitud
    expect(pinCorrecto(PIN.slice(0, 5))).toBe(false); // prefijo
    expect(pinCorrecto(PIN + 'x')).toBe(false); // más largo
    expect(pinCorrecto('')).toBe(false);
  });
});

describe('POST /api/admin/logout', () => {
  const cookieSesion = () => `${COOKIE_SESION}=${crearTokenSesion()}`;

  it('revoca la sesión y borra la cookie -> 200', async () => {
    const res = await logout(peticion('/api/admin/logout', undefined, cookieSesion()));

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/max-age=0/i);
  });

  it('si no se puede revocar -> 500, pero borra la cookie igualmente', async () => {
    store.revocarFalla = true;
    const res = await logout(peticion('/api/admin/logout', undefined, cookieSesion()));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/no se pudo cerrar la sesión/i);
    expect(res.headers.get('set-cookie')).toMatch(/max-age=0/i);
  });
});

describe('COOKIE_SESION', () => {
  it('fuera de producción no lleva prefijo', () => {
    expect(COOKIE_SESION).toBe('quiniporra_admin');
  });

  it('en producción lleva el prefijo __Host-', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    try {
      const mod = await import('../src/lib/session');
      expect(mod.COOKIE_SESION).toBe('__Host-quiniporra_admin');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

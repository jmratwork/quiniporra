import { describe, it, expect, beforeAll } from 'vitest';

let crearTokenSesion: (ahora?: number) => string;
let sesionValida: (token: string | undefined, ahora?: number) => boolean;
let TTL_SESION_MS: number;

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secreto-de-test-para-la-firma-hmac';
  const mod = await import('../src/lib/session');
  crearTokenSesion = mod.crearTokenSesion;
  sesionValida = mod.sesionValida;
  TTL_SESION_MS = mod.TTL_SESION_MS;
});

describe('cookie de sesión firmada', () => {
  it('un token recién creado es válido', () => {
    const t = crearTokenSesion();
    expect(sesionValida(t)).toBe(true);
  });

  it('un token vacío o malformado no es válido', () => {
    expect(sesionValida(undefined)).toBe(false);
    expect(sesionValida('')).toBe(false);
    expect(sesionValida('sinpunto')).toBe(false);
    expect(sesionValida('payload.firmafalsa')).toBe(false);
  });

  it('rechaza una firma manipulada', () => {
    const t = crearTokenSesion();
    const [payload] = t.split('.');
    const falso = `${payload}.${'0'.repeat(64)}`;
    expect(sesionValida(falso)).toBe(false);
  });

  it('rechaza un token caducado', () => {
    const ahora = 1_000_000_000_000;
    const t = crearTokenSesion(ahora);
    // Justo antes de caducar: válido; después: inválido.
    expect(sesionValida(t, ahora + TTL_SESION_MS - 1000)).toBe(true);
    expect(sesionValida(t, ahora + TTL_SESION_MS + 1000)).toBe(false);
  });

  it('rechaza un payload manipulado (exp alterado) porque cambia la firma', () => {
    const t = crearTokenSesion();
    const [, firma] = t.split('.');
    const payloadFalso = Buffer.from(
      JSON.stringify({ exp: Date.now() + 10 * 365 * 24 * 3600 * 1000 }),
      'utf8',
    ).toString('base64url');
    expect(sesionValida(`${payloadFalso}.${firma}`)).toBe(false);
  });
});

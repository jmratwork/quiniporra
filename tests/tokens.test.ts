import { describe, it, expect, beforeAll } from 'vitest';

let generaToken: () => string;
let hashToken: (t: string) => string;
let comparaHash: (a: string, b: string) => boolean;

beforeAll(async () => {
  process.env.INVITACION_SECRET = 'secreto-de-test-para-tokens';
  const mod = await import('../src/lib/tokens');
  generaToken = mod.generaToken;
  hashToken = mod.hashToken;
  comparaHash = mod.comparaHash;
});

describe('tokens de invitación', () => {
  it('generaToken produce valores aleatorios y no triviales', () => {
    const a = generaToken();
    const b = generaToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 bytes en base64url
  });

  it('hashToken es determinista para el mismo token', () => {
    const t = generaToken();
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it('hashToken difiere para tokens distintos y no expone el token', () => {
    const t = generaToken();
    const h = hashToken(t);
    expect(h).not.toBe(t);
    expect(hashToken(generaToken())).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 en hex
  });

  it('comparaHash es correcto en igualdad y desigualdad', () => {
    const h = hashToken(generaToken());
    expect(comparaHash(h, h)).toBe(true);
    expect(comparaHash(h, hashToken(generaToken()))).toBe(false);
    expect(comparaHash(h, h.slice(0, -1))).toBe(false); // longitudes distintas
  });
});

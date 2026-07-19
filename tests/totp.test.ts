import { describe, it, expect, beforeAll } from 'vitest';
import { createHmac } from 'crypto';
import { generateSync, verifySync } from 'otplib';

// Secreto de 32 chars base32 = 160 bits (otplib v13 exige ≥128 bits).
const SECRET = 'DHOCR5QS3PWP66CFOFNZYRFACEGQS7HY';

let comprobarTotp: (code: string) => { valido: boolean; paso: number | null };
let totpConfigurado: () => boolean;

beforeAll(async () => {
  process.env.TOTP_SECRET = SECRET;
  const mod = await import('../src/lib/totp');
  comprobarTotp = mod.comprobarTotp;
  totpConfigurado = mod.totpConfigurado;
});

// --- Implementación TOTP de referencia (RFC 6238, SHA-1, 6 dígitos) --------
// Independiente de otplib: demuestra que v13 sigue el estándar y, por tanto,
// que los secretos base32 y las apps de autenticación (Google Authenticator…)
// interoperan igual que antes de la migración.
function base32Decode(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const limpio = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let val = 0;
  const out: number[] = [];
  for (const c of limpio) {
    const i = A.indexOf(c);
    if (i < 0) continue;
    val = (val << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((val >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

function totpRef(secret: string, epochS: number, period = 30, digits = 6): string {
  const key = base32Decode(secret);
  let ctr = Math.floor(epochS / period);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = ctr & 0xff;
    ctr = Math.floor(ctr / 256);
  }
  const h = createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin =
    ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

describe('compatibilidad RFC 6238 (otplib v13)', () => {
  it('otplib genera el mismo código que una implementación estándar', () => {
    const EPOCH = 1_700_000_000;
    const ref = totpRef(SECRET, EPOCH);
    const got = generateSync({ secret: SECRET, epoch: EPOCH, period: 30 });
    expect(got).toBe(ref);
  });

  it('verifySync valida el código estándar y expone el paso de tiempo', () => {
    const EPOCH = 1_700_000_000;
    const token = totpRef(SECRET, EPOCH);
    const r = verifySync({ secret: SECRET, token, epoch: EPOCH, period: 30, epochTolerance: 30 });
    expect(r.valid).toBe(true);
    expect('timeStep' in r && r.timeStep).toBe(Math.floor(EPOCH / 30));
  });
});

describe('comprobarTotp (comprobación criptográfica pura)', () => {
  it('totpConfigurado() es true cuando hay secreto', () => {
    expect(totpConfigurado()).toBe(true);
  });

  it('acepta el código actual y devuelve su paso de tiempo', () => {
    const bueno = generateSync({ secret: SECRET });
    const r = comprobarTotp(bueno);
    expect(r.valido).toBe(true);
    expect(typeof r.paso).toBe('number');
    // El paso corresponde al intervalo de 30 s actual.
    expect(r.paso).toBe(Math.floor(Date.now() / 1000 / 30));
  });

  it('rechaza un código incorrecto', () => {
    const bueno = generateSync({ secret: SECRET });
    const malo = bueno === '000000' ? '111111' : '000000';
    expect(comprobarTotp(malo).valido).toBe(false);
  });

  it('rechaza formatos no numéricos de 6 dígitos', () => {
    expect(comprobarTotp('12345').valido).toBe(false);
    expect(comprobarTotp('abcdef').valido).toBe(false);
    expect(comprobarTotp('').valido).toBe(false);
  });
});

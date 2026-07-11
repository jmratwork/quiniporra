import { describe, it, expect, beforeAll } from 'vitest';
import { authenticator } from 'otplib';

const SECRET = 'ANVWINJPDFFTU5YM';

let comprobarTotp: (code: string) => { valido: boolean; paso: number | null };
let totpConfigurado: () => boolean;

beforeAll(async () => {
  process.env.TOTP_SECRET = SECRET;
  const mod = await import('../src/lib/totp');
  comprobarTotp = mod.comprobarTotp;
  totpConfigurado = mod.totpConfigurado;
});

describe('comprobarTotp (comprobación criptográfica pura)', () => {
  it('totpConfigurado() es true cuando hay secreto', () => {
    expect(totpConfigurado()).toBe(true);
  });

  it('acepta el código actual y devuelve su paso de tiempo', () => {
    const bueno = authenticator.generate(SECRET);
    const r = comprobarTotp(bueno);
    expect(r.valido).toBe(true);
    expect(typeof r.paso).toBe('number');
    // El paso corresponde al intervalo de 30 s actual.
    expect(r.paso).toBe(Math.floor(Date.now() / 1000 / 30));
  });

  it('rechaza un código incorrecto', () => {
    const bueno = authenticator.generate(SECRET);
    const malo = bueno === '000000' ? '111111' : '000000';
    expect(comprobarTotp(malo).valido).toBe(false);
  });

  it('rechaza formatos no numéricos de 6 dígitos', () => {
    expect(comprobarTotp('12345').valido).toBe(false);
    expect(comprobarTotp('abcdef').valido).toBe(false);
    expect(comprobarTotp('').valido).toBe(false);
  });
});

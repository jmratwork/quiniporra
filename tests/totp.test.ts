import { describe, it, expect, beforeAll } from 'vitest';
import { authenticator } from 'otplib';

// TOTP_SECRET debe existir antes de ejercitar verificarTotp.
const SECRET = 'ANVWINJPDFFTU5YM';

let verificarTotp: (code: string) => boolean;
let totpConfigurado: () => boolean;

beforeAll(async () => {
  process.env.TOTP_SECRET = SECRET;
  // Import diferido para que el módulo lea el entorno ya configurado.
  const mod = await import('../src/lib/totp');
  verificarTotp = mod.verificarTotp;
  totpConfigurado = mod.totpConfigurado;
});

describe('verificarTotp', () => {
  it('totpConfigurado() es true cuando hay secreto', () => {
    expect(totpConfigurado()).toBe(true);
  });

  it('acepta el código actual y rechaza uno incorrecto', () => {
    const malo = '000000';
    // Genera un código válido distinto del "malo".
    const bueno = authenticator.generate(SECRET);
    // (Si por casualidad coincidieran, el test seguiría siendo válido.)
    expect(verificarTotp(malo === bueno ? '111111' : malo)).toBe(false);
    expect(verificarTotp(bueno)).toBe(true);
  });

  it('anti-replay: rechaza reutilizar el mismo código', () => {
    const code = authenticator.generate(SECRET);
    const primera = verificarTotp(code);
    const segunda = verificarTotp(code);
    // La primera puede ser true (si no se usó ya en el test anterior) o false
    // (si el paso de tiempo ya se consumió); lo esencial es que NUNCA se acepte
    // dos veces seguidas el mismo código.
    expect(primera && segunda).toBe(false);
  });

  it('rechaza formatos no numéricos de 6 dígitos', () => {
    expect(verificarTotp('12345')).toBe(false);
    expect(verificarTotp('abcdef')).toBe(false);
    expect(verificarTotp('')).toBe(false);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';

type Estado = 'ABIERTA' | 'CERRADA' | 'CADUCADA';
let debeCaducar: (
  q: { estado: Estado; fechaCierre: Date | null; partidos: { apuesta: unknown }[] },
  ahora?: number,
) => boolean;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
  const mod = await import('../src/lib/quiniela');
  debeCaducar = mod.debeCaducar;
});

/** 15 partidos, `apostados` de ellos con apuesta. */
function partidos(apostados: number) {
  return Array.from({ length: 15 }, (_, i) => ({ apuesta: i < apostados ? {} : null }));
}

describe('debeCaducar', () => {
  const CIERRE = new Date('2026-07-10T18:00:00Z').getTime();
  const antes = CIERRE - 1000;
  const despues = CIERRE + 1000;

  it('caduca si está ABIERTA, pasó la fecha y faltan apuestas', () => {
    expect(
      debeCaducar({ estado: 'ABIERTA', fechaCierre: new Date(CIERRE), partidos: partidos(14) }, despues),
    ).toBe(true);
  });

  it('no caduca antes de la fecha de cierre', () => {
    expect(
      debeCaducar({ estado: 'ABIERTA', fechaCierre: new Date(CIERRE), partidos: partidos(3) }, antes),
    ).toBe(false);
  });

  it('no caduca si ya están los 15 apostados', () => {
    expect(
      debeCaducar({ estado: 'ABIERTA', fechaCierre: new Date(CIERRE), partidos: partidos(15) }, despues),
    ).toBe(false);
  });

  it('no caduca si no está ABIERTA', () => {
    expect(
      debeCaducar({ estado: 'CERRADA', fechaCierre: new Date(CIERRE), partidos: partidos(15) }, despues),
    ).toBe(false);
    expect(
      debeCaducar({ estado: 'CADUCADA', fechaCierre: new Date(CIERRE), partidos: partidos(2) }, despues),
    ).toBe(false);
  });

  it('no caduca si no hay fecha de cierre', () => {
    expect(debeCaducar({ estado: 'ABIERTA', fechaCierre: null, partidos: partidos(1) }, despues)).toBe(
      false,
    );
  });
});

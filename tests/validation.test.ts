import { describe, it, expect } from 'vitest';
import {
  marcasExigidas,
  validaSignosContraMultiplicidad,
  signosSchema,
  type Signos,
} from '../src/lib/validation';

describe('marcasExigidas', () => {
  it('mapea la multiplicidad al número de marcas', () => {
    expect(marcasExigidas('SIMPLE')).toBe(1);
    expect(marcasExigidas('DOBLE')).toBe(2);
    expect(marcasExigidas('TRIPLE')).toBe(3);
  });
});

describe('validaSignosContraMultiplicidad — partidos 1-14 (1X2)', () => {
  const s = (valores: string[]): Signos => ({ tipo: '1X2', valores: valores as never });

  it('acepta el número exacto de signos', () => {
    expect(validaSignosContraMultiplicidad(s(['1']), 'SIMPLE', false)).toBeNull();
    expect(validaSignosContraMultiplicidad(s(['1', 'X']), 'DOBLE', false)).toBeNull();
    expect(validaSignosContraMultiplicidad(s(['1', 'X', '2']), 'TRIPLE', false)).toBeNull();
  });

  it('rechaza marcar de menos o de más', () => {
    expect(validaSignosContraMultiplicidad(s(['1']), 'DOBLE', false)).toMatch(/exige/i);
    expect(validaSignosContraMultiplicidad(s(['1', 'X']), 'SIMPLE', false)).toMatch(/exige/i);
  });

  it('rechaza signos repetidos', () => {
    expect(validaSignosContraMultiplicidad(s(['1', '1']), 'DOBLE', false)).toMatch(/repetir/i);
  });

  it('rechaza estructura de pleno en un partido normal', () => {
    const pleno: Signos = { tipo: 'PLENO', local: ['1'], visitante: ['1'] };
    expect(validaSignosContraMultiplicidad(pleno, 'SIMPLE', false)).toMatch(/1, X o 2/i);
  });
});

describe('validaSignosContraMultiplicidad — Pleno al 15 (por equipo)', () => {
  const p = (local: string[], visitante: string[]): Signos => ({
    tipo: 'PLENO',
    local: local as never,
    visitante: visitante as never,
  });

  it('acepta el número exacto por equipo', () => {
    expect(validaSignosContraMultiplicidad(p(['0'], ['M']), 'SIMPLE', true)).toBeNull();
    expect(validaSignosContraMultiplicidad(p(['0', '1'], ['1', 'M']), 'DOBLE', true)).toBeNull();
    expect(
      validaSignosContraMultiplicidad(p(['0', '1', 'M'], ['0', '1', 'M']), 'TRIPLE', true),
    ).toBeNull();
  });

  it('rechaza si un equipo no tiene el número exigido', () => {
    expect(validaSignosContraMultiplicidad(p(['0'], ['1', 'M']), 'SIMPLE', true)).toMatch(/equipo/i);
  });

  it('rechaza valores repetidos por equipo', () => {
    expect(validaSignosContraMultiplicidad(p(['0', '0'], ['1', 'M']), 'DOBLE', true)).toMatch(
      /repetirse/i,
    );
  });

  it('rechaza estructura 1X2 en el pleno', () => {
    const s: Signos = { tipo: '1X2', valores: ['1'] };
    expect(validaSignosContraMultiplicidad(s, 'SIMPLE', true)).toMatch(/goles/i);
  });
});

describe('signosSchema (Zod)', () => {
  it('valida y rechaza valores fuera del dominio', () => {
    expect(signosSchema.safeParse({ tipo: '1X2', valores: ['1', 'X'] }).success).toBe(true);
    expect(signosSchema.safeParse({ tipo: '1X2', valores: ['3'] }).success).toBe(false);
    expect(
      signosSchema.safeParse({ tipo: 'PLENO', local: ['0'], visitante: ['M'] }).success,
    ).toBe(true);
    expect(
      signosSchema.safeParse({ tipo: 'PLENO', local: ['9'], visitante: ['M'] }).success,
    ).toBe(false);
  });
});

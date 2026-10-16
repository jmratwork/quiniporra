import { describe, it, expect } from 'vitest';
import { generarPdfBoleto, type BoletoPdf, type PartidoPdf } from '../src/lib/pdf';

function boleto(cambios: Partial<Record<number, Partial<PartidoPdf>>> = {}, jornada = 'Jornada 12'): BoletoPdf {
  const partidos: PartidoPdf[] = Array.from({ length: 15 }, (_, i) => ({
    numero: i + 1,
    local: `Local ${i + 1}`,
    visitante: `Visitante ${i + 1}`,
    esPleno: i + 1 === 15,
    signos: null,
    nombreJugador: null,
    ...cambios[i + 1],
  }));
  return { jornada, fechaCierre: '2026-10-18T12:00:00Z', partidos };
}

const esPdf = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString('latin1') === '%PDF-';

describe('generarPdfBoleto', () => {
  it('genera el boleto con texto en español (WinAnsi)', async () => {
    const pdf = await generarPdfBoleto(
      boleto({ 1: { local: 'Atlético', visitante: 'Málaga', nombreJugador: 'Begoña' } }),
    );
    expect(esPdf(pdf)).toBe(true);
  });

  it('no falla con caracteres que Helvetica no codifica (Ł, ş, ı, emoji)', async () => {
    const pdf = await generarPdfBoleto(
      boleto(
        {
          1: { local: 'ŁKS Łódź', visitante: 'Beşiktaş' },
          2: { local: 'Fenerbahçe', visitante: 'Kasımpaşa', nombreJugador: 'Ana 😀' },
          15: { local: 'Đakovo', visitante: 'Steaua București' },
        },
        'Jornada 12 · Ș',
      ),
    );
    expect(esPdf(pdf)).toBe(true);
  });
});

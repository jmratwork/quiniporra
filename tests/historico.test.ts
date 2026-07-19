import { describe, it, expect, beforeAll } from 'vitest';
import type { construirSnapshot as ConstruirSnapshot } from '../src/lib/historico';

let construirSnapshot: typeof ConstruirSnapshot;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
  const mod = await import('../src/lib/historico');
  construirSnapshot = mod.construirSnapshot;
});

describe('construirSnapshot', () => {
  const partidos = [
    {
      numero: 2,
      local: 'B',
      visitante: 'C',
      esPleno: false,
      apuesta: { signos: { tipo: '1X2', valores: ['1', 'X'] }, nombreJugador: 'Ana' },
    },
    { numero: 1, local: 'A', visitante: 'Z', esPleno: false, apuesta: null },
    {
      numero: 15,
      local: 'L',
      visitante: 'V',
      esPleno: true,
      apuesta: { signos: { tipo: 'PLENO', local: ['1'], visitante: ['M'] }, nombreJugador: 'Leo' },
    },
  ];

  it('ordena por número, serializa la fecha y conserva signos + apostante', () => {
    const cierre = new Date('2026-07-10T18:00:00Z');
    const s = construirSnapshot('Jornada 5', cierre, partidos);

    expect(s.jornada).toBe('Jornada 5');
    expect(s.fechaCierre).toBe(cierre.toISOString());
    expect(s.partidos.map((p) => p.numero)).toEqual([1, 2, 15]);

    // Partido sin apuesta -> signos null
    expect(s.partidos[0].signos).toBeNull();
    expect(s.partidos[0].nombreJugador).toBeNull();

    // Partido 1X2 con apuesta
    expect(s.partidos[1]).toMatchObject({
      numero: 2,
      nombreJugador: 'Ana',
      signos: { tipo: '1X2', valores: ['1', 'X'] },
    });

    // Pleno
    expect(s.partidos[2]).toMatchObject({
      esPleno: true,
      nombreJugador: 'Leo',
      signos: { tipo: 'PLENO', local: ['1'], visitante: ['M'] },
    });
  });

  it('fechaCierre nula se serializa como null', () => {
    expect(construirSnapshot('J', null, []).fechaCierre).toBeNull();
  });
});

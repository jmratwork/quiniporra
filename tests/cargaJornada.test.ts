import { describe, it, expect, beforeAll } from 'vitest';

type Estado = 'ABIERTA' | 'CERRADA' | 'CADUCADA';
let decidirAccionCarga: (
  existente: { jornada: string; estado: Estado; fechaCierre: Date | null } | null,
  jornadaNueva: string,
  ahora?: number,
) => 'crear' | 'sin-cambios' | 'reemplazar' | 'omitir-activa';

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
  const mod = await import('../src/lib/cargaJornada');
  decidirAccionCarga = mod.decidirAccionCarga;
});

const CIERRE = new Date('2026-07-10T18:00:00Z').getTime();

describe('decidirAccionCarga (no destructiva)', () => {
  it('crea si no hay ninguna quiniela', () => {
    expect(decidirAccionCarga(null, 'Jornada 5')).toBe('crear');
  });

  it('no hace nada si ya está cargada la misma jornada (idempotente)', () => {
    const q = { jornada: 'Jornada 5', estado: 'ABIERTA' as Estado, fechaCierre: new Date(CIERRE) };
    expect(decidirAccionCarga(q, 'Jornada 5', CIERRE - 1000)).toBe('sin-cambios');
  });

  it('reemplaza si la anterior está CERRADA o CADUCADA', () => {
    const cerrada = { jornada: 'Jornada 4', estado: 'CERRADA' as Estado, fechaCierre: new Date(CIERRE) };
    const caducada = { jornada: 'Jornada 4', estado: 'CADUCADA' as Estado, fechaCierre: null };
    expect(decidirAccionCarga(cerrada, 'Jornada 5', CIERRE - 1000)).toBe('reemplazar');
    expect(decidirAccionCarga(caducada, 'Jornada 5')).toBe('reemplazar');
  });

  it('reemplaza si la anterior ya pasó su fecha de cierre', () => {
    const q = { jornada: 'Jornada 4', estado: 'ABIERTA' as Estado, fechaCierre: new Date(CIERRE) };
    expect(decidirAccionCarga(q, 'Jornada 5', CIERRE + 1000)).toBe('reemplazar');
  });

  it('NO destruye una porra ABIERTA en curso (distinta jornada, aún en plazo)', () => {
    const q = { jornada: 'Jornada 4', estado: 'ABIERTA' as Estado, fechaCierre: new Date(CIERRE) };
    expect(decidirAccionCarga(q, 'Jornada 5', CIERRE - 1000)).toBe('omitir-activa');
  });

  it('omite si es ABIERTA en curso y sin fecha de cierre', () => {
    const q = { jornada: 'Jornada 4', estado: 'ABIERTA' as Estado, fechaCierre: null };
    expect(decidirAccionCarga(q, 'Jornada 5')).toBe('omitir-activa');
  });
});

import { describe, it, expect, beforeAll } from 'vitest';

type Estado = 'ABIERTA' | 'CERRADA' | 'CADUCADA';
let decidirAccionCarga: (
  existente: { jornada: string; estado: Estado; fechaCierre: Date | null } | null,
  jornadaNueva: string,
  ahora?: number,
) => 'crear' | 'sin-cambios' | 'reemplazar' | 'omitir-activa' | 'omitir-antigua';
let esJornadaAnterior: (nueva: string, existente: string) => boolean;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
  const mod = await import('../src/lib/cargaJornada');
  decidirAccionCarga = mod.decidirAccionCarga;
  esJornadaAnterior = mod.esJornadaAnterior;
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

  it('reemplaza si es ABIERTA de cierre desconocido (null): no se puede afirmar que siga en plazo', () => {
    // La fuente solo publica la jornada abierta; ver otra distinta implica que
    // la anterior ya pasó. Se archiva antes de borrar, así que nada se pierde.
    const q = { jornada: 'Jornada 4', estado: 'ABIERTA' as Estado, fechaCierre: null };
    expect(decidirAccionCarga(q, 'Jornada 5')).toBe('reemplazar');
  });

  it('NUNCA retrocede a una jornada anterior (página vieja), aunque la cargada esté cerrada', () => {
    const cerrada = { jornada: 'Jornada 14 - 2027', estado: 'CERRADA' as Estado, fechaCierre: new Date(CIERRE) };
    expect(decidirAccionCarga(cerrada, 'Jornada 13 - 2027', CIERRE + 1000)).toBe('omitir-antigua');
    expect(decidirAccionCarga(cerrada, 'Jornada 14 - 2026', CIERRE + 1000)).toBe('omitir-antigua');
    expect(decidirAccionCarga(cerrada, 'Jornada 15 - 2027', CIERRE + 1000)).toBe('reemplazar');
  });
});

describe('esJornadaAnterior', () => {
  it('compara por temporada y, dentro de ella, por número', () => {
    expect(esJornadaAnterior('Jornada 13 - 2027', 'Jornada 14 - 2027')).toBe(true);
    expect(esJornadaAnterior('Jornada 60 - 2026', 'Jornada 2 - 2027')).toBe(true);
    expect(esJornadaAnterior('Jornada 1 - 2027', 'Jornada 60 - 2026')).toBe(false); // temporada nueva
    expect(esJornadaAnterior('Jornada 15 - 2027', 'Jornada 14 - 2027')).toBe(false);
    expect(esJornadaAnterior('Jornada 4', 'Jornada 5')).toBe(true); // ambas sin año
  });

  it('si las etiquetas no son comparables, no las considera anteriores', () => {
    expect(esJornadaAnterior('Jornada 13', 'Jornada 14 - 2027')).toBe(false);
    expect(esJornadaAnterior('Jornada 13 - 2027', 'Jornada 14')).toBe(false);
    expect(esJornadaAnterior('Jornada ficticia', 'Jornada 14 - 2027')).toBe(false);
  });
});

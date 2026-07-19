import { describe, it, expect } from 'vitest';
import { parseaCabecera, aIso } from '../src/lib/jornadaFetcher';

describe('aIso — conversión de fechas de SELAE a ISO', () => {
  it('interpreta fechas naive como hora de España (verano CEST = +2)', () => {
    // 18:00 en Madrid (CEST) = 16:00 UTC
    expect(aIso('2026-07-10 18:00:00')).toBe('2026-07-10T16:00:00.000Z');
  });

  it('interpreta fechas naive en invierno (CET = +1)', () => {
    // 18:00 en Madrid (CET) = 17:00 UTC
    expect(aIso('2026-01-15 18:00:00')).toBe('2026-01-15T17:00:00.000Z');
  });

  it('acepta el separador "T" y respeta una zona horaria explícita', () => {
    expect(aIso('2026-07-10T18:00:00')).toBe('2026-07-10T16:00:00.000Z');
    expect(aIso('2026-07-10T16:00:00Z')).toBe('2026-07-10T16:00:00.000Z');
  });

  it('acepta solo-fecha (medianoche de España)', () => {
    // 00:00 del 10-jul en Madrid (CEST) = 22:00 del 9-jul UTC
    expect(aIso('2026-07-10')).toBe('2026-07-09T22:00:00.000Z');
  });

  it('devuelve null para valores nulos, vacíos o inválidos', () => {
    expect(aIso(null)).toBeNull();
    expect(aIso(undefined)).toBeNull();
    expect(aIso('')).toBeNull();
    expect(aIso('   ')).toBeNull();
    expect(aIso(12345)).toBeNull();
    expect(aIso('no es una fecha')).toBeNull();
    expect(aIso('2026-13-40 25:99:99')).toBeNull(); // fuera de rango
  });
});

describe('parseaCabecera — respuestas reales/simuladas de SELAE', () => {
  it('extrae jornada y cierre de la respuesta real de proximosv3', () => {
    const real = [
      {
        fecha: '2026-07-12 00:00:00',
        dia_semana: 'domingo',
        id_sorteo: '1316106041',
        game_id: 'LAQU',
        apertura: '2026-07-03 00:00:00',
        cierre: '2026-07-10 18:00:00',
        anyo: '2026',
        estado: 'abierto',
        jornada: 72,
      },
    ];
    const c = parseaCabecera(real);
    expect(c.numeroJornada).toBe(72);
    expect(c.anyo).toBe('2026');
    expect(c.idSorteo).toBe('1316106041');
    expect(c.fechaSorteoYmd).toBe('20260712');
    expect(c.fechaCierre).toBe('2026-07-10T16:00:00.000Z');
  });

  it('admite variantes de nombre (numero_jornada, fecha_cierre, anio, idsorteo)', () => {
    const variante = {
      numero_jornada: '34',
      fecha_cierre: '2026-01-15 20:00:00',
      fecha_sorteo: '2026-01-17 12:00:00',
      anio: 2025,
      idsorteo: 999,
    };
    const c = parseaCabecera(variante);
    expect(c.numeroJornada).toBe(34);
    expect(c.anyo).toBe('2025');
    expect(c.idSorteo).toBe('999');
    expect(c.fechaCierre).toBe('2026-01-15T19:00:00.000Z'); // CET +1
  });

  it('encuentra el sorteo aunque venga anidado bajo claves envolventes', () => {
    const anidado = {
      status: 'ok',
      data: { sorteos: [{ jornada: 40, cierre: '2026-03-01 18:00:00', id_sorteo: 'abc' }] },
    };
    const c = parseaCabecera(anidado);
    expect(c.numeroJornada).toBe(40);
    expect(c.idSorteo).toBe('abc');
  });

  it('devuelve null en numeroJornada/fechaCierre cuando faltan (sin inventar)', () => {
    const incompleta = [{ game_id: 'LAQU', estado: 'abierto', fecha: '2026-07-12 00:00:00' }];
    const c = parseaCabecera(incompleta);
    expect(c.numeroJornada).toBeNull();
    expect(c.fechaCierre).toBeNull();
    expect(c.fechaSorteoYmd).toBe('20260712');
  });

  it('lanza si la respuesta no contiene ningún sorteo', () => {
    expect(() => parseaCabecera({ error: 'sin datos' })).toThrow();
    expect(() => parseaCabecera([])).toThrow();
  });
});

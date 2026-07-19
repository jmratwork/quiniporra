import { describe, it, expect } from 'vitest';
import { parseaCabeceraBoleto } from '../src/lib/mundoDeportivo';
import { fechaCierreDesdeDiaSemana } from '../src/lib/fechas';

/** Devuelve { weekday, dia, hora, min } de un ISO, en hora de Madrid. */
function partesMadrid(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { weekday: g('weekday'), dia: g('day'), hora: g('hour'), min: g('minute') };
}

// Referencia fija para que la inferencia de fecha sea determinista.
const AHORA = Date.UTC(2026, 3, 10); // 10 abril 2026

describe('fechaCierreDesdeDiaSemana', () => {
  it('infiere el próximo "viernes 17" a las 18:00 (hora de Madrid)', () => {
    const iso = fechaCierreDesdeDiaSemana(5, 17, 18, 0, AHORA); // 5 = viernes
    expect(iso).not.toBeNull();
    const p = partesMadrid(iso!);
    expect(p.weekday).toBe('Fri');
    expect(p.dia).toBe('17');
    expect(p.hora).toBe('18');
    expect(p.min).toBe('00');
  });
});

describe('parseaCabeceraBoleto (Mundo Deportivo)', () => {
  const lineas = [
    'Pronóstico Quiniela',
    'Horario de cierre',
    'Hora de cierre',
    'Viernes 17 (17:30)-DNP1X2',
    'Viernes 17 (18:00)-Particulares',
    'Jornada 73',
    '2026',
    'DIA/HORA',
  ];

  it('extrae número de jornada y año', () => {
    const c = parseaCabeceraBoleto(lineas, AHORA);
    expect(c.numeroJornada).toBe(73);
    expect(c.anyo).toBe('2026');
  });

  it('prefiere el cierre "Particulares" (18:00) e infiere la fecha', () => {
    const c = parseaCabeceraBoleto(lineas, AHORA);
    expect(c.fechaCierre).not.toBeNull();
    const p = partesMadrid(c.fechaCierre!);
    expect(p.weekday).toBe('Fri');
    expect(p.dia).toBe('17');
    expect(p.hora).toBe('18');
    expect(p.min).toBe('00');
  });

  it('devuelve nulls cuando no encuentra los datos (sin inventar)', () => {
    const c = parseaCabeceraBoleto(['solo ruido', 'sin jornada ni cierre'], AHORA);
    expect(c.numeroJornada).toBeNull();
    expect(c.anyo).toBeNull();
    expect(c.fechaCierre).toBeNull();
  });
});

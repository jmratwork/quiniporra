import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/cron/jornada/route';

// La carga y la poda tocan Postgres y la red: se sustituyen por dobles.
const llamadas = vi.hoisted(() => ({ carga: 0 }));

vi.mock('../src/lib/cargaJornada', () => ({
  cargarJornadaAutomatica: async () => {
    llamadas.carga++;
    return { ok: true };
  },
}));
vi.mock('../src/lib/authStore', () => ({ podarEstadoAuth: async () => {} }));

const SECRETO = 'secreto-de-cron-de-test-con-32-caracteres-o-mas';

const peticion = (authorization?: string) =>
  new NextRequest('http://localhost/api/cron/jornada', {
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  llamadas.carga = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/jornada', () => {
  it('fuera de desarrollo, sin CRON_SECRET responde 500 y no carga nada', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(peticion());

    expect(res.status).toBe(500);
    expect(llamadas.carga).toBe(0);
  });

  it('con CRON_SECRET, rechaza una cabecera incorrecta', async () => {
    vi.stubEnv('CRON_SECRET', SECRETO);
    const res = await GET(peticion('Bearer otro-secreto'));

    expect(res.status).toBe(401);
    expect(llamadas.carga).toBe(0);
  });

  it('con la cabecera correcta, carga la jornada', async () => {
    vi.stubEnv('CRON_SECRET', SECRETO);
    const res = await GET(peticion(`Bearer ${SECRETO}`));

    expect(res.status).toBe(200);
    expect(llamadas.carga).toBe(1);
  });
});

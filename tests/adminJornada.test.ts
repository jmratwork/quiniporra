import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/admin/jornada/route';
import { COOKIE_SESION, crearTokenSesion } from '../src/lib/session';

// La carga y el estado de auth tocan Postgres y la red: se sustituyen por dobles.
const estado = vi.hoisted(() => ({
  permitido: true,
  llamadasCarga: [] as unknown[],
}));

vi.mock('../src/lib/cargaJornada', () => ({
  cargarJornadaAutomatica: async (opts: unknown) => {
    estado.llamadasCarga.push(opts);
    return { accion: 'crear', jornada: 'Jornada 14 - 2027' };
  },
}));
vi.mock('../src/lib/authStore', () => ({
  rateLimitPersistente: async () => ({ permitido: estado.permitido, resetEnMs: 60_000 }),
  sesionRevocada: async () => false,
}));

beforeAll(() => {
  process.env.SESSION_SECRET = 'secreto-de-test-para-la-firma-hmac';
});

beforeEach(() => {
  estado.permitido = true;
  estado.llamadasCarga = [];
});

const peticion = (conSesion: boolean) =>
  new NextRequest('http://localhost/api/admin/jornada', {
    method: 'POST',
    headers: conSesion ? { cookie: `${COOKIE_SESION}=${crearTokenSesion()}` } : {},
  });

describe('POST /api/admin/jornada', () => {
  it('sin sesión → 401 y no carga nada', async () => {
    const res = await POST(peticion(false));

    expect(res.status).toBe(401);
    expect(estado.llamadasCarga).toHaveLength(0);
  });

  it('con sesión, carga la jornada SIN caché y devuelve la acción', async () => {
    const res = await POST(peticion(true));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accion: 'crear', jornada: 'Jornada 14 - 2027' });
    expect(estado.llamadasCarga).toEqual([{ usarCache: false }]);
  });

  it('con el límite de cargas agotado → 429 y no consulta la fuente', async () => {
    estado.permitido = false;
    const res = await POST(peticion(true));

    expect(res.status).toBe(429);
    expect(estado.llamadasCarga).toHaveLength(0);
  });
});

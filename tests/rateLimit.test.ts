import { describe, it, expect, afterEach, vi } from 'vitest';
import { ipDe } from '../src/lib/rateLimit';

const peticion = (headers: Record<string, string>) =>
  new Request('http://localhost/', { headers });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ipDe', () => {
  it('prioriza las cabeceras de Vercel y toma la primera IP de la lista', () => {
    const req = peticion({
      'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1',
      'x-forwarded-for': '198.51.100.9',
    });
    expect(ipDe(req)).toBe('203.0.113.7');
    expect(ipDe(peticion({ 'x-real-ip': '203.0.113.8' }))).toBe('203.0.113.8');
  });

  it('recorta valores enormes a 64 caracteres', () => {
    expect(ipDe(peticion({ 'x-vercel-forwarded-for': 'a'.repeat(5000) }))).toHaveLength(64);
  });

  it('fuera de Vercel cae a x-forwarded-for', () => {
    vi.stubEnv('VERCEL', '');
    expect(ipDe(peticion({ 'x-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('en Vercel nunca usa x-forwarded-for (la puede escribir el cliente)', () => {
    vi.stubEnv('VERCEL', '1');
    expect(ipDe(peticion({ 'x-forwarded-for': '198.51.100.9' }))).toBe('desconocida');
  });
});

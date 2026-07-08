import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AdminAuthError } from './auth';
import { JornadaFetchError } from './jornadaFetcher';

/** Respuesta JSON de éxito. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Respuesta JSON de error con forma { error, detalle? }. */
export function error(
  mensaje: string,
  status: number,
  detalle?: string,
): NextResponse {
  return NextResponse.json(
    detalle ? { error: mensaje, detalle } : { error: mensaje },
    { status },
  );
}

/**
 * Traduce excepciones conocidas a respuestas HTTP coherentes.
 * Se usa en el catch de cada route handler.
 */
export function manejaError(e: unknown): NextResponse {
  if (e instanceof AdminAuthError) {
    return error(e.message, e.status);
  }
  if (e instanceof JornadaFetchError) {
    return error(e.message, 502, e.detalle);
  }
  if (e instanceof ZodError) {
    return error(
      'Datos de entrada no válidos.',
      400,
      e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  console.error('Error no controlado:', e);
  return error('Error interno del servidor.', 500);
}

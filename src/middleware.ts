import { NextRequest, NextResponse } from 'next/server';

/**
 * Content-Security-Policy basada en NONCE (por petición).
 *
 * En vez de permitir `'unsafe-inline'` en `script-src`, cada respuesta lleva un
 * nonce aleatorio; Next lo lee de la cabecera CSP de la petición y lo aplica a
 * sus scripts de hidratación del App Router. Con `'strict-dynamic'`, solo se
 * ejecutan scripts con ese nonce (o cargados por uno que lo tenga), lo que
 * cierra la vía de XSS por `<script>` inyectado que dejaba abierta la CSP anterior.
 *
 * Las páginas se renderizan de forma dinámica (`dynamic = 'force-dynamic'`), así
 * que el nonce es único por petición (nunca se cachea uno reutilizable).
 */

const esProduccion = process.env.NODE_ENV === 'production';

function construyeCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // Los estilos inline (Tailwind, estilos de Next) siguen necesitando inline.
    "style-src 'self' 'unsafe-inline'",
    // Scripts: nonce + strict-dynamic; en desarrollo, además unsafe-eval (HMR).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${esProduccion ? '' : " 'unsafe-eval'"}`,
    `connect-src 'self'${esProduccion ? '' : ' ws:'}`,
  ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  // Web Crypto (disponible en el runtime Edge del middleware).
  const nonce = btoa(crypto.randomUUID());
  const csp = construyeCsp(nonce);

  // Se pasa el nonce a Next vía cabeceras de la PETICIÓN para que lo aplique a
  // sus scripts; y la CSP se emite también en la RESPUESTA.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Todo salvo assets estáticos (no ejecutan scripts inline y se cachean).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

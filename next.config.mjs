/** @type {import('next').NextConfig} */

const esProduccion = process.env.NODE_ENV === 'production';

// La Content-Security-Policy se emite desde `middleware.ts` porque usa un NONCE
// por petición (evita 'unsafe-inline' en script-src). Aquí quedan las cabeceras
// de seguridad estáticas, que se aplican a todas las rutas (incluidos assets).
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS solo en producción (evita "fijar" HTTPS en localhost).
  ...(esProduccion
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  // No revelar el framework en la cabecera X-Powered-By.
  poweredByHeader: false,
  // En Next 15 los paquetes que solo funcionan en servidor se declaran aquí
  // (antes estaba en experimental.serverComponentsExternalPackages).
  serverExternalPackages: ['@prisma/client', 'pdf-lib'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

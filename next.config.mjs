/** @type {import('next').NextConfig} */

const esProduccion = process.env.NODE_ENV === 'production';

// Content-Security-Policy. En desarrollo, Next necesita 'unsafe-eval' y
// WebSocket (HMR); en producción no. Se usa 'unsafe-inline' para scripts porque
// Next inyecta scripts de hidratación inline sin nonce en el App Router; una CSP
// más estricta requeriría nonces vía middleware. Aun así, esta política ya
// restringe orígenes, frame-ancestors (anti-clickjacking), object-src y base-uri.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${esProduccion ? '' : " 'unsafe-eval'"}`,
  `connect-src 'self'${esProduccion ? '' : ' ws:'}`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
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

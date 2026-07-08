/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // En Next 15 los paquetes que solo funcionan en servidor se declaran aquí
  // (antes estaba en experimental.serverComponentsExternalPackages).
  serverExternalPackages: ['@prisma/client', 'pdf-lib'],
};

export default nextConfig;

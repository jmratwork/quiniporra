import { PrismaClient } from '@prisma/client';

// Cliente Prisma como singleton para evitar agotar el pool de conexiones
// en desarrollo (hot-reload) y en entornos serverless (Vercel).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

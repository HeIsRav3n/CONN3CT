import { PrismaClient } from '@prisma/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('prisma');

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
      ...(process.env['NODE_ENV'] === 'development'
        ? [{ level: 'query' as const, emit: 'event' as const }]
        : []),
    ],
  });

  client.$on('warn', (e) => log.warn('Prisma warning', { message: e.message }));
  client.$on('error', (e) => log.error('Prisma error', { message: e.message }));
  if (process.env['NODE_ENV'] === 'development') {
    client.$on('query', (e) =>
      log.debug('Prisma query', { query: e.query, duration: e.duration }),
    );
  }

  return client;
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

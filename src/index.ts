// ============================================================
// CONN3CT PNL — Main Application Entry Point
// Boots: Discord Bot + Express API + BullMQ Workers + Scheduler
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

// Ensure logs directory exists before Winston tries to write to it
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

import { createChildLogger } from './utils/logger';
import { getConfig } from './utils/config';
import { validateEnvironment } from './utils/startup';
import { prisma, disconnectPrisma } from './database/prisma';
import { getRedisClient, closeRedis } from './cache/redis';
import { startDiscordBot } from './bot/index';
import { createApiServer } from './api/server';
import { createSyncWorker } from './workers/syncWorker';
import { createPriceWorker } from './workers/priceWorker';
import { createPnlWorker } from './workers/pnlWorker';
import { startScheduler } from './workers/scheduler';
import { Worker } from 'bullmq';

const log = createChildLogger('main');

// ── Graceful shutdown ─────────────────────────────────────────
const workers: Worker[] = [];

async function shutdown(signal: string): Promise<void> {
  log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Close workers
    await Promise.all(workers.map((w) => w.close()));
    log.info('Workers closed');

    // Disconnect Prisma
    await disconnectPrisma();
    log.info('Prisma disconnected');

    // Close Redis
    await closeRedis();
    log.info('Redis disconnected');

    process.exit(0);
  } catch (err: any) {
    log.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', { reason });
  process.exit(1);
});

// ── Bootstrap ─────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  validateEnvironment();
  const cfg = getConfig();
  log.info('Starting CONN3CT PNL', { nodeEnv: cfg.nodeEnv, version: process.env['npm_package_version'] ?? '1.0.0' });

  // ── 1. Verify database connection ─────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`;
    log.info('Database connected');
  } catch (err: any) {
    log.error('Database connection failed', { error: err.message });
    process.exit(1);
  }

  // ── 2. Verify Redis connection ─────────────────────────────
  try {
    const redis = getRedisClient();
    await redis.ping();
    log.info('Redis connected');
  } catch (err: any) {
    log.error('Redis connection failed', { error: err.message });
    process.exit(1);
  }

  // ── 3. Start BullMQ workers ────────────────────────────────
  const syncWorker = createSyncWorker();
  const priceWorker = createPriceWorker();
  const pnlWorker = createPnlWorker();
  workers.push(syncWorker, priceWorker, pnlWorker);
  log.info('Workers started', { count: workers.length });

  // ── 4. Start scheduler ─────────────────────────────────────
  await startScheduler();
  log.info('Scheduler started');

  // ── 5. Start Express API server ────────────────────────────
  const app = createApiServer();
  const server = app.listen(cfg.port, () => {
    log.info(`API server listening on port ${cfg.port}`, {
      health: `http://localhost:${cfg.port}/health`,
      metrics: `http://localhost:${cfg.port}/metrics`,
      jobs: `http://localhost:${cfg.port}/jobs`,
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    log.error('HTTP server error', { error: err.message });
  });

  // ── 6. Start Discord bot ───────────────────────────────────
  const client = await startDiscordBot();
  log.info('Discord bot started', { tag: client.user?.tag });

  log.info('🚀 CONN3CT PNL fully operational');
}

bootstrap().catch((err: Error) => {
  log.error('Bootstrap failed', { error: err.message, stack: err.stack });
  process.exit(1);
});

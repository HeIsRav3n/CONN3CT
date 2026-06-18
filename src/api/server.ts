// ============================================================
// CONN3CT PNL — Express REST API + Prometheus Metrics
// Internal API for health checks, job dashboard, and monitoring
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { syncQueue, priceQueue, pnlQueue } from '../workers/queues';
import { getConfig } from '../utils/config';
import { createChildLogger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { getRedisClient } from '../cache/redis';

const log = createChildLogger('api-server');

// ── Prometheus metrics ─────────────────────────────────────────
client.collectDefaultMetrics({ prefix: 'conn3ct_pnl_' });

export const discordCommandsTotal = new client.Counter({
  name: 'conn3ct_pnl_discord_commands_total',
  help: 'Total Discord slash commands processed',
  labelNames: ['command', 'status'],
});

export const walletSyncsTotal = new client.Counter({
  name: 'conn3ct_pnl_wallet_syncs_total',
  help: 'Total wallet sync jobs processed',
  labelNames: ['type', 'status'],
});

export const apiLatency = new client.Histogram({
  name: 'conn3ct_pnl_api_latency_seconds',
  help: 'OpenSea API request latency',
  labelNames: ['endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const activeWallets = new client.Gauge({
  name: 'conn3ct_pnl_active_wallets',
  help: 'Number of actively tracked wallets',
});

export const totalUsers = new client.Gauge({
  name: 'conn3ct_pnl_total_users',
  help: 'Total registered users',
});

// ── Bull Board setup ──────────────────────────────────────────
function createBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/jobs');

  createBullBoard({
    queues: [
      new BullMQAdapter(syncQueue) as any,
      new BullMQAdapter(priceQueue) as any,
      new BullMQAdapter(pnlQueue) as any,
    ],
    serverAdapter,
  });

  return serverAdapter.getRouter();
}

// ── Express app factory ───────────────────────────────────────
export function createApiServer(): express.Application {
  const app = express();
  const cfg = getConfig();

  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // Rate limit all routes
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ── Health check ────────────────────────────────────────────
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const redis = getRedisClient();
      await redis.ping();

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        redis: 'connected',
        uptime: process.uptime(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'degraded',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Readiness probe ─────────────────────────────────────────
  app.get('/ready', (_req: Request, res: Response) => {
    res.json({ ready: true });
  });

  // ── Prometheus metrics ──────────────────────────────────────
  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      // Update gauges before scraping
      const [walletCount, userCount] = await Promise.all([
        prisma.wallet.count({ where: { status: { not: 'INACTIVE' } } }),
        prisma.user.count({ where: { isActive: true } }),
      ]);
      activeWallets.set(walletCount);
      totalUsers.set(userCount);

      res.set('Content-Type', client.register.contentType);
      res.end(await client.register.metrics());
    } catch (err: any) {
      res.status(500).end(err.message);
    }
  });

  // ── Bull Board (protected with basic auth) ──────────────────
  const bullMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const credentials = basicAuth(req);
    const validUser = cfg.security.apiSecretKey;
    const expectedUser = process.env['BULL_BOARD_USERNAME'] ?? 'admin';
    const expectedPass = process.env['BULL_BOARD_PASSWORD'] ?? validUser;

    if (!credentials || credentials.name !== expectedUser || credentials.pass !== expectedPass) {
      res.set('WWW-Authenticate', 'Basic realm="Bull Dashboard"');
      res.status(401).end('Access denied');
      return;
    }
    next();
  };

  app.use('/jobs', bullMiddleware, createBullBoardRouter());

  // ── Queue stats API ─────────────────────────────────────────
  app.get('/api/queues/stats', bullMiddleware, async (_req, res) => {
    try {
      const [syncCounts, priceCounts, pnlCounts] = await Promise.all([
        syncQueue.getJobCounts(),
        priceQueue.getJobCounts(),
        pnlQueue.getJobCounts(),
      ]);
      res.json({ sync: syncCounts, price: priceCounts, pnl: pnlCounts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Global error handler ────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Unhandled API error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Basic-auth import workaround (this package is CommonJS)
function basicAuth(req: Request): { name: string; pass: string } | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) return undefined;
  const encoded = header.slice(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return undefined;
  return { name: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
}

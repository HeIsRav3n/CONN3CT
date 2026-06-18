// ── BullMQ Queue definitions — single source of truth ────────
// NOTE: BullMQ v5 bundles its own internal ioredis, so we must pass
// connection options (not a Redis instance) to avoid type conflicts.
import { Queue } from 'bullmq';
import { getConfig } from '../utils/config';
import type { WalletSyncJobData, PriceUpdateJobData, PnlRecalculateJobData } from '../types';

export function getRedisConnectionOpts() {
  const cfg = getConfig();
  return {
    host: cfg.redis.host,
    port: cfg.redis.port,
    ...(cfg.redis.password ? { password: cfg.redis.password } : {}),
    db: cfg.redis.db,
    ...(cfg.redis.tls ? { tls: {} } : {}),
    maxRetriesPerRequest: null as unknown as number, // BullMQ requirement
    enableReadyCheck: false,
  };
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

// Untyped Queues — avoids BullMQ v5 ExtractNameType generic constraints
export const syncQueue = new Queue('wallet-sync', {
  connection: getRedisConnectionOpts(),
  defaultJobOptions,
});

export const priceQueue = new Queue('price-update', {
  connection: getRedisConnectionOpts(),
  defaultJobOptions: { ...defaultJobOptions, attempts: 3, backoff: { type: 'exponential' as const, delay: 3000 } },
});

export const pnlQueue = new Queue('pnl-recalculate', {
  connection: getRedisConnectionOpts(),
  defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
});

// ── Typed enqueue helpers ─────────────────────────────────────
export async function enqueueSyncJob(
  data: WalletSyncJobData,
  delay?: number,
): Promise<void> {
  await syncQueue.add('sync', data, {
    delay,
    jobId: `sync-${data.walletId}-${data.jobType}`,
  });
}

export async function enqueuePriceUpdate(updateAll = true): Promise<void> {
  const jobData: PriceUpdateJobData = { updateAll };
  await priceQueue.add('price-update', jobData, {
    jobId: 'price-update-all',
  });
}

export async function enqueuePnlRecalculate(data: PnlRecalculateJobData): Promise<void> {
  await pnlQueue.add('pnl-recalculate', data);
}

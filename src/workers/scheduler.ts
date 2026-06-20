// ── Recurring job scheduler ───────────────────────────────────
// Uses BullMQ's built-in repeatable jobs so schedules survive restarts.

import { syncQueue, priceQueue } from './queues';
import { getAllActiveWallets } from '../database/repositories/walletRepository';
import { getConfig } from '../utils/config';
import { createChildLogger } from '../utils/logger';
import { prisma } from '../database/prisma';

const log = createChildLogger('scheduler');

export async function startScheduler(): Promise<void> {
  const cfg = getConfig();

  // ── Repeatable: price update every 10 minutes ─────────────
  await (priceQueue.add as any)(
    'scheduled-price-update',
    { updateAll: true },
    {
      jobId: 'recurring-price-update',
      repeat: { every: cfg.workers.priceUpdateIntervalMs },
    },
  );

  // ── Repeatable: wallet incremental sync every 5 minutes ───
  await (syncQueue.add as any)(
    'scheduled-incremental-sync',
    { trigger: 'scheduler' },
    {
      jobId: 'recurring-wallet-sync-trigger',
      repeat: { every: cfg.workers.walletSyncIntervalMs },
    },
  );

  log.info('Scheduler started', {
    priceIntervalMs: cfg.workers.priceUpdateIntervalMs,
    syncIntervalMs: cfg.workers.walletSyncIntervalMs,
  });
}

// Called by the recurring sync trigger to enqueue individual wallets
export async function scheduleIncrementalSyncs(): Promise<void> {
  const wallets = await getAllActiveWallets();

  for (const wallet of wallets) {
    const syncJob = await prisma.syncJob.create({
      data: {
        userId: wallet.userId,
        walletId: wallet.id,
        jobType: 'INCREMENTAL',
        status: 'PENDING',
      },
    });

    await (syncQueue.add as any)(
      `incremental-${wallet.address}`,
      {
        userId: wallet.userId,
        walletId: wallet.id,
        walletAddress: wallet.address,
        jobType: 'INCREMENTAL',
        syncJobId: syncJob.id,
      },
      { jobId: `incremental-${wallet.id}-${Date.now()}` },
    );
  }

  log.info('Scheduled incremental syncs', { count: wallets.length });
}

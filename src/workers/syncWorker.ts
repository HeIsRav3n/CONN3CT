import { Worker, Job } from 'bullmq';
import { getRedisConnectionOpts } from './queues';
import { createChildLogger } from '../utils/logger';
import { syncWallet } from '../engines/sync';
import { invalidatePortfolioCache } from '../engines/portfolio';
import { scheduleIncrementalSyncs } from './scheduler';
import { getConfig } from '../utils/config';
import { prisma } from '../database/prisma';
import type { WalletSyncJobData } from '../types';

const log = createChildLogger('sync-worker');

// Discriminated payload — regular wallet sync OR scheduler trigger
type SyncPayload = WalletSyncJobData | { trigger: 'scheduler' };

export function createSyncWorker(): Worker {
  const cfg = getConfig();

  const worker = new Worker(
    'wallet-sync',
    async (job: Job<SyncPayload>) => {
      // ── Scheduler trigger: fan-out to individual wallet jobs ──
      if ('trigger' in job.data) {
        log.info('Processing scheduler trigger — fanning out incremental syncs');
        await scheduleIncrementalSyncs();
        return;
      }

      // ── Regular wallet sync ───────────────────────────────────
      const { userId, walletId, walletAddress, jobType, syncJobId } = job.data;
      log.info('Processing sync job', { walletAddress, jobType, jobId: job.id });

      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      try {
        await syncWallet({
          userId,
          walletId,
          walletAddress,
          isFullSync: jobType === 'FULL_HISTORY',
          syncJobId,
          onProgress: async (processed, total) => {
            const pct = Math.round((processed / total) * 100);
            await job.updateProgress(pct);
            await prisma.syncJob.update({
              where: { id: syncJobId },
              data: { processedItems: processed, totalItems: total, progress: pct },
            });
          },
        });

        await prisma.syncJob.update({
          where: { id: syncJobId },
          data: { status: 'COMPLETED', completedAt: new Date(), progress: 100 },
        });

        await invalidatePortfolioCache(userId);
        log.info('Sync job completed', { walletAddress, jobId: job.id });
      } catch (err: any) {
        await prisma.syncJob.update({
          where: { id: syncJobId },
          data: { status: 'FAILED', errorMessage: err.message, completedAt: new Date() },
        });
        throw err;
      }
    },
    {
      connection: getRedisConnectionOpts(),
      concurrency: cfg.workers.syncConcurrency,
      limiter: { max: 5, duration: 1000 },
    },
  );

  worker.on('completed', (job) =>
    log.info('Sync job done', { jobId: job.id }),
  );
  worker.on('failed', (job, err) =>
    log.error('Sync job failed', { jobId: job?.id, error: err.message }),
  );
  worker.on('error', (err) => log.error('Sync worker error', { error: err.message }));

  return worker;
}

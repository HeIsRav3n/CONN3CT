import { Worker, Job } from 'bullmq';
import { getRedisConnectionOpts } from './queues';
import { createChildLogger } from '../utils/logger';
import { getEthPriceUsd } from '../api/ethereum/client';
import { getHoldingsWithPnl, upsertPnlRecord } from '../database/repositories/pnlRepository';
import { calculateUnrealizedPnl } from '../engines/fifo';
import { invalidatePortfolioCache } from '../engines/portfolio';
import { getConfig } from '../utils/config';
import type { PnlRecalculateJobData } from '../types';

const log = createChildLogger('pnl-worker');

export function createPnlWorker(): Worker<PnlRecalculateJobData> {
  const cfg = getConfig();

  const worker = new Worker<PnlRecalculateJobData>(
    'pnl-recalculate',
    async (job: Job<PnlRecalculateJobData>) => {
      const { userId, walletId, nftId } = job.data;
      log.info('Recalculating P&L', { userId, walletId, nftId });

      const ethPrice = await getEthPriceUsd();
      const holdings = await getHoldingsWithPnl(walletId);

      const filtered = nftId
        ? holdings.filter((h) => h.nftId === nftId)
        : holdings;

      for (const holding of filtered) {
        const floorPriceEth = parseFloat(
          (holding.nft.collection as any).floorPriceEth?.toString() ?? '0',
        ).toFixed(18);

        const pnl = calculateUnrealizedPnl({
          costBasisEth: holding.costBasisEth.toString(),
          gasFeeEth: holding.gasFeeEth.toString(),
          currentFloorPriceEth: floorPriceEth,
          ethPriceUsd: ethPrice,
        });

        await upsertPnlRecord({
          userId,
          walletId,
          nftId: holding.nftId,
          costBasisEth: holding.costBasisEth.toString(),
          buyGasFeeEth: holding.gasFeeEth.toString(),
          totalCostEth: pnl.totalCostEth,
          unrealizedPnlEth: pnl.unrealizedPnlEth,
          unrealizedPnlUsd: pnl.unrealizedPnlUsd,
          roiPct: pnl.roiPct,
          isRealized: false,
        });
      }

      await invalidatePortfolioCache(userId);
      log.info('P&L recalculation complete', { userId, count: filtered.length });
    },
    {
      connection: getRedisConnectionOpts(),
      concurrency: cfg.workers.pnlConcurrency,
    },
  );

  worker.on('failed', (job, err) =>
    log.error('PNL worker failed', { jobId: job?.id, error: err.message }),
  );

  return worker;
}

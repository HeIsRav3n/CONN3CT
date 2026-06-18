import { Worker, Job } from 'bullmq';
import { getRedisConnectionOpts } from './queues';
import { createChildLogger } from '../utils/logger';
import { getOpenSeaClient } from '../api/opensea/client';
import { getEthPriceUsd } from '../api/ethereum/client';
import { getCollectionsStalePrices, updateCollectionStats } from '../database/repositories/nftRepository';
import { cacheSet } from '../cache/redis';
import { CK, TTL } from '../cache/cacheKeys';
import { getConfig } from '../utils/config';
import { prisma } from '../database/prisma';
import type { PriceUpdateJobData } from '../types';

const log = createChildLogger('price-worker');

export function createPriceWorker(): Worker<PriceUpdateJobData> {
  const cfg = getConfig();

  const worker = new Worker<PriceUpdateJobData>(
    'price-update',
    async (job: Job<PriceUpdateJobData>) => {
      log.info('Processing price update job', { jobId: job.id });

      // ── Update ETH/USD price ──────────────────────────────
      try {
        const ethPriceUsd = await getEthPriceUsd();
        await cacheSet(CK.ethPrice(), ethPriceUsd, TTL.ETH_PRICE);
        await prisma.ethPriceHistory.create({
          data: { priceUsd: ethPriceUsd, timestamp: new Date(), source: 'coingecko' },
        });
        log.debug('Updated ETH price', { ethPriceUsd });
      } catch (err: any) {
        log.warn('Failed to update ETH price', { error: err.message });
      }

      // ── Update stale collection floor prices ──────────────
      const staleCollections = await getCollectionsStalePrices(TTL.COLLECTION_STATS);
      const opensea = getOpenSeaClient();

      log.info('Updating floor prices', { count: staleCollections.length });

      for (const collection of staleCollections) {
        try {
          const stats = await opensea.getCollectionStats(collection.slug);
          const total = stats.total;

          await updateCollectionStats(collection.id, {
            floorPriceEth: total.floor_price.toFixed(18),
            volumeAllTimeEth: total.volume.toFixed(18),
            numOwners: total.num_owners,
            marketCapEth: total.market_cap.toFixed(18),
          });

          // Cache individual floor price
          await cacheSet(
            CK.floorPrice(collection.slug),
            total.floor_price,
            TTL.FLOOR_PRICE,
          );

          log.debug('Updated floor price', { slug: collection.slug, floor: total.floor_price });
        } catch (err: any) {
          log.warn('Failed to update collection price', {
            slug: collection.slug,
            error: err.message,
          });
        }
      }
    },
    {
      connection: getRedisConnectionOpts(),
      concurrency: cfg.workers.priceConcurrency,
    },
  );

  worker.on('completed', (job) => log.info('Price update completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    log.error('Price update failed', { jobId: job?.id, error: err.message }),
  );

  return worker;
}

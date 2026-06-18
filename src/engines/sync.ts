// ============================================================
// CONN3CT PNL — Historical Sync Engine
//
// Scans a wallet's complete NFT transaction history and builds
// the database state: collections, NFTs, transactions, holdings,
// and P&L records. Supports both full and incremental syncs.
// ============================================================

import { prisma } from '../database/prisma';
import { getOpenSeaClient } from '../api/opensea/client';
import { getGasDataForTx, getEthPriceUsd } from '../api/ethereum/client';
import {
  upsertCollection,
  upsertNft,
  findCollectionByContract,
} from '../database/repositories/nftRepository';
import { upsertTransaction, findBuyTransactionsForNft } from '../database/repositories/transactionRepository';
import { upsertHolding, deleteHolding, upsertPnlRecord } from '../database/repositories/pnlRepository';
import { updateWalletStatus, updateWalletSyncBlock } from '../database/repositories/walletRepository';
import {
  buildFifoBatch,
  consumeFifoBatches,
  calculateRealizedPnl,
  calculateUnrealizedPnl,
  classifyTransaction,
  parsePaymentAmountToEth,
} from './fifo';
import { calcMarketplaceFee, calcRoyaltyFee } from '../utils/math';
import { createChildLogger } from '../utils/logger';
import { getCurrentBlock } from '../api/ethereum/client';
import type { OpenSeaNftEvent } from '../types';
import type { SyncJob } from '@prisma/client';

const log = createChildLogger('sync-engine');

export interface SyncOptions {
  userId: string;
  walletId: string;
  walletAddress: string;
  isFullSync: boolean;
  fromBlock?: number;
  syncJobId: string;
  onProgress?: (processed: number, total: number) => Promise<void>;
}

export async function syncWallet(opts: SyncOptions): Promise<void> {
  const { userId, walletId, walletAddress, isFullSync, syncJobId } = opts;
  const opensea = getOpenSeaClient();

  log.info('Starting wallet sync', { walletAddress, isFullSync });

  try {
    await updateWalletStatus(walletId, 'SYNCING');

    // Collect all events first, then process
    const events: OpenSeaNftEvent[] = [];
    const eventTypes = ['sale', 'transfer'];

    for await (const event of opensea.iterateWalletEvents(walletAddress, eventTypes)) {
      events.push(event);
    }

    log.info('Collected events', { walletAddress, count: events.length });

    // Sort chronologically for FIFO accuracy
    const sorted = events.sort((a, b) => {
      const tA = a.closingDate ?? 0;
      const tB = b.closingDate ?? 0;
      return tA - tB;
    });

    let processed = 0;
    const ethPrice = await getEthPriceUsd();

    for (const event of sorted) {
      try {
        await processEvent(event, walletAddress, userId, walletId, ethPrice);
        processed++;
        if (opts.onProgress && processed % 10 === 0) {
          await opts.onProgress(processed, sorted.length);
        }
      } catch (err: any) {
        log.error('Failed to process event', {
          error: err.message,
          txHash: event.transaction,
          eventType: event.eventType,
        });
      }
    }

    // Mark final block
    const currentBlock = await getCurrentBlock();
    await updateWalletSyncBlock(walletId, BigInt(currentBlock));

    log.info('Wallet sync completed', { walletAddress, processed, total: sorted.length });
  } catch (err: any) {
    log.error('Wallet sync failed', { walletAddress, error: err.message });
    await updateWalletStatus(walletId, 'ERROR', err.message);
    throw err;
  }
}

// ── Process a single OpenSea event ───────────────────────────
async function processEvent(
  event: OpenSeaNftEvent,
  walletAddress: string,
  userId: string,
  walletId: string,
  ethPrice: number,
): Promise<void> {
  const txHash = event.transaction;
  if (!txHash) return;

  const nft = event.nft;
  if (!nft?.contract || !nft?.identifier) return;

  const contractAddress = nft.contract.toLowerCase();
  const tokenId = nft.identifier;
  const quantity = parseInt(event.quantity ?? '1', 10);

  // ── Ensure collection exists ──────────────────────────────
  let collection = await findCollectionByContract(contractAddress);
  if (!collection) {
    const opensea = getOpenSeaClient();
    const osColl = await opensea.getCollectionByContract(contractAddress);
    if (osColl) {
      const fee = osColl.fees.find((f) => f.required) ?? osColl.fees[0];
      const royaltyFee = osColl.fees.find((f) => !f.required);
      collection = await upsertCollection({
        slug: osColl.collection,
        name: osColl.name,
        contractAddress,
        description: osColl.description,
        imageUrl: osColl.imageUrl,
        bannerUrl: osColl.bannerImageUrl,
        twitterUsername: osColl.twitterUsername,
        discordUrl: osColl.discordUrl,
        royaltyBps: royaltyFee ? Math.round(royaltyFee.fee * 100) : 0,
        openseaFeeBps: fee ? Math.round(fee.fee * 100) : 250,
      });
    } else {
      collection = await upsertCollection({
        slug: `unknown-${contractAddress.slice(0, 8)}`,
        name: `Unknown Collection (${contractAddress.slice(0, 8)})`,
        contractAddress,
      });
    }
  }

  // ── Ensure NFT exists ─────────────────────────────────────
  const nftRecord = await upsertNft({
    tokenId,
    contractAddress,
    collectionId: collection.id,
    name: nft.name,
    imageUrl: nft.imageUrl ?? nft.displayImageUrl,
  });

  // ── Classify the event ────────────────────────────────────
  const isSale = event.eventType === 'sale';
  const txType = classifyTransaction(
    walletAddress,
    event.fromAddress ?? event.seller,
    event.toAddress ?? event.buyer,
    isSale,
  );

  // ── Parse price ───────────────────────────────────────────
  let priceEth = '0';
  if (isSale && event.payment) {
    priceEth = parsePaymentAmountToEth(event.payment.quantity, event.payment.decimals);
  }

  // ── Get gas data on-chain ─────────────────────────────────
  const gasData = await getGasDataForTx(txHash);
  const gasFeeEth = gasData?.gasFeeEth ?? '0';

  const timestamp = event.closingDate
    ? new Date(event.closingDate * 1000)
    : new Date();

  const priceUsd = ethPrice > 0 ? (parseFloat(priceEth) * ethPrice).toFixed(2) : null;
  const gasFeeUsd = ethPrice > 0 ? (parseFloat(gasFeeEth) * ethPrice).toFixed(2) : null;

  // ── Marketplace and royalty fees ──────────────────────────
  const marketplaceFeeEth = isSale
    ? calcMarketplaceFee(priceEth, collection.openseaFeeBps ?? 250)
    : '0';
  const royaltyFeeEth = isSale
    ? calcRoyaltyFee(priceEth, collection.royaltyBps ?? 0)
    : '0';

  // ── Persist transaction ───────────────────────────────────
  const tx = await upsertTransaction({
    txHash,
    nftId: nftRecord.id,
    walletId,
    counterpartyAddress:
      txType === 'BUY' ? (event.seller?.toLowerCase() ?? null) :
      txType === 'SELL' ? (event.buyer?.toLowerCase() ?? null) : null,
    eventType: txType,
    quantity,
    priceEth,
    priceUsd,
    ethPriceAtTime: ethPrice.toFixed(2),
    gasUsed: gasData?.gasUsed ?? null,
    gasPriceWei: gasData?.gasPriceWei ?? null,
    gasFeeEth,
    gasFeeUsd,
    marketplaceFeeEth: isSale ? marketplaceFeeEth : null,
    marketplaceFeePct: isSale ? ((collection.openseaFeeBps ?? 250) / 100).toFixed(2) : null,
    royaltyFeeEth: isSale ? royaltyFeeEth : null,
    royaltyFeePct: isSale ? ((collection.royaltyBps ?? 0) / 100).toFixed(2) : null,
    marketplace: 'opensea',
    blockNumber: gasData ? null : null,
    timestamp,
    processedAt: new Date(),
  });

  // ── Update holdings and P&L ───────────────────────────────
  if (txType === 'BUY' || txType === 'MINT' || txType === 'TRANSFER_IN') {
    await upsertHolding({
      nftId: nftRecord.id,
      walletId,
      costBasisEth: priceEth,
      costBasisUsd: priceUsd,
      gasFeeEth,
      acquisitionTxId: tx.id,
      acquisitionDate: timestamp,
    });

    // Unrealized P&L
    const floorPriceEth = parseFloat(collection.floorPriceEth?.toString() ?? '0').toFixed(18);
    const unrealized = calculateUnrealizedPnl({
      costBasisEth: priceEth,
      gasFeeEth,
      currentFloorPriceEth: floorPriceEth,
      ethPriceUsd: ethPrice,
    });

    await upsertPnlRecord({
      userId,
      walletId,
      nftId: nftRecord.id,
      costBasisEth: priceEth,
      buyGasFeeEth: gasFeeEth,
      totalCostEth: unrealized.totalCostEth,
      unrealizedPnlEth: unrealized.unrealizedPnlEth,
      unrealizedPnlUsd: unrealized.unrealizedPnlUsd,
      roiPct: unrealized.roiPct,
      isRealized: false,
    });
  } else if (txType === 'SELL' || txType === 'TRANSFER_OUT') {
    // Fetch buy transactions for FIFO
    const buyTxs = await findBuyTransactionsForNft(nftRecord.id, walletId);

    if (buyTxs.length > 0) {
      const batches = buyTxs.map((b) =>
        buildFifoBatch(
          b.priceEth.toString(),
          b.gasFeeEth?.toString() ?? '0',
          b.quantity,
          b.timestamp,
          b.txHash,
        ),
      );

      const fifoResult = consumeFifoBatches(batches, quantity);
      const realized = calculateRealizedPnl({
        costBasisEth: fifoResult.costBasisEth,
        buyGasFeeEth: fifoResult.gasFeeEth,
        salePriceEth: priceEth,
        sellGasFeeEth: gasFeeEth,
        marketplaceFeeEth,
        royaltyFeeEth,
        ethPriceUsd: ethPrice,
      });

      const holdDurationDays = Math.floor(
        (timestamp.getTime() - fifoResult.acquisitionDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      await upsertPnlRecord({
        userId,
        walletId,
        nftId: nftRecord.id,
        sellTransactionId: tx.id,
        costBasisEth: realized.costBasisEth,
        salePriceEth: priceEth,
        buyGasFeeEth: realized.buyGasFeeEth,
        sellGasFeeEth: gasFeeEth,
        marketplaceFeeEth,
        royaltyFeeEth,
        totalCostEth: realized.totalCostEth,
        netProceedsEth: realized.netProceedsEth,
        realizedPnlEth: realized.realizedPnlEth,
        realizedPnlUsd: realized.realizedPnlUsd,
        roiPct: realized.roiPct,
        isRealized: true,
        holdDurationDays,
        soldAt: timestamp,
      });
    }

    // Remove from current holdings
    await deleteHolding(nftRecord.id, walletId);
  }
}

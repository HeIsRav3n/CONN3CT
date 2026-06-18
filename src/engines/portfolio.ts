// ============================================================
// CONN3CT PNL — Portfolio Engine
// Aggregates wallet data into comprehensive portfolio summaries
// ============================================================

import { prisma } from '../database/prisma';
import { getPnlSummaryForUser, getHoldingsWithPnl } from '../database/repositories/pnlRepository';
import { findWalletsByUserId } from '../database/repositories/walletRepository';
import { withCache, cacheDelPattern } from '../cache/redis';
import { CK, TTL } from '../cache/cacheKeys';
import { createChildLogger } from '../utils/logger';
import { calculateUnrealizedPnl } from './fifo';
import { ethToUsd, calcRoiPct, calcWinRate, sumEthArray } from '../utils/math';
import { getEthPriceUsd } from '../api/ethereum/client';
import type {
  PortfolioSummary,
  WalletSummary,
  CollectionSummary,
  HoldingDetail,
} from '../types';

const log = createChildLogger('portfolio-engine');

// ── Full portfolio summary for a user ────────────────────────
export async function buildPortfolioSummary(
  userId: string,
  discordId: string,
  username: string,
): Promise<PortfolioSummary> {
  const ethPrice = await getEthPriceUsd();
  const wallets = await findWalletsByUserId(userId);

  const walletSummaries: WalletSummary[] = await Promise.all(
    wallets.map((w) => buildWalletSummary(w.id, w.address, w.label, w.status, ethPrice)),
  );

  const pnlSummary = await getPnlSummaryForUser(userId);
  const collections = await buildCollectionSummaries(userId, ethPrice);

  const totalPortfolioValueEth = sumEthArray(walletSummaries.map((w) => w.portfolioValueEth));
  const totalCostBasisEth = pnlSummary.totalCostBasisEth.toFixed(18);
  const totalRealizedPnlEth = pnlSummary.totalRealizedPnlEth.toFixed(18);
  const totalUnrealizedPnlEth = pnlSummary.totalUnrealizedPnlEth.toFixed(18);
  const totalGasFeeEth = sumEthArray(walletSummaries.map((w) => w.gasFeeEth));

  const combinedPnl = pnlSummary.totalRealizedPnlEth + pnlSummary.totalUnrealizedPnlEth;
  const totalRoiPct = calcRoiPct(combinedPnl.toFixed(18), totalCostBasisEth);
  const winRate = calcWinRate(pnlSummary.winningTrades, pnlSummary.totalTrades);

  return {
    userId,
    discordId,
    username,
    wallets: walletSummaries,
    totalHoldings: walletSummaries.reduce((s, w) => s + w.holdingsCount, 0),
    totalPortfolioValueEth,
    totalPortfolioValueUsd: ethToUsd(totalPortfolioValueEth, ethPrice),
    totalCostBasisEth,
    totalRealizedPnlEth,
    totalRealizedPnlUsd: ethToUsd(totalRealizedPnlEth, ethPrice),
    totalUnrealizedPnlEth,
    totalUnrealizedPnlUsd: ethToUsd(totalUnrealizedPnlEth, ethPrice),
    totalGasFeeEth,
    totalRoiPct,
    winRate,
    totalTrades: pnlSummary.totalTrades,
    winningTrades: pnlSummary.winningTrades,
    losingTrades: pnlSummary.losingTrades,
    bestTradeEth: pnlSummary.bestTradeEth.toFixed(18),
    worstTradeEth: pnlSummary.worstTradeEth.toFixed(18),
    avgHoldDurationDays: pnlSummary.avgHoldDays,
    collections,
    updatedAt: new Date(),
  };
}

async function buildWalletSummary(
  walletId: string,
  address: string,
  label: string | null,
  status: string,
  ethPrice: number,
): Promise<WalletSummary> {
  const [holdings, pnl, gasAgg, wallet] = await Promise.all([
    getHoldingsWithPnl(walletId),
    prisma.pnlRecord.aggregate({
      where: { walletId },
      _sum: { realizedPnlEth: true, totalCostEth: true, unrealizedPnlEth: true },
    }),
    // Gas fees live on Holdings (buy gas) + realized PnlRecord sell gas
    prisma.pnlRecord.aggregate({
      where: { walletId },
      _sum: { buyGasFeeEth: true, sellGasFeeEth: true },
    }),
    prisma.wallet.findUnique({ where: { id: walletId }, select: { lastSyncAt: true } }),
  ]);

  // Portfolio value = sum of floor prices for current holdings
  let portfolioValueEth = '0';
  for (const h of holdings) {
    const floor = parseFloat((h.nft.collection as any).floorPriceEth?.toString() ?? '0');
    portfolioValueEth = (parseFloat(portfolioValueEth) + floor).toFixed(18);
  }

  const realizedPnlEth = (pnl._sum.realizedPnlEth ?? 0).toString();
  const unrealizedPnlEth = (pnl._sum.unrealizedPnlEth ?? 0).toString();
  const costBasisEth = (pnl._sum.totalCostEth ?? 0).toString();
  const totalBuyGas = parseFloat(gasAgg._sum.buyGasFeeEth?.toString() ?? '0');
  const totalSellGas = parseFloat(gasAgg._sum.sellGasFeeEth?.toString() ?? '0');
  const gasFeeEth = (totalBuyGas + totalSellGas).toFixed(18);

  const combinedPnl = parseFloat(realizedPnlEth) + parseFloat(unrealizedPnlEth);
  const roiPct = calcRoiPct(combinedPnl.toFixed(18), costBasisEth);

  return {
    id: walletId,
    address,
    label,
    status,
    holdingsCount: holdings.length,
    portfolioValueEth,
    costBasisEth,
    realizedPnlEth,
    unrealizedPnlEth,
    gasFeeEth,
    roiPct,
    lastSyncAt: wallet?.lastSyncAt ?? null,
  };
}

async function buildCollectionSummaries(
  userId: string,
  ethPrice: number,
): Promise<CollectionSummary[]> {
  // Group holdings by collection and aggregate P&L
  const results = await prisma.$queryRaw<Array<{
    collection_id: string;
    slug: string;
    name: string;
    contract_address: string;
    image_url: string | null;
    floor_price_eth: number;
    holdings_count: number;
    total_cost_basis: number;
    total_unrealized_pnl: number;
    total_realized_pnl: number;
    total_volume: number;
  }>>`
    SELECT
      c.id as collection_id,
      c.slug,
      c.name,
      c.contract_address,
      c.image_url,
      COALESCE(c.floor_price_eth, 0) as floor_price_eth,
      COUNT(DISTINCT h.nft_id) as holdings_count,
      COALESCE(SUM(h.cost_basis_eth + h.gas_fee_eth), 0) as total_cost_basis,
      COALESCE(SUM(pr_u.unrealized_pnl_eth), 0) as total_unrealized_pnl,
      COALESCE(SUM(pr_r.realized_pnl_eth), 0) as total_realized_pnl,
      COALESCE(SUM(pr_r.sale_price_eth), 0) as total_volume
    FROM holdings h
    JOIN nfts n ON n.id = h.nft_id
    JOIN collections c ON c.id = n.collection_id
    JOIN wallets w ON w.id = h.wallet_id
    LEFT JOIN pnl_records pr_u ON pr_u.nft_id = h.nft_id AND pr_u.wallet_id = h.wallet_id AND pr_u.is_realized = false
    LEFT JOIN pnl_records pr_r ON pr_r.nft_id = h.nft_id AND pr_r.wallet_id = h.wallet_id AND pr_r.is_realized = true
    WHERE w.user_id = ${userId}
    GROUP BY c.id, c.slug, c.name, c.contract_address, c.image_url, c.floor_price_eth
    ORDER BY total_cost_basis DESC
  `;

  return results.map((r) => {
    const floorPriceEth = r.floor_price_eth.toFixed(18);
    const holdingsCount = Number(r.holdings_count);
    const currentValueEth = (r.floor_price_eth * holdingsCount).toFixed(18);
    const costBasisEth = r.total_cost_basis.toFixed(18);
    const avgEntryEth = holdingsCount > 0
      ? (r.total_cost_basis / holdingsCount).toFixed(18)
      : '0';
    const unrealizedPnlEth = r.total_unrealized_pnl.toFixed(18);
    const realizedPnlEth = r.total_realized_pnl.toFixed(18);
    const totalPnl = r.total_unrealized_pnl + r.total_realized_pnl;
    const roiPct = calcRoiPct(totalPnl.toFixed(18), costBasisEth);

    return {
      collectionId: r.collection_id,
      slug: r.slug,
      name: r.name,
      contractAddress: r.contract_address,
      imageUrl: r.image_url,
      holdingsCount,
      floorPriceEth,
      currentValueEth,
      costBasisEth,
      avgEntryEth,
      unrealizedPnlEth,
      realizedPnlEth,
      roiPct,
      volume: r.total_volume.toFixed(18),
    };
  });
}

// ── Current holdings with unrealized P&L ─────────────────────
export async function buildHoldingDetails(
  userId: string,
  ethPrice: number,
): Promise<HoldingDetail[]> {
  const wallets = await findWalletsByUserId(userId);
  const allHoldings: HoldingDetail[] = [];

  for (const wallet of wallets) {
    const holdings = await getHoldingsWithPnl(wallet.id);
    for (const h of holdings) {
      const floorPriceEth = parseFloat(
        (h.nft.collection as any).floorPriceEth?.toString() ?? '0',
      ).toFixed(18);
      const costBasisEth = h.costBasisEth.toString();
      const gasFeeEth = h.gasFeeEth.toString();

      const pnl = calculateUnrealizedPnl({
        costBasisEth,
        gasFeeEth,
        currentFloorPriceEth: floorPriceEth,
        ethPriceUsd: ethPrice,
      });

      const holdDurationDays = Math.floor(
        (Date.now() - h.acquisitionDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      allHoldings.push({
        nftId: h.nftId,
        tokenId: (h.nft as any).tokenId,
        contractAddress: (h.nft as any).contractAddress,
        name: (h.nft as any).name,
        imageUrl: (h.nft as any).imageUrl,
        collectionName: (h.nft.collection as any).name,
        collectionSlug: (h.nft.collection as any).slug,
        floorPriceEth,
        costBasisEth,
        gasFeeEth,
        totalCostEth: pnl.totalCostEth,
        currentValueEth: floorPriceEth,
        unrealizedPnlEth: pnl.unrealizedPnlEth,
        unrealizedPnlUsd: pnl.unrealizedPnlUsd,
        roiPct: pnl.roiPct,
        acquisitionDate: h.acquisitionDate,
        holdDurationDays,
      });
    }
  }

  return allHoldings.sort(
    (a, b) => parseFloat(b.unrealizedPnlEth) - parseFloat(a.unrealizedPnlEth),
  );
}

// ── Invalidate all cached portfolio data for a user ───────────
export async function invalidatePortfolioCache(userId: string): Promise<void> {
  await Promise.all([
    cacheDelPattern(CK.portfolioPattern(userId)),
    cacheDelPattern(CK.pnlPattern(userId)),
    cacheDelPattern(CK.tradesPattern(userId)),
  ]);
}

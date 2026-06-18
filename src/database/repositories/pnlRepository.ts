import { PnlRecord, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export async function upsertPnlRecord(data: {
  userId: string;
  walletId: string;
  nftId: string;
  sellTransactionId?: string | null;
  costBasisEth: string;
  salePriceEth?: string | null;
  buyGasFeeEth: string;
  sellGasFeeEth?: string | null;
  marketplaceFeeEth?: string | null;
  royaltyFeeEth?: string | null;
  totalCostEth: string;
  netProceedsEth?: string | null;
  realizedPnlEth?: string | null;
  realizedPnlUsd?: string | null;
  unrealizedPnlEth?: string | null;
  unrealizedPnlUsd?: string | null;
  roiPct?: string | null;
  isRealized: boolean;
  holdDurationDays?: number | null;
  soldAt?: Date | null;
}): Promise<PnlRecord> {
  const existing = await prisma.pnlRecord.findFirst({
    where: { userId: data.userId, walletId: data.walletId, nftId: data.nftId },
  });

  if (existing) {
    return prisma.pnlRecord.update({
      where: { id: existing.id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  return prisma.pnlRecord.create({ data });
}

export async function getPnlSummaryForUser(userId: string): Promise<{
  totalRealizedPnlEth: number;
  totalUnrealizedPnlEth: number;
  totalCostBasisEth: number;
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
  bestTradeEth: number;
  worstTradeEth: number;
  avgHoldDays: number;
}> {
  const result = await prisma.pnlRecord.aggregate({
    where: { userId, isRealized: true },
    _sum: {
      realizedPnlEth: true,
      totalCostEth: true,
    },
    _count: { id: true },
    _max: { realizedPnlEth: true, holdDurationDays: true },
    _min: { realizedPnlEth: true },
    _avg: { holdDurationDays: true },
  });

  const unrealizedResult = await prisma.pnlRecord.aggregate({
    where: { userId, isRealized: false },
    _sum: { unrealizedPnlEth: true, totalCostEth: true },
  });

  const winningTrades = await prisma.pnlRecord.count({
    where: { userId, isRealized: true, realizedPnlEth: { gt: 0 } },
  });

  return {
    totalRealizedPnlEth: parseFloat(result._sum.realizedPnlEth?.toString() ?? '0'),
    totalUnrealizedPnlEth: parseFloat(unrealizedResult._sum.unrealizedPnlEth?.toString() ?? '0'),
    totalCostBasisEth:
      parseFloat(result._sum.totalCostEth?.toString() ?? '0') +
      parseFloat(unrealizedResult._sum.totalCostEth?.toString() ?? '0'),
    winningTrades,
    losingTrades: (result._count.id ?? 0) - winningTrades,
    totalTrades: result._count.id ?? 0,
    bestTradeEth: parseFloat(result._max.realizedPnlEth?.toString() ?? '0'),
    worstTradeEth: parseFloat(result._min.realizedPnlEth?.toString() ?? '0'),
    avgHoldDays: Math.round(result._avg.holdDurationDays ?? 0),
  };
}

export async function getLeaderboard(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; totalRealizedPnlEth: number; totalTrades: number }>> {
  // Join through users who belong to this guild
  const results = await prisma.$queryRaw<
    Array<{ user_id: string; total_realized: number; total_trades: number }>
  >`
    SELECT
      pr.user_id,
      COALESCE(SUM(pr.realized_pnl_eth), 0) as total_realized,
      COUNT(CASE WHEN pr.is_realized THEN 1 END) as total_trades
    FROM pnl_records pr
    JOIN users u ON u.id = pr.user_id
    WHERE u.guild_id = ${guildId}
      AND u.is_active = true
    GROUP BY pr.user_id
    ORDER BY total_realized DESC
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    userId: r.user_id,
    totalRealizedPnlEth: parseFloat(String(r.total_realized)),
    totalTrades: Number(r.total_trades),
  }));
}

export async function getHoldingsWithPnl(walletId: string) {
  return prisma.holding.findMany({
    where: { walletId },
    include: {
      nft: {
        include: { collection: { select: { name: true, slug: true, floorPriceEth: true, imageUrl: true } } },
      },
    },
    orderBy: { acquisitionDate: 'desc' },
  });
}

export async function upsertHolding(data: {
  nftId: string;
  walletId: string;
  costBasisEth: string;
  costBasisUsd?: string | null;
  gasFeeEth: string;
  acquisitionTxId?: string | null;
  acquisitionDate: Date;
}): Promise<void> {
  await prisma.holding.upsert({
    where: { nftId_walletId: { nftId: data.nftId, walletId: data.walletId } },
    create: data,
    update: {
      costBasisEth: data.costBasisEth,
      gasFeeEth: data.gasFeeEth,
      acquisitionDate: data.acquisitionDate,
    },
  });
}

export async function deleteHolding(nftId: string, walletId: string): Promise<void> {
  await prisma.holding.deleteMany({ where: { nftId, walletId } });
}

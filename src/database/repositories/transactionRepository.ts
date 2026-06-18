import { Transaction, TransactionType, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export async function upsertTransaction(data: {
  txHash: string;
  nftId: string;
  walletId: string;
  counterpartyAddress?: string | null;
  eventType: TransactionType;
  quantity?: number;
  priceEth: string;
  priceUsd?: string | null;
  ethPriceAtTime?: string | null;
  gasUsed?: bigint | null;
  gasPriceWei?: bigint | null;
  gasFeeEth?: string | null;
  gasFeeUsd?: string | null;
  marketplaceFeeEth?: string | null;
  marketplaceFeePct?: string | null;
  royaltyFeeEth?: string | null;
  royaltyFeePct?: string | null;
  marketplace?: string | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
  timestamp: Date;
  processedAt?: Date | null;
}): Promise<Transaction> {
  return prisma.transaction.upsert({
    where: {
      txHash_nftId_eventType: {
        txHash: data.txHash,
        nftId: data.nftId,
        eventType: data.eventType,
      },
    },
    create: { ...data, quantity: data.quantity ?? 1, processedAt: data.processedAt ?? new Date() },
    update: {
      gasFeeEth: data.gasFeeEth,
      gasFeeUsd: data.gasFeeUsd,
      ethPriceAtTime: data.ethPriceAtTime,
      processedAt: data.processedAt ?? new Date(),
    },
  });
}

export async function findTransactionsByWallet(
  walletId: string,
  options: {
    eventType?: TransactionType;
    limit?: number;
    offset?: number;
    orderBy?: 'asc' | 'desc';
  } = {},
): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: {
      walletId,
      ...(options.eventType ? { eventType: options.eventType } : {}),
    },
    orderBy: { timestamp: options.orderBy ?? 'desc' },
    take: options.limit ?? 50,
    skip: options.offset ?? 0,
    include: { nft: { include: { collection: true } } },
  });
}

export async function findTransactionsByNftAndWallet(
  nftId: string,
  walletId: string,
): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: { nftId, walletId },
    orderBy: { timestamp: 'asc' },
  });
}

export async function findBuyTransactionsForNft(
  nftId: string,
  walletId: string,
): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: {
      nftId,
      walletId,
      eventType: { in: ['BUY', 'MINT', 'TRANSFER_IN', 'AIRDROP'] },
    },
    orderBy: { timestamp: 'asc' },
  });
}

export async function countTransactionsByWallet(
  walletId: string,
  eventType?: TransactionType,
): Promise<number> {
  return prisma.transaction.count({
    where: { walletId, ...(eventType ? { eventType } : {}) },
  });
}

export async function getLatestBlockForWallet(walletId: string): Promise<bigint | null> {
  const result = await prisma.transaction.findFirst({
    where: { walletId },
    orderBy: { blockNumber: 'desc' },
    select: { blockNumber: true },
  });
  return result?.blockNumber ?? null;
}

export async function getTradeHistory(
  userId: string,
  options: {
    page?: number;
    pageSize?: number;
    sortBy?: 'pnl' | 'date' | 'roi';
    sortDir?: 'asc' | 'desc';
  } = {},
): Promise<{ records: Prisma.PnlRecordGetPayload<{ include: { nft: { include: { collection: true } } } }>[]; total: number }> {
  const { page = 1, pageSize = 10, sortBy = 'date', sortDir = 'desc' } = options;
  const skip = (page - 1) * pageSize;

  const orderBy: Prisma.PnlRecordOrderByWithRelationInput =
    sortBy === 'pnl' ? { realizedPnlEth: sortDir } :
    sortBy === 'roi' ? { roiPct: sortDir } :
    { soldAt: sortDir };

  const [records, total] = await Promise.all([
    prisma.pnlRecord.findMany({
      where: { userId, isRealized: true },
      orderBy,
      skip,
      take: pageSize,
      include: { nft: { include: { collection: true } }, sellTransaction: true },
    }),
    prisma.pnlRecord.count({ where: { userId, isRealized: true } }),
  ]);

  return { records, total };
}

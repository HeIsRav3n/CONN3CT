import { Wallet, WalletStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export async function createWallet(
  userId: string,
  address: string,
  label?: string,
): Promise<Wallet> {
  return prisma.wallet.create({
    data: { userId, address: address.toLowerCase(), label, status: 'PENDING' },
  });
}

export async function findWalletByAddress(address: string): Promise<Wallet | null> {
  return prisma.wallet.findUnique({ where: { address: address.toLowerCase() } });
}

export async function findWalletById(id: string): Promise<Wallet | null> {
  return prisma.wallet.findUnique({ where: { id } });
}

export async function findWalletsByUserId(userId: string): Promise<Wallet[]> {
  return prisma.wallet.findMany({
    where: { userId, status: { not: 'INACTIVE' } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateWalletStatus(
  id: string,
  status: WalletStatus,
  error?: string,
): Promise<Wallet> {
  return prisma.wallet.update({
    where: { id },
    data: { status, syncError: error ?? null },
  });
}

export async function updateWalletSyncBlock(
  id: string,
  blockNumber: bigint,
): Promise<Wallet> {
  return prisma.wallet.update({
    where: { id },
    data: { lastSyncAt: new Date(), lastSyncBlock: blockNumber, status: 'SYNCED' },
  });
}

export async function incrementWalletNftCount(id: string, delta: number): Promise<void> {
  await prisma.wallet.update({
    where: { id },
    data: { totalNfts: { increment: delta } },
  });
}

export async function deactivateWallet(id: string): Promise<Wallet> {
  return prisma.wallet.update({ where: { id }, data: { status: 'INACTIVE' } });
}

export async function getAllActiveWallets(): Promise<Wallet[]> {
  return prisma.wallet.findMany({
    where: { status: { in: ['SYNCED', 'PENDING'] } },
    orderBy: { lastSyncAt: 'asc' },
  });
}

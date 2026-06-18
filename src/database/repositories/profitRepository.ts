import { prisma } from '../prisma';

export interface CollectionPnlStats {
  collectionName: string;
  contractAddress: string;
  collectionImageUrl: string | null;
  floorPriceEth: number;
  spentEth: number;
  salesEth: number;
  gasFeeEth: number;
  mintCount: number;
  buyCount: number;
  sellCount: number;
  heldCount: number;
  realizedPnlEth: number;
  unrealizedPnlEth: number;
}

export async function getCollectionPnlForWallet(
  walletId: string,
  contractAddress: string,
): Promise<CollectionPnlStats | null> {
  const collection = await prisma.collection.findUnique({
    where: { contractAddress: contractAddress.toLowerCase() },
  });
  if (!collection) return null;

  const [pnlRecords, transactions, heldCount] = await Promise.all([
    prisma.pnlRecord.findMany({
      where: { walletId, nft: { collectionId: collection.id } },
      select: {
        costBasisEth: true,
        salePriceEth: true,
        buyGasFeeEth: true,
        sellGasFeeEth: true,
        realizedPnlEth: true,
        unrealizedPnlEth: true,
        isRealized: true,
      },
    }),
    prisma.transaction.findMany({
      where: { walletId, nft: { collectionId: collection.id } },
      select: { eventType: true },
    }),
    prisma.holding.count({
      where: { walletId, nft: { collectionId: collection.id } },
    }),
  ]);

  if (pnlRecords.length === 0 && transactions.length === 0) return null;

  let spentEth = 0, salesEth = 0, gasFeeEth = 0;
  let realizedPnlEth = 0, unrealizedPnlEth = 0;

  for (const r of pnlRecords) {
    spentEth += Number(r.costBasisEth);
    gasFeeEth += Number(r.buyGasFeeEth) + Number(r.sellGasFeeEth ?? 0);
    if (r.isRealized) {
      salesEth += Number(r.salePriceEth ?? 0);
      realizedPnlEth += Number(r.realizedPnlEth ?? 0);
    } else {
      unrealizedPnlEth += Number(r.unrealizedPnlEth ?? 0);
    }
  }

  return {
    collectionName: collection.name,
    contractAddress: collection.contractAddress,
    collectionImageUrl: collection.imageUrl,
    floorPriceEth: Number(collection.floorPriceEth ?? 0),
    spentEth,
    salesEth,
    gasFeeEth,
    mintCount: transactions.filter(t => t.eventType === 'MINT').length,
    buyCount: transactions.filter(t => t.eventType === 'BUY').length,
    sellCount: transactions.filter(t => t.eventType === 'SELL').length,
    heldCount,
    realizedPnlEth,
    unrealizedPnlEth,
  };
}

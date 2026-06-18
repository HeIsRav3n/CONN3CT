import { Nft, Collection, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

// ── Collections ───────────────────────────────────────────────
export async function upsertCollection(data: {
  slug: string;
  name: string;
  contractAddress: string;
  contractType?: string;
  description?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  externalUrl?: string | null;
  twitterUsername?: string | null;
  discordUrl?: string | null;
  totalSupply?: number | null;
  royaltyBps?: number;
  openseaFeeBps?: number;
}): Promise<Collection> {
  return prisma.collection.upsert({
    where: { contractAddress: data.contractAddress.toLowerCase() },
    create: {
      ...data,
      contractAddress: data.contractAddress.toLowerCase(),
    },
    update: {
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl,
      bannerUrl: data.bannerUrl,
      twitterUsername: data.twitterUsername,
      discordUrl: data.discordUrl,
      totalSupply: data.totalSupply,
      royaltyBps: data.royaltyBps,
      openseaFeeBps: data.openseaFeeBps,
    },
  });
}

export async function findCollectionByContract(contractAddress: string): Promise<Collection | null> {
  return prisma.collection.findUnique({
    where: { contractAddress: contractAddress.toLowerCase() },
  });
}

export async function findCollectionBySlug(slug: string): Promise<Collection | null> {
  return prisma.collection.findUnique({ where: { slug } });
}

export async function updateCollectionFloorPrice(
  collectionId: string,
  floorPriceEth: string,
  floorPriceUsd?: string,
): Promise<void> {
  await prisma.collection.update({
    where: { id: collectionId },
    data: {
      floorPriceEth: floorPriceEth,
      floorPriceUsd: floorPriceUsd,
      statsUpdatedAt: new Date(),
    },
  });
}

export async function updateCollectionStats(
  collectionId: string,
  stats: {
    floorPriceEth?: string;
    floorPriceUsd?: string;
    volume24hEth?: string;
    volume7dEth?: string;
    volumeAllTimeEth?: string;
    numOwners?: number;
    marketCapEth?: string;
  },
): Promise<void> {
  await prisma.collection.update({
    where: { id: collectionId },
    data: { ...stats, statsUpdatedAt: new Date() },
  });
}

export async function getCollectionsStalePrices(staleSecs: number): Promise<Collection[]> {
  const threshold = new Date(Date.now() - staleSecs * 1000);
  return prisma.collection.findMany({
    where: {
      OR: [{ statsUpdatedAt: null }, { statsUpdatedAt: { lt: threshold } }],
    },
    take: 100,
  });
}

// ── NFTs ──────────────────────────────────────────────────────
export async function upsertNft(data: {
  tokenId: string;
  contractAddress: string;
  collectionId: string;
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  animationUrl?: string | null;
  externalUrl?: string | null;
  metadata?: object | null;
  traits?: object | null;
  rarityRank?: number | null;
  rarityScore?: string | null;
}): Promise<Nft> {
  // Prisma's Json columns cannot receive `null` as a plain value — use Prisma.JsonNull sentinel
  const metadataValue = data.metadata === null ? Prisma.JsonNull
    : data.metadata === undefined ? undefined
    : data.metadata as Prisma.InputJsonValue;

  const traitsValue = data.traits === null ? Prisma.JsonNull
    : data.traits === undefined ? undefined
    : data.traits as Prisma.InputJsonValue;

  return prisma.nft.upsert({
    where: {
      tokenId_contractAddress: {
        tokenId: data.tokenId,
        contractAddress: data.contractAddress.toLowerCase(),
      },
    },
    create: {
      tokenId: data.tokenId,
      contractAddress: data.contractAddress.toLowerCase(),
      collectionId: data.collectionId,
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl,
      animationUrl: data.animationUrl,
      externalUrl: data.externalUrl,
      metadata: metadataValue,
      traits: traitsValue,
      rarityRank: data.rarityRank,
      rarityScore: data.rarityScore,
    },
    update: {
      name: data.name,
      imageUrl: data.imageUrl,
      metadata: metadataValue,
      traits: traitsValue,
    },
  });
}

export async function findNftById(id: string): Promise<Nft | null> {
  return prisma.nft.findUnique({ where: { id }, include: { collection: true } });
}

export async function findNftByTokenAndContract(
  tokenId: string,
  contractAddress: string,
): Promise<Nft | null> {
  return prisma.nft.findUnique({
    where: {
      tokenId_contractAddress: {
        tokenId,
        contractAddress: contractAddress.toLowerCase(),
      },
    },
    include: { collection: true },
  });
}

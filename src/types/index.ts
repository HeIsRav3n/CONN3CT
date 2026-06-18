// ============================================================
// CONN3CT PNL — Core TypeScript Types & Interfaces
// ============================================================

import { Decimal } from '@prisma/client/runtime/library';

// ── Re-export Prisma Enums ────────────────────────────────────
export {
  WalletStatus,
  TransactionType,
  SyncJobType,
  SyncJobStatus,
} from '@prisma/client';

// ── Ethereum Types ────────────────────────────────────────────
export interface EthereumTransaction {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string | null;
  value: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  gasFeeWei: bigint;
  gasFeeEth: string;
}

export interface EthereumGasData {
  gasUsed: bigint;
  gasPriceWei: bigint;
  gasFeeWei: bigint;
  gasFeeEth: string;
}

// ── OpenSea Types ─────────────────────────────────────────────
export type OpenSeaEventType =
  | 'sale'
  | 'transfer'
  | 'mint'
  | 'redemption'
  | 'cancel'
  | 'order';

export interface OpenSeaNftEvent {
  eventType: OpenSeaEventType;
  orderHash: string | null;
  chain: string;
  protocolAddress: string | null;
  closingDate: number | null;
  nft: OpenSeaNft;
  payment: OpenSeaPayment | null;
  seller: string | null;
  buyer: string | null;
  transaction: string | null;
  logIndex: number | null;
  isPrivate: boolean | null;
  fromAddress: string | null;
  toAddress: string | null;
  quantity: string;
}

export interface OpenSeaNft {
  identifier: string;
  collection: string;
  contract: string;
  tokenStandard: string;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  displayImageUrl: string | null;
  metadataUrl: string | null;
  openseaUrl: string | null;
  updatedAt: string | null;
  isDisabled: boolean;
  isNsfw: boolean;
}

export interface OpenSeaPayment {
  quantity: string;
  tokenAddress: string | null;
  decimals: number;
  symbol: string;
}

export interface OpenSeaCollection {
  collection: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  bannerImageUrl: string | null;
  owner: string | null;
  category: string | null;
  isDisabled: boolean;
  isNsfw: boolean;
  traitOffersEnabled: boolean;
  openseaUrl: string | null;
  projectUrl: string | null;
  wikiUrl: string | null;
  discordUrl: string | null;
  telegramUrl: string | null;
  twitterUsername: string | null;
  instagramUsername: string | null;
  contracts: OpenSeaContract[];
  editors: string[];
  fees: OpenSeaFee[];
  requiredRoyalties: boolean;
  createdDate: string | null;
  totalSupply: number | null;
}

export interface OpenSeaContract {
  address: string;
  chain: string;
}

export interface OpenSeaFee {
  fee: number;
  recipient: string;
  required: boolean;
}

export interface OpenSeaCollectionStats {
  total: OpenSeaStatTotal;
  intervals: OpenSeaStatInterval[];
}

export interface OpenSeaStatTotal {
  volume: number;
  sales: number;
  average_price: number;
  num_owners: number;
  market_cap: number;
  floor_price: number;
  floor_price_symbol: string;
  count: number;
}

export interface OpenSeaStatInterval {
  interval: '1d' | '7d' | '30d';
  volume: number;
  volume_diff: number;
  volume_change: number;
  sales: number;
  sales_diff: number;
  average_price: number;
}

// ── FIFO / P&L Types ─────────────────────────────────────────
export interface FifoBatch {
  quantity: number;
  costBasisEth: string;
  gasFeeEth: string;
  totalCostEth: string;
  acquisitionDate: Date;
  txHash: string;
}

export interface FifoResult {
  costBasisEth: string;
  gasFeeEth: string;
  totalCostEth: string;
  acquisitionDate: Date;
  remainingBatches: FifoBatch[];
}

export interface RealizedPnlCalculation {
  costBasisEth: string;
  buyGasFeeEth: string;
  totalCostEth: string;
  salePriceEth: string;
  sellGasFeeEth: string;
  marketplaceFeeEth: string;
  royaltyFeeEth: string;
  netProceedsEth: string;
  realizedPnlEth: string;
  realizedPnlUsd: string;
  roiPct: string;
}

export interface UnrealizedPnlCalculation {
  costBasisEth: string;
  gasFeeEth: string;
  totalCostEth: string;
  currentFloorPriceEth: string;
  unrealizedPnlEth: string;
  unrealizedPnlUsd: string;
  roiPct: string;
}

// ── Portfolio Types ───────────────────────────────────────────
export interface PortfolioSummary {
  userId: string;
  discordId: string;
  username: string;
  wallets: WalletSummary[];
  totalHoldings: number;
  totalPortfolioValueEth: string;
  totalPortfolioValueUsd: string;
  totalCostBasisEth: string;
  totalRealizedPnlEth: string;
  totalRealizedPnlUsd: string;
  totalUnrealizedPnlEth: string;
  totalUnrealizedPnlUsd: string;
  totalGasFeeEth: string;
  totalRoiPct: string;
  winRate: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  bestTradeEth: string;
  worstTradeEth: string;
  avgHoldDurationDays: number;
  collections: CollectionSummary[];
  updatedAt: Date;
}

export interface WalletSummary {
  id: string;
  address: string;
  label: string | null;
  status: string;
  holdingsCount: number;
  portfolioValueEth: string;
  costBasisEth: string;
  realizedPnlEth: string;
  unrealizedPnlEth: string;
  gasFeeEth: string;
  roiPct: string;
  lastSyncAt: Date | null;
}

export interface CollectionSummary {
  collectionId: string;
  slug: string;
  name: string;
  contractAddress: string;
  imageUrl: string | null;
  holdingsCount: number;
  floorPriceEth: string;
  currentValueEth: string;
  costBasisEth: string;
  avgEntryEth: string;
  unrealizedPnlEth: string;
  realizedPnlEth: string;
  roiPct: string;
  volume: string;
}

export interface HoldingDetail {
  nftId: string;
  tokenId: string;
  contractAddress: string;
  name: string | null;
  imageUrl: string | null;
  collectionName: string;
  collectionSlug: string;
  floorPriceEth: string;
  costBasisEth: string;
  gasFeeEth: string;
  totalCostEth: string;
  currentValueEth: string;
  unrealizedPnlEth: string;
  unrealizedPnlUsd: string;
  roiPct: string;
  acquisitionDate: Date;
  holdDurationDays: number;
}

export interface TradeHistoryItem {
  nftId: string;
  tokenId: string;
  contractAddress: string;
  name: string | null;
  imageUrl: string | null;
  collectionName: string;
  buyPriceEth: string;
  sellPriceEth: string;
  buyGasFeeEth: string;
  sellGasFeeEth: string;
  marketplaceFeeEth: string;
  royaltyFeeEth: string;
  realizedPnlEth: string;
  realizedPnlUsd: string;
  roiPct: string;
  boughtAt: Date;
  soldAt: Date;
  holdDurationDays: number;
  txHashBuy: string;
  txHashSell: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  totalRealizedPnlEth: string;
  totalRealizedPnlUsd: string;
  roiPct: string;
  winRate: string;
  totalVolume: string;
  totalTrades: number;
}

// ── Discord Types ─────────────────────────────────────────────
export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CommandContext {
  userId: string;
  discordId: string;
  username: string;
  guildId: string | null;
}

// ── Job Types ─────────────────────────────────────────────────
export interface WalletSyncJobData {
  userId: string;
  walletId: string;
  walletAddress: string;
  jobType: 'FULL_HISTORY' | 'INCREMENTAL';
  syncJobId: string;
}

export interface PriceUpdateJobData {
  collectionSlugs?: string[];
  updateAll: boolean;
}

export interface PnlRecalculateJobData {
  userId: string;
  walletId: string;
  nftId?: string;
  forceRecalc?: boolean;
}

// ── Cache Types ───────────────────────────────────────────────
export interface CacheOptions {
  ttl?: number;
  nx?: boolean;
}

// ── API Response Types ────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    timestamp: string;
  };
}

// ── Config Types ──────────────────────────────────────────────
export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  discord: {
    botToken: string;
    clientId: string;
    guildId?: string;
  };
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    tls: boolean;
  };
  opensea: {
    apiKeys: string[];
    baseUrl: string;
    rateLimitRps: number;
  };
  ethereum: {
    alchemyApiKey: string;
    network: string;
    rpcUrl: string;
    rpcFallback?: string;
  };
  workers: {
    syncConcurrency: number;
    priceConcurrency: number;
    pnlConcurrency: number;
    walletSyncIntervalMs: number;
    priceUpdateIntervalMs: number;
  };
  security: {
    apiSecretKey: string;
    encryptionKey: string;
    jwtSecret: string;
  };
  monitoring: {
    prometheusPort: number;
  };
}

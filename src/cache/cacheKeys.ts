// ── Centralized cache key registry ───────────────────────────
// All TTLs in seconds.

export const TTL = {
  FLOOR_PRICE: 300,         // 5 min — collection floor prices
  COLLECTION_STATS: 600,    // 10 min — full collection statistics
  PORTFOLIO: 120,           // 2 min — portfolio summary
  HOLDINGS: 60,             // 1 min — current holdings
  PNL_SUMMARY: 120,         // 2 min — P&L totals
  LEADERBOARD: 300,         // 5 min — server leaderboard
  ETH_PRICE: 60,            // 1 min — ETH/USD price
  WALLET_STATUS: 30,        // 30 sec — wallet sync status
  TRADE_HISTORY: 120,       // 2 min — paginated trade list
  COLLECTION_SUMMARY: 300,  // 5 min — per-collection P&L summary
  NONCE: 60,                // 1 min — dedup nonce
} as const;

export const CK = {
  ethPrice: () => 'eth:price:usd',
  floorPrice: (slug: string) => `collection:${slug}:floor`,
  collectionStats: (slug: string) => `collection:${slug}:stats`,
  collectionMeta: (slug: string) => `collection:${slug}:meta`,
  portfolioSummary: (userId: string) => `portfolio:${userId}:summary`,
  walletHoldings: (walletId: string) => `wallet:${walletId}:holdings`,
  walletStatus: (walletId: string) => `wallet:${walletId}:status`,
  pnlSummary: (userId: string) => `pnl:${userId}:summary`,
  tradeHistory: (userId: string, page: number, sort: string) =>
    `trades:${userId}:p${page}:s${sort}`,
  leaderboard: (guildId: string) => `leaderboard:${guildId}`,
  collectionSummary: (userId: string, slug: string) =>
    `collection-pnl:${userId}:${slug}`,
  nonce: (txHash: string, eventType: string) =>
    `nonce:${txHash}:${eventType}`,

  // Invalidation patterns
  userPattern: (userId: string) => `*:${userId}:*`,
  walletPattern: (walletId: string) => `wallet:${walletId}:*`,
  portfolioPattern: (userId: string) => `portfolio:${userId}:*`,
  pnlPattern: (userId: string) => `pnl:${userId}:*`,
  tradesPattern: (userId: string) => `trades:${userId}:*`,
} as const;

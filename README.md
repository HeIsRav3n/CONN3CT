# CONN3CT PNL — Enterprise Discord NFT P&L Tracking Bot

A production-ready Discord bot that automatically tracks NFT purchases, sales, holdings, cost basis, realized/unrealized profit & loss, and gas fees across multiple Ethereum wallets — powered by OpenSea API + Ethereum on-chain data.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CONN3CT PNL System                       │
├─────────────┬─────────────┬───────────────┬────────────────┤
│ Discord Bot │ Express API │ BullMQ Workers│  Scheduler     │
│  (discord.js│ (health/    │ (sync/price/  │  (5m/10m cron) │
│    v14)     │  metrics)   │    pnl jobs)  │                │
├─────────────┴─────────────┴───────────────┴────────────────┤
│                    Engine Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ FIFO P&L    │  │ Portfolio   │  │  Historical Sync  │   │
│  │   Engine    │  │   Engine    │  │      Engine       │   │
│  └─────────────┘  └─────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PostgreSQL│  │  Redis   │  │ OpenSea  │  │ Alchemy  │   │
│  │ (Prisma) │  │  Cache   │  │   API    │  │   SDK    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### Discord Slash Commands

| Command | Description |
|---|---|
| `/wallet-add <address>` | Connect an Ethereum wallet and start full historical sync |
| `/wallet-remove <address>` | Remove a tracked wallet |
| `/wallets` | Show all connected wallets and sync status |
| `/portfolio` | Full portfolio dashboard with interactive buttons |
| `/holdings [page]` | Paginated view of current NFT holdings + unrealized P&L |
| `/pnl` | Complete profit & loss breakdown with win rate |
| `/trade-history [page] [sort]` | Paginated closed-trade history with FIFO P&L |
| `/collection <slug>` | Per-collection performance analysis |
| `/leaderboard` | Server-wide P&L ranking |
| `/refresh [address]` | Force an incremental wallet re-sync |

### P&L Engine

**Realized P&L Formula:**
```
Net Proceeds    = Sale Price − Sell Gas − Marketplace Fee − Creator Royalty
Total Cost      = Purchase Price + Buy Gas Fee
Realized P&L    = Net Proceeds − Total Cost
ROI %           = (Realized P&L ÷ Total Cost) × 100
```

**Unrealized P&L Formula:**
```
Unrealized P&L  = Current Floor Price − Total Cost Basis (inc. gas)
```

**FIFO Cost Basis** — When multiple buys exist, the oldest purchase cost is consumed first on each sale.

### Background Workers

| Worker | Interval | Job |
|---|---|---|
| Sync Worker | On-demand | Full/incremental wallet history scan |
| Price Worker | Every 10 min | Collection floor prices + ETH/USD rate |
| P&L Worker | After each sync | Recalculate unrealized P&L for all holdings |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 16
- Redis 7
- Docker (optional but recommended)

### 1. Clone & Install

```bash
git clone https://github.com/yourorg/conn3ct-pnl.git
cd conn3ct-pnl
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your keys (see Configuration section below)
```

### 3. Database Setup

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Register Discord Commands

```bash
# Dev (instant, guild-scoped):
DISCORD_GUILD_ID=your_server_id npm run deploy:commands

# Production (global, ~1hr propagation):
npm run deploy:commands
```

### 5. Start the Bot

```bash
# Development (hot-reload)
npm run dev

# Production build
npm run build && npm start
```

---

## Docker Deployment

```bash
# Start everything (app + postgres + redis + prometheus + grafana)
docker compose up -d

# Run database migrations
docker compose run --rm migrate

# Register Discord slash commands
docker compose exec app node dist/bot/deploy-commands.js

# View logs
docker compose logs -f app

# Scale the app horizontally
docker compose up -d --scale app=3
```

---

## Kubernetes Deployment

```bash
# Create namespace + secrets + configmap
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml    # Edit secrets first!
kubectl apply -f k8s/configmap.yaml

# Deploy application + HPA
kubectl apply -f k8s/deployment.yaml

# Run database migration as a Job
kubectl run migrate --image=conn3ct-pnl:latest --restart=Never \
  --env-from=secret/conn3ct-pnl-secrets \
  --command -- npx prisma migrate deploy

# Check rollout
kubectl rollout status deployment/conn3ct-pnl -n conn3ct-pnl
```

---

## Configuration Reference

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token from Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ | Discord application client ID |
| `DISCORD_GUILD_ID` | Dev only | Guild ID for instant slash command registration |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_HOST` | ✅ | Redis hostname |
| `REDIS_PASSWORD` | — | Redis auth password |
| `OPENSEA_API_KEY` | ✅ | OpenSea API key (pro recommended) |
| `OPENSEA_API_KEYS` | — | Comma-separated list for key rotation |
| `ALCHEMY_API_KEY` | ✅ | Alchemy API key for Ethereum data |
| `ETHEREUM_RPC_URL` | ✅ | Primary Ethereum JSON-RPC URL |
| `ETHEREUM_RPC_FALLBACK` | — | Fallback RPC (Infura/QuickNode) |
| `COINGECKO_API_KEY` | — | CoinGecko pro key for ETH/USD price |
| `API_SECRET_KEY` | ✅ | 32+ char secret for internal auth |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex key for data encryption |
| `JWT_SECRET` | ✅ | JWT signing secret |

---

## Project Structure

```
conn3ct-pnl/
├── src/
│   ├── index.ts                  # Main entry point
│   ├── types/index.ts            # All TypeScript types
│   ├── utils/
│   │   ├── config.ts             # Env config loader
│   │   ├── logger.ts             # Winston logger
│   │   ├── validators.ts         # ETH address / tx hash validation
│   │   ├── formatters.ts         # Discord display formatters
│   │   └── math.ts               # High-precision ETH arithmetic
│   ├── cache/
│   │   ├── redis.ts              # ioredis client + cache helpers
│   │   └── cacheKeys.ts          # Centralized cache key registry + TTLs
│   ├── database/
│   │   ├── prisma.ts             # Prisma client singleton
│   │   └── repositories/
│   │       ├── userRepository.ts
│   │       ├── walletRepository.ts
│   │       ├── nftRepository.ts
│   │       ├── transactionRepository.ts
│   │       └── pnlRepository.ts
│   ├── api/
│   │   ├── opensea/
│   │   │   ├── client.ts         # OpenSea API client (rate limit + retry + key rotation)
│   │   │   └── rateLimiter.ts    # Token-bucket rate limiter
│   │   ├── ethereum/
│   │   │   └── client.ts         # Alchemy SDK + ethers.js gas data
│   │   └── server.ts             # Express REST API + Prometheus
│   ├── engines/
│   │   ├── fifo.ts               # FIFO cost basis + P&L calculations
│   │   ├── portfolio.ts          # Portfolio aggregation engine
│   │   └── sync.ts               # Historical + incremental sync engine
│   ├── workers/
│   │   ├── queues.ts             # BullMQ queue definitions
│   │   ├── syncWorker.ts         # Wallet sync worker
│   │   ├── priceWorker.ts        # Floor price updater
│   │   ├── pnlWorker.ts          # Unrealized P&L recalculator
│   │   └── scheduler.ts          # Repeatable job scheduler
│   └── bot/
│       ├── index.ts              # Discord client factory
│       ├── deploy-commands.ts    # Slash command registration
│       ├── commands/
│       │   ├── wallet.ts         # /wallet-add, /wallet-remove, /wallets, /refresh
│       │   ├── portfolio.ts      # /portfolio
│       │   ├── holdings.ts       # /holdings
│       │   ├── pnl.ts            # /pnl
│       │   ├── tradeHistory.ts   # /trade-history
│       │   ├── collection.ts     # /collection
│       │   └── leaderboard.ts    # /leaderboard
│       └── handlers/
│           └── commandHandler.ts # Command router + button handler
├── prisma/
│   └── schema.prisma             # Full DB schema
├── tests/
│   ├── setup.ts
│   └── unit/
│       ├── fifo.test.ts          # FIFO engine tests
│       ├── math.test.ts          # Math utility tests
│       ├── validators.test.ts    # Validator tests
│       └── formatters.test.ts    # Formatter tests
├── k8s/                          # Kubernetes manifests
├── monitoring/                   # Prometheus config
├── .github/workflows/ci.yml      # GitHub Actions CI/CD
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Database Schema

```sql
users           -- Discord users (discordId, username)
wallets         -- ETH wallets (address, userId, status, lastSyncBlock)
collections     -- NFT collections (slug, contractAddress, floorPrice)
nfts            -- Individual NFTs (tokenId, contractAddress, metadata)
transactions    -- Buy/sell/transfer events (price, gas, fees, timestamp)
holdings        -- Current holdings (costBasis, gasFee, acquisitionDate)
pnl_records     -- Realized + unrealized P&L per NFT per wallet
sync_jobs       -- Background sync job tracking
eth_price_history -- ETH/USD price snapshots
audit_logs      -- Security audit trail
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check (DB + Redis) |
| GET | `/ready` | Kubernetes readiness probe |
| GET | `/metrics` | Prometheus metrics scrape endpoint |
| GET | `/jobs` | Bull Board job dashboard (basic auth) |
| GET | `/api/queues/stats` | Queue depth stats |

---

## Monitoring

Prometheus metrics exposed at `/metrics`:

- `conn3ct_pnl_discord_commands_total` — Commands processed by name/status
- `conn3ct_pnl_wallet_syncs_total` — Sync jobs by type/status
- `conn3ct_pnl_api_latency_seconds` — OpenSea API latency histogram
- `conn3ct_pnl_active_wallets` — Currently tracked wallets
- `conn3ct_pnl_total_users` — Registered users
- Default Node.js metrics (GC, event loop, memory)

Access Grafana at `http://localhost:3001` (admin/admin by default).

---

## Security

- Wallets are **read-only** — no private keys ever stored
- API keys stored as environment variables / Kubernetes Secrets
- Rate limiting on all public endpoints
- Input sanitization + ETH address validation on all wallet inputs
- Non-root Docker container user
- Audit log for all user actions
- Basic auth protecting Bull Board dashboard

---

## Performance Targets

| Metric | Target |
|---|---|
| Users supported | 100,000+ |
| Transactions indexed | Millions |
| Portfolio query latency | < 2s (cached) |
| Floor price freshness | < 10 min |
| Wallet sync time (1000 txs) | < 5 min |
| Redis cache hit rate | > 80% |

---

## Testing

```bash
# Unit tests
npm test

# Unit tests with coverage report
npm run test:coverage

# Watch mode
npx jest --watch
```

Test coverage targets:
- Functions: ≥ 80%
- Lines: ≥ 80%
- Branches: ≥ 70%

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 |
| Discord | discord.js v14 |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache | Redis 7 + ioredis |
| Blockchain | Alchemy SDK + ethers.js v6 |
| NFT Data | OpenSea API v2 |
| Job Queue | BullMQ |
| API Server | Express 4 + helmet + cors |
| Metrics | prom-client (Prometheus) |
| Logging | Winston + daily-rotate-file |
| Containers | Docker + Kubernetes |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus + Grafana |

---

## License

MIT — Built for the CONN3CT community.

import { AppConfig } from '../types';
import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function parseApiKeys(): string[] {
  const multi = process.env['OPENSEA_API_KEYS'];
  if (multi) {
    return multi.split(',').map((k) => k.trim()).filter(Boolean);
  }
  const single = process.env['OPENSEA_API_KEY'];
  if (single) return [single];
  throw new Error('Missing OPENSEA_API_KEY or OPENSEA_API_KEYS');
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),

    discord: {
      botToken: requireEnv('DISCORD_BOT_TOKEN'),
      clientId: requireEnv('DISCORD_CLIENT_ID'),
      guildId: process.env['DISCORD_GUILD_ID'],
    },

    database: {
      url: requireEnv('DATABASE_URL'),
      poolMin: parseInt(optionalEnv('DATABASE_POOL_MIN', '2'), 10),
      poolMax: parseInt(optionalEnv('DATABASE_POOL_MAX', '20'), 10),
    },

    redis: {
      host: optionalEnv('REDIS_HOST', 'localhost'),
      port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
      password: process.env['REDIS_PASSWORD'],
      db: parseInt(optionalEnv('REDIS_DB', '0'), 10),
      tls: optionalEnv('REDIS_TLS', 'false') === 'true',
    },

    opensea: {
      apiKeys: parseApiKeys(),
      baseUrl: optionalEnv('OPENSEA_BASE_URL', 'https://api.opensea.io/api/v2'),
      rateLimitRps: parseInt(optionalEnv('OPENSEA_RATE_LIMIT_RPS', '4'), 10),
    },

    ethereum: {
      alchemyApiKey: requireEnv('ALCHEMY_API_KEY'),
      network: optionalEnv('ALCHEMY_NETWORK', 'eth-mainnet'),
      rpcUrl: requireEnv('ETHEREUM_RPC_URL'),
      rpcFallback: process.env['ETHEREUM_RPC_FALLBACK'],
    },

    workers: {
      syncConcurrency: parseInt(optionalEnv('SYNC_WORKER_CONCURRENCY', '5'), 10),
      priceConcurrency: parseInt(optionalEnv('PRICE_WORKER_CONCURRENCY', '3'), 10),
      pnlConcurrency: parseInt(optionalEnv('PNL_WORKER_CONCURRENCY', '10'), 10),
      walletSyncIntervalMs: parseInt(optionalEnv('WALLET_SYNC_INTERVAL_MS', '300000'), 10),
      priceUpdateIntervalMs: parseInt(optionalEnv('PRICE_UPDATE_INTERVAL_MS', '600000'), 10),
    },

    security: {
      apiSecretKey: requireEnv('API_SECRET_KEY'),
      encryptionKey: requireEnv('ENCRYPTION_KEY'),
      jwtSecret: requireEnv('JWT_SECRET'),
    },

    monitoring: {
      prometheusPort: parseInt(optionalEnv('PROMETHEUS_PORT', '9090'), 10),
    },
  };
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

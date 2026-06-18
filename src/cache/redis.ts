import Redis from 'ioredis';
import { getConfig } from '../utils/config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('redis');

let _client: Redis | null = null;

export function getRedisClient(): Redis {
  if (_client) return _client;

  const cfg = getConfig();
  _client = new Redis({
    host: cfg.redis.host,
    port: cfg.redis.port,
    password: cfg.redis.password,
    db: cfg.redis.db,
    tls: cfg.redis.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    },
    reconnectOnError: (err) => {
      log.warn('Redis reconnect on error', { error: err.message });
      return true;
    },
  });

  _client.on('connect', () => log.info('Redis connected'));
  _client.on('error', (err) => log.error('Redis error', { error: err.message }));
  _client.on('close', () => log.warn('Redis connection closed'));

  return _client;
}

export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

// ── Generic cache helpers ─────────────────────────────────────
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await getRedisClient().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  const client = getRedisClient();
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await client.setex(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await getRedisClient().del(key);
}

export async function cacheDelPattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  const keys = await client.keys(pattern);
  if (keys.length === 0) return 0;
  await client.del(...keys);
  return keys.length;
}

// ── Atomic increment (rate limiting) ─────────────────────────
export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  const client = getRedisClient();
  const multi = client.multi();
  multi.incr(key);
  multi.expire(key, ttlSeconds);
  const results = await multi.exec();
  return (results?.[0]?.[1] as number) ?? 0;
}

// ── Cache-or-fetch helper ─────────────────────────────────────
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

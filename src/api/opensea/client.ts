import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { RateLimiter } from './rateLimiter';
import { getConfig } from '../../utils/config';
import { createChildLogger } from '../../utils/logger';
import type {
  OpenSeaNftEvent,
  OpenSeaCollection,
  OpenSeaCollectionStats,
  OpenSeaNft,
} from '../../types';

const log = createChildLogger('opensea');

// ── API Key Rotator ───────────────────────────────────────────
class ApiKeyRotator {
  private keys: string[];
  private index = 0;

  constructor(keys: string[]) {
    this.keys = keys;
  }

  next(): string {
    const key = this.keys[this.index % this.keys.length]!;
    this.index++;
    return key;
  }

  rotate(): void {
    this.index++;
    log.warn('Rotating OpenSea API key', { newIndex: this.index % this.keys.length });
  }

  get count(): number {
    return this.keys.length;
  }
}

// ── OpenSea Client ────────────────────────────────────────────
export class OpenSeaClient {
  private http: AxiosInstance;
  private limiter: RateLimiter;
  private rotator: ApiKeyRotator;

  constructor() {
    const cfg = getConfig();
    this.limiter = new RateLimiter(cfg.opensea.rateLimitRps);
    this.rotator = new ApiKeyRotator(cfg.opensea.apiKeys);

    this.http = axios.create({
      baseURL: cfg.opensea.baseUrl,
      timeout: 30_000,
      headers: { Accept: 'application/json' },
    });

    axiosRetry(this.http, {
      retries: 3,
      retryDelay: (retryCount) => {
        const delay = axiosRetry.exponentialDelay(retryCount);
        log.warn('OpenSea retry', { attempt: retryCount, delayMs: delay });
        return delay;
      },
      retryCondition: (err) => {
        if (err.response?.status === 429) {
          this.rotator.rotate();
          return true;
        }
        return axiosRetry.isNetworkOrIdempotentRequestError(err);
      },
    });

    this.http.interceptors.request.use((config) => {
      config.headers['x-api-key'] = this.rotator.next();
      return config;
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response) {
          log.error('OpenSea API error', {
            status: err.response.status,
            url: err.config?.url,
            data: err.response.data,
          });
        }
        return Promise.reject(err);
      },
    );
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    await this.limiter.acquire();
    const res = await this.http.request<T>(config);
    return res.data;
  }

  // ── NFT Events for a wallet ───────────────────────────────
  async getNftEventsByAccount(
    walletAddress: string,
    options: {
      eventType?: string;
      limit?: number;
      next?: string;
      occurredAfter?: number;
    } = {},
  ): Promise<{ asset_events: OpenSeaNftEvent[]; next: string | null }> {
    const params: Record<string, string | number> = {
      account_address: walletAddress,
      limit: options.limit ?? 50,
    };
    if (options.eventType) params['event_type'] = options.eventType;
    if (options.next) params['next'] = options.next;
    if (options.occurredAfter) params['occurred_after'] = options.occurredAfter;

    return this.request({
      method: 'GET',
      url: '/events/accounts/{address}'.replace('{address}', walletAddress),
      params,
    });
  }

  // ── Paginate all events for a wallet ─────────────────────
  async *iterateWalletEvents(
    walletAddress: string,
    eventTypes: string[] = ['sale', 'transfer'],
    afterTimestamp?: number,
  ): AsyncGenerator<OpenSeaNftEvent> {
    for (const eventType of eventTypes) {
      let cursor: string | null = null;
      let page = 0;
      do {
        const res = await this.getNftEventsByAccount(walletAddress, {
          eventType,
          limit: 50,
          next: cursor ?? undefined,
          occurredAfter: afterTimestamp,
        });
        for (const event of res.asset_events) {
          yield event;
        }
        cursor = res.next;
        page++;
        log.debug('Fetched events page', { walletAddress, eventType, page, cursor: !!cursor });
      } while (cursor);
    }
  }

  // ── Single NFT metadata ───────────────────────────────────
  async getNft(contractAddress: string, tokenId: string): Promise<OpenSeaNft> {
    return this.request({
      method: 'GET',
      url: `/chain/ethereum/contract/${contractAddress}/nfts/${tokenId}`,
    }).then((res: any) => res.nft);
  }

  // ── Collection metadata ───────────────────────────────────
  async getCollection(slug: string): Promise<OpenSeaCollection> {
    return this.request<OpenSeaCollection>({
      method: 'GET',
      url: `/collections/${slug}`,
    });
  }

  // ── Collection by contract ────────────────────────────────
  async getCollectionByContract(contractAddress: string): Promise<OpenSeaCollection | null> {
    try {
      const res = await this.request<{ collection: string } | null>({
        method: 'GET',
        url: `/chain/ethereum/contract/${contractAddress}`,
      });
      if (!res) return null;
      const slug = (res as any).collection;
      if (!slug) return null;
      return this.getCollection(slug);
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  // ── Collection stats (floor price, volume) ────────────────
  async getCollectionStats(slug: string): Promise<OpenSeaCollectionStats> {
    return this.request<OpenSeaCollectionStats>({
      method: 'GET',
      url: `/collections/${slug}/stats`,
    });
  }

  // ── NFTs held by a wallet ─────────────────────────────────
  async getNftsByWallet(
    walletAddress: string,
    limit = 50,
    next?: string,
  ): Promise<{ nfts: OpenSeaNft[]; next: string | null }> {
    return this.request({
      method: 'GET',
      url: `/chain/ethereum/account/${walletAddress}/nfts`,
      params: { limit, ...(next ? { next } : {}) },
    });
  }

  // ── Paginate all NFTs held by a wallet ────────────────────
  async *iterateWalletNfts(walletAddress: string): AsyncGenerator<OpenSeaNft> {
    let cursor: string | null = null;
    do {
      const res = await this.getNftsByWallet(walletAddress, 50, cursor ?? undefined);
      for (const nft of res.nfts) yield nft;
      cursor = res.next;
    } while (cursor);
  }
}

// Singleton
let _client: OpenSeaClient | null = null;
export function getOpenSeaClient(): OpenSeaClient {
  if (!_client) _client = new OpenSeaClient();
  return _client;
}

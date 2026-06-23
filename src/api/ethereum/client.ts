import { Alchemy, Network, AssetTransfersCategory } from 'alchemy-sdk';
import { ethers } from 'ethers';
import { getConfig } from '../../utils/config';
import { createChildLogger } from '../../utils/logger';
import { weiToEth } from '../../utils/math';
import type { EthereumGasData } from '../../types';

const log = createChildLogger('ethereum');

// ── Alchemy + Ethers provider ────────────────────────────────
let _alchemy: Alchemy | null = null;
let _provider: ethers.JsonRpcProvider | null = null;

function getAlchemy(): Alchemy {
  if (_alchemy) return _alchemy;
  const cfg = getConfig();
  _alchemy = new Alchemy({
    apiKey: cfg.ethereum.alchemyApiKey,
    network: cfg.ethereum.network as Network,
    maxRetries: 5,
  });
  return _alchemy;
}

function getProvider(): ethers.JsonRpcProvider {
  if (_provider) return _provider;
  const cfg = getConfig();
  _provider = new ethers.JsonRpcProvider(cfg.ethereum.rpcUrl);
  return _provider;
}

// ── Gas data for a transaction ────────────────────────────────
export async function getGasDataForTx(txHash: string): Promise<EthereumGasData | null> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;

    const gasUsed = receipt.gasUsed;
    const gasPriceWei = receipt.gasPrice ?? BigInt(0);
    const gasFeeWei = gasUsed * gasPriceWei;
    const gasFeeEth = weiToEth(gasFeeWei);

    return { gasUsed, gasPriceWei, gasFeeWei, gasFeeEth };
  } catch (err: any) {
    log.error('Failed to get gas data', { txHash, error: err.message });
    return null;
  }
}

// ── Block timestamp ───────────────────────────────────────────
export async function getBlockTimestamp(blockNumber: number): Promise<Date | null> {
  try {
    const alchemy = getAlchemy();
    const block = await alchemy.core.getBlock(blockNumber);
    if (!block) return null;
    return new Date(block.timestamp * 1000);
  } catch (err: any) {
    log.error('Failed to get block timestamp', { blockNumber, error: err.message });
    return null;
  }
}

// ── Current block number ──────────────────────────────────────
export async function getCurrentBlock(): Promise<number> {
  const alchemy = getAlchemy();
  return alchemy.core.getBlockNumber();
}

// ── ETH balance of a wallet ───────────────────────────────────
export async function getEthBalance(address: string): Promise<string> {
  const alchemy = getAlchemy();
  // alchemy-sdk v2 returns ethers v5 BigNumber; .toString() bridges to BigInt
  const balanceWei = await alchemy.core.getBalance(address) as unknown as { toString(): string };
  return weiToEth(BigInt(balanceWei.toString()));
}

// ── ERC-721 transfers for a wallet ───────────────────────────
export async function getErc721TransfersForWallet(
  walletAddress: string,
  fromBlock?: number,
): Promise<AssetTransfersWithMetadata[]> {
  const alchemy = getAlchemy();

  const [incoming, outgoing] = await Promise.all([
    alchemy.core.getAssetTransfers({
      toAddress: walletAddress,
      category: [AssetTransfersCategory.ERC721],
      withMetadata: true,
      maxCount: 1000,
      ...(fromBlock ? { fromBlock: `0x${fromBlock.toString(16)}` } : {}),
    }),
    alchemy.core.getAssetTransfers({
      fromAddress: walletAddress,
      category: [AssetTransfersCategory.ERC721],
      withMetadata: true,
      maxCount: 1000,
      ...(fromBlock ? { fromBlock: `0x${fromBlock.toString(16)}` } : {}),
    }),
  ]);

  return [...incoming.transfers, ...outgoing.transfers] as AssetTransfersWithMetadata[];
}

// ── ERC-1155 transfers ────────────────────────────────────────
export async function getErc1155TransfersForWallet(
  walletAddress: string,
  fromBlock?: number,
): Promise<AssetTransfersWithMetadata[]> {
  const alchemy = getAlchemy();

  const [incoming, outgoing] = await Promise.all([
    alchemy.core.getAssetTransfers({
      toAddress: walletAddress,
      category: [AssetTransfersCategory.ERC1155],
      withMetadata: true,
      maxCount: 1000,
      ...(fromBlock ? { fromBlock: `0x${fromBlock.toString(16)}` } : {}),
    }),
    alchemy.core.getAssetTransfers({
      fromAddress: walletAddress,
      category: [AssetTransfersCategory.ERC1155],
      withMetadata: true,
      maxCount: 1000,
      ...(fromBlock ? { fromBlock: `0x${fromBlock.toString(16)}` } : {}),
    }),
  ]);

  return [...incoming.transfers, ...outgoing.transfers] as AssetTransfersWithMetadata[];
}

// ── ETH/USD price (CoinGecko → CryptoCompare → cached fallback) ──
let _lastKnownEthPrice = 0;

export async function getEthPriceUsd(): Promise<number> {
  // 1. CoinGecko (free or pro)
  try {
    const cgKey = process.env['COINGECKO_API_KEY'];
    const url = cgKey
      ? `https://pro-api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&x_cg_pro_api_key=${cgKey}`
      : `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = (await res.json()) as { ethereum: { usd: number } };
      const price = data.ethereum?.usd;
      if (price && price > 0) {
        _lastKnownEthPrice = price;
        return price;
      }
    }
  } catch {
    // fall through to next provider
  }

  // 2. CryptoCompare (no key required)
  try {
    const res = await fetch(
      'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
      { signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      const data = (await res.json()) as { USD: number };
      const price = data.USD;
      if (price && price > 0) {
        _lastKnownEthPrice = price;
        return price;
      }
    }
  } catch {
    // fall through
  }

  // 3. Last known value, or throw so caller can log the real failure
  if (_lastKnownEthPrice > 0) {
    log.warn('ETH price fetch failed — using last known value', { price: _lastKnownEthPrice });
    return _lastKnownEthPrice;
  }

  throw new Error('All ETH price providers failed and no cached value available');
}

// ── Validate wallet address ───────────────────────────────────
export async function isContractAddress(address: string): Promise<boolean> {
  try {
    const provider = getProvider();
    const code = await provider.getCode(address);
    return code !== '0x';
  } catch {
    return false;
  }
}

// Type alias for alchemy transfer with metadata
export interface AssetTransfersWithMetadata {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  tokenId: string | null;
  asset: string | null;
  category: string;
  rawContract: { address: string | null; decimal: string | null; value: string | null };
  metadata: { blockTimestamp: string | null };
}

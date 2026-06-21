import { ethers } from 'ethers';

export function isValidEthAddress(address: string): boolean {
  // Accept any syntactically valid Ethereum address (checksummed or lowercase)
  // ethers.isAddress handles 0x-prefixed 20-byte hex in any case form
  return ethers.isAddress(address);
}

export function normalizeAddress(address: string): string {
  return ethers.getAddress(address).toLowerCase();
}

export function isValidTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

export function isValidTokenId(tokenId: string): boolean {
  return /^\d+$/.test(tokenId);
}

export function sanitizeDiscordId(id: string): string {
  return id.replace(/\D/g, '');
}

export function clampPage(page: number, maxPage: number): number {
  return Math.max(1, Math.min(page, Math.max(1, maxPage)));
}

export function validatePageSize(size: number, max = 25): number {
  return Math.max(1, Math.min(size, max));
}

import { Decimal } from '@prisma/client/runtime/library';

// ── ETH formatting ────────────────────────────────────────────
export function formatEth(value: string | Decimal | number, decimals = 4): string {
  const n = parseFloat(value.toString());
  if (isNaN(n)) return '0.0000 ETH';
  return `${n.toFixed(decimals)} ETH`;
}

export function formatEthShort(value: string | Decimal | number): string {
  const n = parseFloat(value.toString());
  if (isNaN(n)) return '0 ETH';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)}k ETH`;
  if (Math.abs(n) >= 1) return `${n.toFixed(3)} ETH`;
  return `${n.toFixed(5)} ETH`;
}

// ── USD formatting ────────────────────────────────────────────
export function formatUsd(value: string | Decimal | number): string {
  const n = parseFloat(value.toString());
  if (isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

// ── Percentage formatting ─────────────────────────────────────
export function formatPct(value: string | Decimal | number, decimals = 2): string {
  const n = parseFloat(value.toString());
  if (isNaN(n)) return '0.00%';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

// ── P&L sign emoji ────────────────────────────────────────────
export function pnlEmoji(value: string | Decimal | number): string {
  const n = parseFloat(value.toString());
  if (n > 0) return '📈';
  if (n < 0) return '📉';
  return '➖';
}

export function pnlColor(value: string | Decimal | number): number {
  const n = parseFloat(value.toString());
  if (n > 0) return 0x00ff88; // green
  if (n < 0) return 0xff4444; // red
  return 0x888888; // gray
}

// ── Address truncation ────────────────────────────────────────
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// ── Duration formatting ───────────────────────────────────────
export function formatDuration(days: number): string {
  if (days < 1) return '< 1 day';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  const years = Math.floor(days / 365);
  const remDays = days % 365;
  return `${years}y ${Math.floor(remDays / 30)}mo`;
}

// ── Timestamp formatting ──────────────────────────────────────
export function formatTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

// ── Progress bar ──────────────────────────────────────────────
export function progressBar(percent: number, length = 20): string {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent.toFixed(0)}%`;
}

// ── Number with commas ────────────────────────────────────────
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

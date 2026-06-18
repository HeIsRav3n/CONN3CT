// No external dependencies needed — pure engine functions
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  buildFifoBatch,
  consumeFifoBatches,
  calculateRealizedPnl,
  calculateUnrealizedPnl,
  classifyTransaction,
  parsePaymentAmountToEth,
} from '../../src/engines/fifo';

describe('FIFO Engine', () => {
  // ── buildFifoBatch ──────────────────────────────────────────
  describe('buildFifoBatch', () => {
    it('creates a batch with correct per-unit cost basis', () => {
      const batch = buildFifoBatch('2.0', '0.04', 2, new Date('2024-01-01'), '0xabc');
      expect(parseFloat(batch.costBasisEth)).toBeCloseTo(1.0, 10);
      expect(parseFloat(batch.gasFeeEth)).toBeCloseTo(0.02, 10);
      expect(parseFloat(batch.totalCostEth)).toBeCloseTo(1.02, 10);
      expect(batch.quantity).toBe(2);
    });

    it('handles single-unit purchase', () => {
      const batch = buildFifoBatch('1.5', '0.02', 1, new Date(), '0xdef');
      expect(parseFloat(batch.costBasisEth)).toBeCloseTo(1.5, 10);
      expect(parseFloat(batch.gasFeeEth)).toBeCloseTo(0.02, 10);
    });
  });

  // ── consumeFifoBatches ──────────────────────────────────────
  describe('consumeFifoBatches', () => {
    it('consumes a single batch fully on exact-quantity sale', () => {
      const batches = [buildFifoBatch('1.0', '0.02', 1, new Date('2024-01-01'), '0x1')];
      const result = consumeFifoBatches(batches, 1);
      expect(parseFloat(result.costBasisEth)).toBeCloseTo(1.0, 10);
      expect(result.remainingBatches).toHaveLength(0);
    });

    it('consumes the oldest batch first (FIFO ordering)', () => {
      const old = buildFifoBatch('0.5', '0.01', 1, new Date('2023-01-01'), '0xold');
      const fresh = buildFifoBatch('1.5', '0.01', 1, new Date('2024-01-01'), '0xnew');
      const result = consumeFifoBatches([fresh, old], 1); // unordered input
      // FIFO: oldest consumed first → cost = 0.5
      expect(parseFloat(result.costBasisEth)).toBeCloseTo(0.5, 10);
      expect(result.remainingBatches).toHaveLength(1);
      expect(parseFloat(result.remainingBatches[0]!.costBasisEth)).toBeCloseTo(1.5, 10);
    });

    it('partially consumes a batch', () => {
      const batch = buildFifoBatch('3.0', '0.06', 3, new Date(), '0x1');
      const result = consumeFifoBatches([batch], 2);
      expect(result.remainingBatches).toHaveLength(1);
      expect(result.remainingBatches[0]!.quantity).toBe(1);
    });

    it('throws when sell quantity exceeds available supply', () => {
      const batch = buildFifoBatch('1.0', '0.02', 1, new Date(), '0x1');
      expect(() => consumeFifoBatches([batch], 5)).toThrow();
    });

    it('throws when no batches provided', () => {
      expect(() => consumeFifoBatches([], 1)).toThrow();
    });
  });

  // ── calculateRealizedPnl ────────────────────────────────────
  describe('calculateRealizedPnl', () => {
    it('matches the specification example', () => {
      // Buy for 1 ETH, gas 0.02 → total cost = 1.02
      // Sell for 2 ETH, sell gas 0.01, marketplace 0.025 (2.5%=250bps), royalty 0.025
      const result = calculateRealizedPnl({
        costBasisEth: '1.0',
        buyGasFeeEth: '0.02',
        salePriceEth: '2.0',
        sellGasFeeEth: '0.01',
        marketplaceFeeEth: '0.05',
        royaltyFeeEth: '0.00',
        ethPriceUsd: 3000,
      });

      // Net proceeds = 2.0 - 0.01 - 0.05 = 1.94
      expect(parseFloat(result.netProceedsEth)).toBeCloseTo(1.94, 6);
      // Realized P&L = 1.94 - 1.02 = 0.92
      expect(parseFloat(result.realizedPnlEth)).toBeCloseTo(0.92, 6);
      // ROI = 0.92 / 1.02 * 100 ≈ 90.20%
      expect(parseFloat(result.roiPct)).toBeCloseTo(90.196, 1);
    });

    it('calculates correct USD amounts', () => {
      const result = calculateRealizedPnl({
        costBasisEth: '1.0',
        buyGasFeeEth: '0.0',
        salePriceEth: '2.0',
        sellGasFeeEth: '0.0',
        marketplaceFeeEth: '0.0',
        royaltyFeeEth: '0.0',
        ethPriceUsd: 2000,
      });
      expect(parseFloat(result.realizedPnlUsd)).toBeCloseTo(2000, 0);
    });

    it('handles negative P&L (loss trade)', () => {
      const result = calculateRealizedPnl({
        costBasisEth: '2.0',
        buyGasFeeEth: '0.05',
        salePriceEth: '1.0',
        sellGasFeeEth: '0.02',
        marketplaceFeeEth: '0.025',
        royaltyFeeEth: '0.025',
        ethPriceUsd: 3000,
      });
      expect(parseFloat(result.realizedPnlEth)).toBeLessThan(0);
      expect(parseFloat(result.roiPct)).toBeLessThan(0);
    });
  });

  // ── calculateUnrealizedPnl ──────────────────────────────────
  describe('calculateUnrealizedPnl', () => {
    it('correctly computes unrealized profit', () => {
      const result = calculateUnrealizedPnl({
        costBasisEth: '1.0',
        gasFeeEth: '0.02',
        currentFloorPriceEth: '3.0',
        ethPriceUsd: 3000,
      });
      // Total cost = 1.02, current floor = 3.0, unrealized = 1.98
      expect(parseFloat(result.unrealizedPnlEth)).toBeCloseTo(1.98, 6);
    });

    it('correctly computes unrealized loss', () => {
      const result = calculateUnrealizedPnl({
        costBasisEth: '5.0',
        gasFeeEth: '0.1',
        currentFloorPriceEth: '1.0',
        ethPriceUsd: 3000,
      });
      expect(parseFloat(result.unrealizedPnlEth)).toBeCloseTo(-4.1, 6);
    });
  });

  // ── classifyTransaction ─────────────────────────────────────
  describe('classifyTransaction', () => {
    const WALLET = '0xabc123';
    const SELLER = '0xseller';
    const BUYER = '0xbuyer';
    const NULL = '0x0000000000000000000000000000000000000000';

    it('classifies mint correctly', () => {
      expect(classifyTransaction(WALLET, NULL, WALLET, false)).toBe('MINT');
    });

    it('classifies sale buy correctly', () => {
      expect(classifyTransaction(WALLET, SELLER, WALLET, true)).toBe('BUY');
    });

    it('classifies sale sell correctly', () => {
      expect(classifyTransaction(WALLET, WALLET, BUYER, true)).toBe('SELL');
    });

    it('classifies incoming transfer', () => {
      expect(classifyTransaction(WALLET, SELLER, WALLET, false)).toBe('TRANSFER_IN');
    });

    it('classifies outgoing transfer', () => {
      expect(classifyTransaction(WALLET, WALLET, BUYER, false)).toBe('TRANSFER_OUT');
    });
  });

  // ── parsePaymentAmountToEth ─────────────────────────────────
  describe('parsePaymentAmountToEth', () => {
    it('converts wei quantity to ETH', () => {
      const eth = parsePaymentAmountToEth('1000000000000000000', 18); // 1 ETH in wei
      expect(parseFloat(eth)).toBeCloseTo(1.0, 10);
    });

    it('handles WETH with 18 decimals', () => {
      const eth = parsePaymentAmountToEth('2500000000000000000', 18); // 2.5 ETH
      expect(parseFloat(eth)).toBeCloseTo(2.5, 10);
    });
  });
});

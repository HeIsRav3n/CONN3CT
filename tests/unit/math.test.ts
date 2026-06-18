import {
  weiToEth,
  gweiToEth,
  addEth,
  subtractEth,
  calcRoiPct,
  calcMarketplaceFee,
  calcRoyaltyFee,
  calcNetProceeds,
  calcRealizedPnl,
  calcTotalCost,
  calcUnrealizedPnl,
  ethToUsd,
  calcWinRate,
} from '../../src/utils/math';

describe('Math Utilities', () => {
  describe('weiToEth', () => {
    it('converts 1 ETH in wei', () => {
      expect(parseFloat(weiToEth(BigInt('1000000000000000000')))).toBeCloseTo(1.0, 10);
    });
    it('converts 0.5 ETH in wei', () => {
      expect(parseFloat(weiToEth(BigInt('500000000000000000')))).toBeCloseTo(0.5, 10);
    });
  });

  describe('addEth / subtractEth', () => {
    it('adds two ETH values', () => {
      expect(parseFloat(addEth('1.5', '0.5'))).toBeCloseTo(2.0, 10);
    });
    it('subtracts two ETH values', () => {
      expect(parseFloat(subtractEth('2.0', '0.75'))).toBeCloseTo(1.25, 10);
    });
  });

  describe('calcMarketplaceFee', () => {
    it('calculates 2.5% marketplace fee (250 bps)', () => {
      expect(parseFloat(calcMarketplaceFee('2.0', 250))).toBeCloseTo(0.05, 10);
    });
    it('calculates 0% fee', () => {
      expect(parseFloat(calcMarketplaceFee('1.0', 0))).toBeCloseTo(0, 10);
    });
  });

  describe('calcRoyaltyFee', () => {
    it('calculates 5% royalty (500 bps)', () => {
      expect(parseFloat(calcRoyaltyFee('4.0', 500))).toBeCloseTo(0.2, 10);
    });
  });

  describe('calcNetProceeds', () => {
    it('deducts all fees from sale price', () => {
      // 2.0 - 0.01 - 0.05 - 0.0 = 1.94
      expect(parseFloat(calcNetProceeds('2.0', '0.01', '0.05', '0.0'))).toBeCloseTo(1.94, 6);
    });
  });

  describe('calcRoiPct', () => {
    it('returns 100% ROI for doubling cost', () => {
      expect(parseFloat(calcRoiPct('1.0', '1.0'))).toBeCloseTo(100, 2);
    });
    it('returns negative ROI for losses', () => {
      expect(parseFloat(calcRoiPct('-0.5', '1.0'))).toBeCloseTo(-50, 2);
    });
    it('returns 0 when cost basis is 0', () => {
      expect(parseFloat(calcRoiPct('1.0', '0'))).toBe(0);
    });
  });

  describe('ethToUsd', () => {
    it('converts ETH to USD correctly', () => {
      expect(parseFloat(ethToUsd('2.5', 3000))).toBeCloseTo(7500, 1);
    });
  });

  describe('calcWinRate', () => {
    it('calculates win rate correctly', () => {
      expect(parseFloat(calcWinRate(7, 10))).toBeCloseTo(70, 1);
    });
    it('returns 0 for no trades', () => {
      expect(parseFloat(calcWinRate(0, 0))).toBe(0);
    });
  });
});

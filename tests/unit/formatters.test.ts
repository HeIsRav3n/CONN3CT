import {
  formatEth,
  formatUsd,
  formatPct,
  pnlEmoji,
  pnlColor,
  truncateAddress,
  formatDuration,
  progressBar,
} from '../../src/utils/formatters';

describe('Formatters', () => {
  describe('formatEth', () => {
    it('formats positive ETH with suffix', () => {
      expect(formatEth('1.5')).toBe('1.5000 ETH');
    });
    it('handles zero', () => {
      expect(formatEth('0')).toBe('0.0000 ETH');
    });
    it('handles negative ETH', () => {
      expect(formatEth('-0.5')).toBe('-0.5000 ETH');
    });
  });

  describe('formatUsd', () => {
    it('formats USD with dollar sign', () => {
      expect(formatUsd('1500.50')).toContain('$');
      expect(formatUsd('1500.50')).toContain('1,500');
    });
  });

  describe('formatPct', () => {
    it('shows + for positive', () => {
      expect(formatPct('25.5')).toBe('+25.50%');
    });
    it('shows negative without +', () => {
      expect(formatPct('-10.25')).toBe('-10.25%');
    });
  });

  describe('pnlEmoji', () => {
    it('returns up arrow for profit', () => expect(pnlEmoji('1.0')).toBe('📈'));
    it('returns down arrow for loss', () => expect(pnlEmoji('-1.0')).toBe('📉'));
    it('returns dash for zero', () => expect(pnlEmoji('0')).toBe('➖'));
  });

  describe('pnlColor', () => {
    it('returns green for profit', () => expect(pnlColor('1.0')).toBe(0x00ff88));
    it('returns red for loss', () => expect(pnlColor('-1.0')).toBe(0xff4444));
    it('returns gray for zero', () => expect(pnlColor('0')).toBe(0x888888));
  });

  describe('truncateAddress', () => {
    it('truncates long addresses', () => {
      const addr = '0x742d35cc6634c0532925a3b8d4c9b1ab5bda3a9d';
      const result = truncateAddress(addr);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(addr.length);
    });
  });

  describe('formatDuration', () => {
    it('handles < 1 day', () => expect(formatDuration(0)).toBe('< 1 day'));
    it('handles 1 day', () => expect(formatDuration(1)).toBe('1 day'));
    it('handles multiple days', () => expect(formatDuration(5)).toBe('5 days'));
    it('handles months', () => expect(formatDuration(45)).toContain('mo'));
  });

  describe('progressBar', () => {
    it('generates correct bar', () => {
      const bar = progressBar(50, 10);
      expect(bar).toContain('50%');
      expect(bar).toContain('[');
      expect(bar).toContain(']');
    });
  });
});

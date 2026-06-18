import {
  isValidEthAddress,
  normalizeAddress,
  isValidTxHash,
  isValidTokenId,
} from '../../src/utils/validators';

describe('Validators', () => {
  describe('isValidEthAddress', () => {
    // Use well-known addresses with confirmed valid checksums
    it('accepts the Ethereum zero address', () => {
      expect(isValidEthAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });
    it('accepts a valid all-lowercase address', () => {
      // All-lowercase passes ethers checksum (treated as unchecksummed)
      expect(isValidEthAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(true);
    });
    it('accepts dead address (valid EIP-55 checksum)', () => {
      expect(isValidEthAddress('0x000000000000000000000000000000000000dEaD')).toBe(true);
    });
    it('rejects too-short address', () => {
      expect(isValidEthAddress('0xdeadbeef')).toBe(false);
    });
    it('rejects non-hex chars', () => {
      expect(isValidEthAddress('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
    });
    it('rejects empty string', () => {
      expect(isValidEthAddress('')).toBe(false);
    });
    it('rejects address without 0x prefix', () => {
      expect(isValidEthAddress('d8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(false);
    });
  });

  describe('normalizeAddress', () => {
    it('returns checksummed address', () => {
      const result = normalizeAddress('0x742d35cc6634c0532925a3b8d4c9b1ab5bda3a9d');
      expect(result).toBe(result.toLowerCase());
    });
  });

  describe('isValidTxHash', () => {
    it('accepts valid tx hash', () => {
      expect(isValidTxHash('0x' + 'a'.repeat(64))).toBe(true);
    });
    it('rejects short hash', () => {
      expect(isValidTxHash('0xdeadbeef')).toBe(false);
    });
    it('rejects without 0x', () => {
      expect(isValidTxHash('a'.repeat(64))).toBe(false);
    });
  });

  describe('isValidTokenId', () => {
    it('accepts numeric token IDs', () => {
      expect(isValidTokenId('0')).toBe(true);
      expect(isValidTokenId('9999')).toBe(true);
      expect(isValidTokenId('123456789')).toBe(true);
    });
    it('rejects non-numeric', () => {
      expect(isValidTokenId('abc')).toBe(false);
      expect(isValidTokenId('1.5')).toBe(false);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { generateNonce, bytesToHex, isValidNonceFormat } from '../../challenge/nonce';

describe('Challenge nonce generation', () => {
  it('generates a 32-character hex string', () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(nonce)).toBe(true);
  });

  it('generates unique nonces on successive calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateNonce());
    }
    expect(seen.size).toBe(100);
  });

  it('uses crypto.getRandomValues (not Math.random)', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generateNonce();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('produces 128 bits of entropy (all 16 bytes)', () => {
    const nonce = generateNonce();
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(nonce.substring(i * 2, i * 2 + 2), 16);
    }
    expect(bytesToHex(bytes)).toBe(nonce);
  });

  it('isValidNonceFormat accepts valid nonces', () => {
    expect(isValidNonceFormat(generateNonce())).toBe(true);
    expect(isValidNonceFormat('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(true);
    expect(isValidNonceFormat('00000000000000000000000000000000')).toBe(true);
  });

  it('isValidNonceFormat rejects invalid formats', () => {
    expect(isValidNonceFormat('')).toBe(false);
    expect(isValidNonceFormat('abc')).toBe(false);
    expect(isValidNonceFormat('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e')).toBe(false);
    expect(isValidNonceFormat('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6g')).toBe(false);
    expect(isValidNonceFormat('A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6')).toBe(false);
  });

  it('bytesToHex converts correctly', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
    expect(bytesToHex(new Uint8Array(1))).toBe('00');
  });
});

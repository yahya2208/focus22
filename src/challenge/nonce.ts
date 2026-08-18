/**
 * Challenge System — Cryptographic Nonce Generation (P3)
 *
 * Generates cryptographically secure nonces using the browser Web Crypto API.
 * NEVER uses Math.random().
 *
 * Nonce format: 32-character lowercase hex string (128 bits of entropy).
 * Generated immediately before each submission to ensure uniqueness.
 */

const NONCE_BYTE_LENGTH = 16;

/**
 * Generates a cryptographically secure nonce for challenge submission.
 *
 * Uses `crypto.getRandomValues` (Web Crypto API) which is available in all
 * modern browsers and Node.js ≥ 19. Provides 128 bits of entropy.
 *
 * Format: 32 lowercase hex characters (e.g. "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
 *
 * @returns A unique, cryptographically random hex string.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Converts a Uint8Array to a lowercase hex string.
 * Exported for testing; not part of the public API.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    hex += (byte ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Validates that a nonce matches the expected format.
 * A valid nonce is exactly 32 lowercase hex characters.
 */
export function isValidNonceFormat(nonce: string): boolean {
  return /^[0-9a-f]{32}$/.test(nonce);
}

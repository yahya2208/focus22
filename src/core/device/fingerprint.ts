/**
 * Browser device fingerprint — generates a stable, anonymous UUID from
 * non-PII browser characteristics. Used to populate sessions.device_id
 * (UUID column) so per-device analytics are possible without any identity
 * tracking.
 *
 * Properties: userAgent + screen dimensions + language + hardwareConcurrency.
 * Output: deterministic UUID v4-formatted string derived from the 8-char
 * FNV-1a hash: "{hash}-0000-4000-8000-000000000000". Same browser always
 * produces the same UUID. The fixed suffix signals "browser fingerprint,
 * not an identity key".
 *
 * No localStorage, no cookies, no external calls. Purely deterministic from
 * the current browser state.
 */

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function getDeviceFingerprint(): string {
  const parts = [
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    typeof navigator !== 'undefined' ? navigator.language : '',
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? String(navigator.hardwareConcurrency)
      : '',
  ];
  const raw = parts.join('|');
  const hash = fnv1a(raw);
  return `${hash}-0000-4000-8000-000000000000`;
}

/**
 * Browser device fingerprint — generates a stable, anonymous identifier from
 * non-PII browser characteristics. Used to populate sessions.device_id so
 * per-device analytics are possible without any identity tracking.
 *
 * Properties: userAgent + screen dimensions + language + hardwareConcurrency.
 * Output: 12-hex-char hash (not a UUID — length is intentional to signal
 * "browser fingerprint, not an identity key").
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
  return fnv1a(raw);
}

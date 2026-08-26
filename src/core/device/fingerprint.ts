/**
 * Browser device fingerprint — anonymous, deterministic hash string from
 * non-PII browser characteristics. Stored inside scientific_results JSONB
 * (NOT in sessions.device_id, which has a FK to devices.id).
 *
 * Properties: userAgent + screen dimensions + language + hardwareConcurrency.
 * Output: 8-char FNV-1a hex hash. Same browser always produces the same hash.
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

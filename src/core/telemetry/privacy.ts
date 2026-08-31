/**
 * FOCUS Telemetry — privacy & content guards (Phase T1).
 *
 * Single source of truth for what may reach the wire. Every event is filtered
 * through `sanitizeEvent` BEFORE batching/persisting; the server (00057) runs
 * the SAME allowlist logic. The client also avoids even TRANSMITTING forbidden
 * values.
 *
 * Rules (owner-approved contract):
 *   1. Property keys must be in the event's closed allowlist.
 *   2. Forbidden keys (PII / free-form / sensitive) are blocked by name.
 *   3. No arbitrary/free-form user text ever; property values constrained to
 *      enums/ids/counters/booleans/null (enforced at type level + runtime).
 */
import { getEventSchema } from './events';
import type { TelemetryEventInput, TelemetryProperties, TelemetryPropertyValue } from './types';

/**
 * Keys that are FORBIDDEN on the wire, regardless of allowlist. Covers the
 * PII/free-text/sensitive touchpoints documented for this project: phone,
 * email, address, notes, message bodies, tokens, codes, query/free text, and
 * personal names/locations sometimes embedded in source labels.
 */
export const FORBIDDEN_PROPERTY_KEYS = [
  'phone',
  'phone_number',
  'phone1',
  'phone2',
  'mobile',
  'email',
  'email_address',
  'address',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
  'postal_code',
  'notes',
  'message',
  'body',
  'body_text',
  'text',
  'content',
  'free_text',
  'comment',
  'feedback',
  'reply',
  'name',
  'full_name',
  'first_name',
  'last_name',
  'username',
  'display_name',
  'source_label',
  'description',
  'title',
  'serial',
  'stack',
  'imei',
  'mac',
  'fingerprint_raw',
  'location',
  'passphrase',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'auth_code',
  'verification_code',
  'challenge_id',
  'secret',
  'password',
  'pin',
  'otp',
  'security_answer',
  'query',
  'search_query',
  'search_term',
  'url',
  'redirect',
  'callback',
  'next',
  'state',
  's',
  'nonce',
  'fingerprint',
  'device_id',
  'ip',
  'ip_address',
] as const;

/** Read-only, runtime-friendly copy (server mirror uses the same list). */
export const FORBIDDEN_KEYS: readonly string[] = FORBIDDEN_PROPERTY_KEYS;

const forbidden = new Set<string>(FORBIDDEN_PROPERTY_KEYS);

/**
 * True when the key is forbidden (PII, free-text, sensitive, token/code).
 * Note: `code` is intentionally forbidden as a PROPERTY KEY (it is not an
 * allowed payload key for any event). This is separate from negation booleans
 * like `has_result`.
 */
export function isForbiddenKey(key: string): boolean {
  return forbidden.has(key.toLowerCase());
}

/** Normalize a caller key: lowercase, trim. Returns null if empty. */
function normalizeKey(key: string): string | null {
  const k = key.trim();
  if (!k) return null;
  return k.toLowerCase();
}

/**
 * Positive allowlist membership check for a single event.
 * Returns the normalized key when allowed, otherwise null.
 */
export function allowedKey(event: string, key: string): string | null {
  const normalized = normalizeKey(key);
  if (!normalized) return null;
  if (isForbiddenKey(normalized)) return null;
  const schema = getEventSchema(event as never);
  if (!schema || !schema.properties.includes(normalized)) return null;
  return normalized;
}

export interface SanitizeResult {
  readonly ok: boolean;
  readonly event: string;
  readonly properties: TelemetryProperties;
  /** Raw keys that were dropped because they are not in the allowlist. */
  readonly dropped: readonly string[];
  /** True when a forbidden/PII key was attempted (security-worthy). */
  readonly blocked: boolean;
}

/**
 * Filter + validate an event's properties against its closed schema and the
 * forbidden list. Callers already constrain values to `TelemetryPropertyValue`
 * via the type; this guards the EQ edge (dirty objects at the wire boundary).
 */
export function sanitizeProperties(
  event: string,
  properties: TelemetryProperties | null | undefined,
): SanitizeResult {
  const schema = getEventSchema(event as never);
  const allowed = new Set<string>(schema.properties);
  const out: TelemetryProperties = {};
  const dropped: string[] = [];
  let blocked = false;

  if (!properties) return { ok: true, event, properties: out, dropped, blocked };

  for (const rawKey of Object.keys(properties)) {
    const normalized = normalizeKey(rawKey);
    if (!normalized) continue;
    if (forbidden.has(normalized)) {
      blocked = true;
      dropped.push(rawKey);
      continue;
    }
    if (!allowed.has(normalized)) {
      dropped.push(rawKey);
      continue;
    }
    const value = properties[rawKey];
    if (isSafeValue(value)) out[normalized] = value;
  }

  return { ok: !blocked, event, properties: out, dropped, blocked };
}

function isSafeValue(value: unknown): value is TelemetryPropertyValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

/**
 * High-level entry used by the client before enqueueing. Returns the sanitized
 * property map (with blocked/dropped reported for logging). This is the FINAL
 * client-side gate; the server re-validates in 00057.
 */
export function sanitizeEvent(input: TelemetryEventInput): {
  properties: TelemetryProperties;
  dropped: readonly string[];
  blocked: boolean;
} {
  return sanitizeProperties(input.event, input.properties ?? null);
}
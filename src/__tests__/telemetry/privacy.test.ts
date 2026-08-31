import { describe, it, expect } from 'vitest';
import { sanitizeProperties, sanitizeEvent, isForbiddenKey } from '../../core/telemetry/privacy';
import { TELEMETRY_EVENT_SCHEMAS } from '../../core/telemetry/events';
import type { TelemetryEventInput, TelemetryProperties } from '../../core/telemetry/types';

/**
 * T4 — "no forbidden field reaches the persistence layer" gate.
 *
 * Governing rule (owner-approved): PII / free-text / sensitive keys (phone,
 * email, address, notes, message bodies, tokens, codes, query, …) must NEVER
 * reach persistence. The client drops them at the boundary in `privacy.ts`;
 * the server rejects them in 00057. This test asserts the CLIENT gate and the
 * wire shape carry a forbidden field is impossible.
 */

function buildWireProperties(input: TelemetryEventInput): TelemetryProperties {
  // Reimplements the exact client sanitization path: a blocked key is dropped
  // before the payload (row.properties) ever exists.
  const clean = sanitizeEvent(input);
  return clean.properties;
}

describe('telemetry — no forbidden field reaches the persistence layer', () => {
  it('a PII/free-text property is dropped and never present in the payload', () => {
    const payload = buildWireProperties({
      event: 'whatsapp_open',
      properties: { method: 'wa.me', message: 'مرحبا، أريد الاستعلام عن الهاتف', phone: '0550000000' },
    });
    expect(payload.method).toBe('wa.me');
    expect(Object.keys(payload)).not.toContain('message');
    expect(Object.keys(payload)).not.toContain('phone');
    expect(Object.keys(payload)).toHaveLength(1);
  });

  it('common PII/free-text/sensitive field names are all centrally forbidden', () => {
    const cases = [
      'phone', 'phone_number', 'mobile', 'email', 'email_address',
      'address', 'address1', 'city', 'notes', 'message', 'body', 'text',
      'content', 'free_text', 'comment', 'name', 'full_name', 'username',
      'source_label', 'location', 'token', 'auth_token', 'code', 'otp',
      'challenge_id', 'secret', 'password', 'query', 'search_query',
      'url', 'fingerprint', 'device_id', 'ip', 'ip_address',
      'description', 'title', 'serial', 'stack', 'imei', 'mac', 'fingerprint_raw',
    ];
    for (const key of cases) {
      expect(isForbiddenKey(key), `expected '${key}' to be forbidden`).toBe(true);
    }
    // everyday neutral keys are NOT forbidden
    for (const key of ['position', 'method', 'count', 'qty', 'side', 'turns', 'active', 'index']) {
      expect(isForbiddenKey(key), `expected '${key}' to be allowed`).toBe(false);
    }
  });

  it('no event allowlist key overlaps the forbidden list (also checked in event-validation)', () => {
    for (const schema of Object.values(TELEMETRY_EVENT_SCHEMAS)) {
      for (const prop of (schema as { properties: readonly string[] }).properties) {
        expect(isForbiddenKey(prop)).toBe(false);
      }
    }
  });

  it('blocked content is reported AND excluded from the sanitized payload', () => {
    const clean = sanitizeProperties('request_submit', {
      method: 'whatsapp',
      notes: 'سأشحن للجزائر العاصمة', // forbidden free-text
      phone: '0555',                  // forbidden PII
    });
    expect(clean.blocked).toBe(true);
    expect(clean.properties).toEqual({});
    expect(clean.dropped).toContain('notes');
    expect(clean.dropped).toContain('phone');
  });
});

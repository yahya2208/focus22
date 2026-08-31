import { describe, it, expect } from 'vitest';
import { sanitizeProperties, sanitizeEvent, isForbiddenKey } from '../../core/telemetry/privacy';
import { TELEMETRY_EVENT_SCHEMAS } from '../../core/telemetry/events';

/**
 * T4 — allowlist + forbidden-field validation (client side of the contract).
 * Mirrors the server-side logic in 00057. A blocked/PII field is NEVER allowed
 * to be a property; anything not in the event's closed allowlist is dropped.
 */
describe('telemetry property allowlist enforcement', () => {
  it('keeps only allowlisted keys for a given event', () => {
    const result = sanitizeProperties('product_view', {
      position: 3, // NOT in product_view allowlist
      variant: '128GB', // NOT in product_view allowlist
    });
    expect(result.properties).toEqual({});
    expect(result.dropped).toEqual(['position', 'variant']);
    expect(result.blocked).toBe(false);
  });

  it('keeps allowlisted keys and drops non-allowlisted ones for screen_view', () => {
    const result = sanitizeProperties('screen_view', {
      from: 'home',
      is_initial: true,
      position: 9, // not allowed
    });
    expect(result.properties).toEqual({ from: 'home', is_initial: true });
    expect(result.dropped).toEqual(['position']);
  });

  it('blocks forbidden PII keys even when they are allowlisted names (defense-in-depth)', () => {
    // 'position' is allowlisted for product_impression, but a mis-typed
    // 'phone' must always be blocked regardless of the event.
    const result = sanitizeProperties('product_impression', { phone: '0555' , position: 1 });
    expect(result.blocked).toBe(true);
    expect(result.properties).toEqual({ position: 1 });
    expect(result.dropped).toContain('phone');
  });

  it('rejects free-text / message / notes / token / code keys for ANY event', () => {
    for (const forbidden of ['message', 'notes', 'token', 'code', 'text', 'address', 'email', 'query', 'description', 'title', 'serial', 'stack', 'imei', 'mac', 'fingerprint_raw']) {
      expect(isForbiddenKey(forbidden)).toBe(true);
      const r = sanitizeProperties('app_open', { [forbidden]: 'x' });
      expect(r.blocked).toBe(true);
      expect(r.properties).toEqual({});
    }
  });

  it('normalizes casing and trims keys before allowlist lookup', () => {
    const result = sanitizeProperties('cart_add', { '  Qty  ': 2 });
    expect(result.properties).toEqual({ qty: 2 });
    expect(result.dropped).toEqual([]);
  });

  it('drops non-scalar values (nested objects / arrays) even if the key is allowlisted', () => {
    const result = sanitizeProperties('game_start', {
      game: 'ttt',
      size: 9,
      meta: { nested: true },
      list: [1, 2, 3],
    } as never);
    expect(result.properties).toEqual({ game: 'ttt', size: 9 });
  });

  it('sanitizeEvent is the single high-level entry used by the client', () => {
    const r = sanitizeEvent({ event: 'whatsapp_open', properties: { method: 'wa.me', message: 'hello' } });
    expect(r.blocked).toBe(true);
    expect(r.properties).toEqual({ method: 'wa.me' });
  });
});

describe('telemetry schema/allowlist internal consistency', () => {
  it('no event allowlist contains a forbidden key (dictionary is PII-safe by construction)', () => {
    for (const schema of Object.values(TELEMETRY_EVENT_SCHEMAS)) {
      const s = schema as { properties: readonly string[] };
      for (const prop of s.properties) {
        expect(isForbiddenKey(prop), `allowlisted key '${prop}' is forbidden`).toBe(false);
      }
    }
  });
});

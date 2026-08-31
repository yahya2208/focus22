import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FORBIDDEN_KEYS, allowedKey, isForbiddenKey, sanitizeProperties } from '../../core/telemetry/privacy';
import { TELEMETRY_EVENT_SCHEMAS } from '../../core/telemetry/events';
import type { TelemetryEventName, TelemetryProperties } from '../../core/telemetry/types';

/**
 * T4 — telemetry privacy regression gate.
 *
 * This is the explicit "no forbidden field reaches the persistence layer" gate
 * for the new FOCUS telemetry layer. It overlaps with, but is a distinct
 * companion to, the P3/P5 privacy gates — it focuses purely on the telemetry
 * contract, and asserts:
 *
 *   PG-TEL-01  entity_id is TEXT (uuid OR CatalogId slug) by design.
 *   PG-TEL-02  the client privacy gate rejects every representative forbidden
 *              touchpoint key found in this repo (phone/email/address/notes/
 *              message/token/code/challenge_id/source_label/query/...).
 *   PG-TEL-03  sanitized payloads never carry a forbidden key for ANY event.
 *   PG-TEL-04  the production telemetry sender never writes the table directly
 *              (.rpc() only, no .from('telemetry_events').insert()).
 *   PG-TEL-05  the server migration mirrors the client forbidden list (parity).
 */

const SRC = path.resolve(__dirname, '../..');
const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function readRoot(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('PG-TEL-01: entity_id is TEXT by design (uuid AND CatalogId slug)', () => {
  it('types.ts documents entityId/entity_id as text', () => {
    const types = read('core/telemetry/types.ts');
    expect(types).toContain('readonly entityId?: string');
  });

  it('the migration declares entity_id as TEXT', () => {
    const sql = readRoot('supabase/migrations/00057_telemetry_events.sql');
    expect(sql).toContain('entity_id      text,');
  });
});

describe('PG-TEL-02: every representative forbidden touchpoint key is centrally denied', () => {
  // Keys surfaced at real, identified touchpoints in this repo:
  //   request form (phone/address/notes), WhatsApp message bodies, source_label
  //   in inventory ("أحمد، وهران"), token in claim-verify, repair/sticker codes,
  //   challenge_id, route params (token/code/challenge_id/s).
  const TOUCHPOINT_KEYS = [
    'phone', 'phone_number', 'address', 'notes', 'message', 'body',
    'token', 'auth_token', 'code', 'challenge_id', 'passphrase', 'otp',
    'source_label', 'location', 'query', 'search_query', 'url', 's',
    'description', 'title', 'serial', 'stack', 'imei', 'mac', 'fingerprint_raw',
  ];
  it('all touchpoint keys are forbidden and dropped by the sanitizer for any event', () => {
    for (const key of TOUCHPOINT_KEYS) {
      expect(isForbiddenKey(key), `'${key}' must be forbidden`).toBe(true);
      const r = sanitizeProperties('screen_view', { [key]: 'x' });
      expect(r.blocked).toBe(true);
      expect(r.properties).toEqual({});
    }
  });

  it('forbidden keys stay blocked EVEN IF a future developer adds them to an allowlist', () => {
    // `allowedKey` consults the blacklist BEFORE the (positive) per-event
    // allowlist, so a forbidden key is rejected regardless of any future
    // allowlist registration. That is the guarantee the boundary relies on.
    for (const key of ['description', 'title', 'serial', 'stack', 'imei', 'mac', 'fingerprint_raw']) {
      expect(isForbiddenKey(key)).toBe(true);
      expect(allowedKey('screen_view', key), `'${key}' rejected before allowlist`).toBeNull();
    }
  });
});

describe('PG-TEL-03: no sanitized payload ever carries a forbidden key', () => {
  it('for every event, a payload built from allowed keys never contains a forbidden key', () => {
    for (const [name, schema] of Object.entries(TELEMETRY_EVENT_SCHEMAS)) {
      const props = (schema as { properties: readonly string[] }).properties;
      const payload: TelemetryProperties = {};
      for (const key of props) payload[key] = 'v';
      const clean = sanitizeProperties(name as TelemetryEventName, payload);
      for (const k of Object.keys(clean.properties)) {
        expect(isForbiddenKey(k)).toBe(false);
      }
    }
  });
});

describe('PG-TEL-04: production telemetry sender is RPC-only (no direct table write)', () => {
  it('core/telemetry/client.ts uses .rpc() and never .from(\'telemetry_events\').insert/u/', () => {
    const client = read('core/telemetry/client.ts');
    expect(client).toContain('.rpc(');
    expect(client).toContain('TELEMETRY_RPC_NAME'); // constant = 'record_telemetry_event'
    expect(client).not.toMatch(/\.from\(\s*['"]telemetry_events['"]\s*\)\s*\.\s*(insert|upsert|update|delete)\b/);
  });

  it('no file under core/telemetry writes the table directly', () => {
    const files = ['core/telemetry/index.ts', 'core/telemetry/types.ts', 'core/telemetry/events.ts', 'core/telemetry/privacy.ts', 'core/telemetry/client.ts'];
    for (const f of files) {
      const content = read(f);
      expect(content).not.toMatch(/\.from\(\s*['"]telemetry_events['"]\s*\)\s*\.\s*(insert|upsert|update|delete)\b/);
    }
  });
});

describe('PG-TEL-05: server migration mirrors the client forbidden list (parity)', () => {
  it('every client forbidden key appears in the server v_forbidden array', () => {
    const sql = readRoot('supabase/migrations/00057_telemetry_events.sql');
    const start = sql.indexOf('v_forbidden := ARRAY[');
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf('];', start);
    const block = sql.slice(start, end);
    for (const key of FORBIDDEN_KEYS) {
      expect(block, `server missing forbidden key '${key}'`).toContain(`'${key}'`);
    }
  });

  it('the server raises on a forbidden field (never silently stores it)', () => {
    const sql = readRoot('supabase/migrations/00057_telemetry_events.sql');
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN_FIELD'");
  });
});

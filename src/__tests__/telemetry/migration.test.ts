import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FORBIDDEN_KEYS } from '../../core/telemetry/privacy';
import { TELEMETRY_EVENT_SCHEMAS } from '../../core/telemetry/events';
import { TELEMETRY_ENTITY_TYPES } from '../../core/telemetry/types';
import type { TelemetryDomain } from '../../core/telemetry/types';

/**
 * T4 — offline structural verification of migration 00057 (no live DB).
 * Asserts the server-side contract EXISTS in the SQL and stays in lockstep with
 * the client contract (same RPC name, same table, same forbidden list, same
 * per-event allowlists).
 */

const MIGRATION = path.resolve(__dirname, '../../../supabase/migrations/00057_telemetry_events.sql');
const MIGRATION_061 = path.resolve(__dirname, '../../../supabase/migrations/00061_telemetry_phase8_events.sql');
const MIGRATION_067 = path.resolve(__dirname, '../../../supabase/migrations/00067_telemetry_pilot_events.sql');
const MIGRATION_076 = path.resolve(__dirname, '../../../supabase/migrations/00076_telemetry_contract_hardening.sql');
const MIGRATION_077 = path.resolve(__dirname, '../../../supabase/migrations/00077_telemetry_journey_identity.sql');
const VERIFY = path.resolve(__dirname, '../../../supabase/verify/telemetry_events.sql');

/**
 * The complete server contract. 00057 defines the closed write/read contract;
 * 00061 (Phase 8), 00067 (Pilot), 00076 (Wave A hardening) and 00077 (Wave B
 * journey identity) are ADDITIVE re-creates of record_telemetry_event with
 * extra event->domain / allowlist / validation branches. 00077 is the LATEST
 * and FINAL authority for the write RPC and COLUMN LAYOUT (journey_id), so it
 * is read FIRST: the parity matches below must see the current allowlists and
 * the journey-aware insert.
 */
function contractSql(): string {
  return [MIGRATION_077, MIGRATION_076, MIGRATION, MIGRATION_061, MIGRATION_067].map((f) => fs.readFileSync(f, 'utf-8')).join('\n');
}

function readSql(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf-8');
}

describe('00057 telemetry migration — server contract present & consistent', () => {
  it('migration file exists', () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
    expect(fs.existsSync(VERIFY)).toBe(true);
  });

  it('defines public.telemetry_events with the required columns', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.telemetry_events');
    for (const col of ['event_id', 'event_name', 'event_version', 'domain', 'occurred_at', 'session_id', 'anonymous_id', 'user_id', 'screen', 'entity_type', 'entity_id', 'properties', 'context', 'dedupe_key']) {
      expect(sql).toContain(col);
    }
  });

  it('enables RLS against all client (anon/authenticated) direct access', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.telemetry_events FROM anon');
    expect(sql).toContain('REVOKE ALL ON public.telemetry_events FROM authenticated');
  });

  it('writes ONLY through SECURITY DEFINER RPC record_telemetry_event(jsonb)', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_telemetry_event(p_events jsonb)');
    expect(sql.toLowerCase()).toContain('security definer');
    expect(sql).toContain('SET search_path');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated');
  });

  it('server forbidden-field list matches the client FORBIDDEN_KEYS exactly', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    // The server embeds the same lowercase key names in `v_forbidden := ARRAY[...]`.
    const start = sql.indexOf('v_forbidden := ARRAY[');
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf('];', start);
    const block = sql.slice(start, end);
    for (const key of FORBIDDEN_KEYS) {
      expect(block, `server missing forbidden key '${key}'`).toContain(`'${key}'`);
    }
  });

  it('server event dictionary covers every client event with the same allowlist', () => {
    const sql = contractSql();
    for (const ev of Object.keys(TELEMETRY_EVENT_SCHEMAS)) {
      expect(sql, `server missing event '${ev}'`).toContain(`WHEN '${ev}'`);
    }
  });

  it('server allowlist for each event matches the client allowlist', () => {
    const sql = contractSql();
    for (const [ev, schema] of Object.entries(TELEMETRY_EVENT_SCHEMAS)) {
      const props = (schema as { properties: readonly string[] }).properties;
      // find the CASE branch for this event
      const re = new RegExp(`WHEN '${ev}' THEN v_allowed := ARRAY\\[([^\\]]*)\\]`, 'i');
      const m = sql.match(re);
      expect(m, `no allowlist branch for '${ev}'`).toBeTruthy();
      const tokens = (m![1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/'/g, ''))
        .filter(Boolean)
        .sort();
      expect(tokens, `allowlist mismatch for '${ev}'`).toEqual([...props].sort());
    }
  });

  it('verify script references the table, RPC, RLS, indexes, and grants', () => {
    const v = readSql('supabase/verify/telemetry_events.sql');
    expect(v).toContain('telemetry_events');
    expect(v).toContain('record_telemetry_event');
    expect(v).toContain('relrowsecurity');
    expect(v).toContain('routine_privileges');
  });

  it('domain taxonomy used by the server is consistent with the client domains', () => {
    const sql = contractSql();
    const domainsMentioned = new Set<string>();
    for (const [, schema] of Object.entries(TELEMETRY_EVENT_SCHEMAS)) {
      domainsMentioned.add((schema as { domain: TelemetryDomain }).domain);
    }
    for (const d of domainsMentioned) {
      expect(sql).toContain(`'${d}'`);
    }
  });

  it('grants RPC EXECUTE to BOTH authenticated and anon (anonymous telemetry contract)', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    // anon must be able to send telemetry (visitor builds via Anonymous Auth).
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated, anon');
    expect(sql).toContain("TO authenticated, anon");
  });

  it('dedupe uniqueness is scoped to (session_id, dedupe_key), NOT global', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    const idxDef = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS uidx_telemetry_dedupe[\s\S]*?WHERE dedupe_key IS NOT NULL;/);
    expect(idxDef).toBeTruthy();
    expect(idxDef![0]).toContain('(session_id, dedupe_key)');
    // Must NOT be a global index on just dedupe_key.
    expect(sql).not.toMatch(/ON public\.telemetry_events \(dedupe_key\)/);
  });

  it('server validates anonymous_id as 32 lowercase hex when present', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8');
    expect(sql).toContain('INVALID_ANONYMOUS_ID');
    expect(sql).toContain("length(v_anon) <> 32");
    expect(sql).toContain("'^[0-9a-f]{32}$'");
  });
});

describe('00076 telemetry contract hardening (Wave A)', () => {
  it('migration file exists and re-creates the write RPC only (no analytics change)', () => {
    const sql = fs.readFileSync(MIGRATION_076, 'utf-8');
    expect(fs.existsSync(MIGRATION_076)).toBe(true);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_telemetry_event(p_events jsonb)');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.get_telemetry_analytics');
  });

  it('preserves SECURITY DEFINER + hardened search_path on the re-created RPC', () => {
    const sql = fs.readFileSync(MIGRATION_076, 'utf-8');
    const defBlock = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.record_telemetry_event'), sql.indexOf('$$') + 2);
    expect(defBlock.toLowerCase()).toContain('security definer');
    expect(defBlock).toContain("SET search_path = ''");
  });

  it('keeps EXECUTE grants to BOTH authenticated and anon (anonymous contract intact)', () => {
    const sql = fs.readFileSync(MIGRATION_076, 'utf-8');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated, anon');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_telemetry_event(jsonb) FROM PUBLIC');
  });

  it('enforces the closed entity_type union server-side (INVALID_ENTITY_TYPE)', () => {
    const sql = fs.readFileSync(MIGRATION_076, 'utf-8');
    expect(sql).toContain('RAISE EXCEPTION \'INVALID_ENTITY_TYPE\'');
    for (const t of TELEMETRY_ENTITY_TYPES) {
      expect(sql, `server entity_type union missing '${t}'`).toContain(`'${t}'`);
    }
  });

  it('server entity_type union is EXACTLY the client union (no extra, no missing)', () => {
    const sql = fs.readFileSync(MIGRATION_076, 'utf-8');
    const m = /v_etype IN \(\s*([\s\S]*?)\s*\)\)\s*THEN/.exec(sql);
    expect(m).toBeTruthy();
    const tokens = m![1]!
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''))
      .filter(Boolean)
      .sort();
    expect(tokens).toEqual([...TELEMETRY_ENTITY_TYPES].sort());
  });

  it('family_id is allowlisted ONLY for family_view / checkout_submit / order_created', () => {
    const expectFamilyOn = ['family_view', 'checkout_submit', 'order_created'];
    const expectFamilyOff = Object.keys(TELEMETRY_EVENT_SCHEMAS).filter((ev) => !expectFamilyOn.includes(ev));
    for (const ev of expectFamilyOn) {
      const schema = TELEMETRY_EVENT_SCHEMAS[ev as keyof typeof TELEMETRY_EVENT_SCHEMAS];
      expect((schema as { properties: readonly string[] }).properties).toContain('family_id');
    }
    for (const ev of expectFamilyOff) {
      const schema = TELEMETRY_EVENT_SCHEMAS[ev as keyof typeof TELEMETRY_EVENT_SCHEMAS];
      expect((schema as { properties: readonly string[] }).properties, `'${ev}' must NOT carry family_id`).not.toContain('family_id');
    }
  });

  it('verify script exists and covers the hardened contract', () => {
    const v = readSql('supabase/verify/telemetry_contract_hardening.sql');
    expect(v).toContain('record_telemetry_event');
    expect(v).toContain('INVALID_ENTITY_TYPE');
    expect(v).toContain('family_id');
    expect(v).toContain('uidx_telemetry_dedupe');
  });
});

describe('00077 telemetry journey identity (Wave B)', () => {
  it('migration file exists; adds nullable journey_id column; touch nothing else', () => {
    const sql = fs.readFileSync(MIGRATION_077, 'utf-8');
    expect(fs.existsSync(MIGRATION_077)).toBe(true);
    expect(sql).toContain('ALTER TABLE public.telemetry_events');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS journey_id text');
    expect(sql).toContain('journey_id');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.get_telemetry_analytics');
    expect(sql).not.toContain('CREATE INDEX');
    expect(sql).not.toContain('DROP POLICY');
  });

  it('declares journey_id is NOT indexed and NOT backfilled (contract statement)', () => {
    const sql = fs.readFileSync(MIGRATION_077, 'utf-8');
    expect(sql).toContain('NO backfill');
    expect(sql).toContain('NO new table, NO index');
  });

  it('re-created RPC keeps SECURITY DEFINER + search_path + anon/authenticated grants', () => {
    const sql = fs.readFileSync(MIGRATION_077, 'utf-8');
    const defBlock = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.record_telemetry_event'), sql.indexOf('$$') + 2);
    expect(defBlock.toLowerCase()).toContain('security definer');
    expect(defBlock).toContain("SET search_path = ''");
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated, anon');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_telemetry_event(jsonb) FROM PUBLIC');
  });

  it('validates journey_id format when present (INVALID_JOURNEY_ID) and allows NULL', () => {
    const sql = fs.readFileSync(MIGRATION_077, 'utf-8');
    expect(sql).toContain('INVALID_JOURNEY_ID');
    expect(sql).toContain('journey_id, properties, context, dedupe_key');
    expect(sql).toContain("v_journey := v_ev->>'journey_id'");
  });

  it('the final server insert includes journey_id AND the legacy NOT NULL columns', () => {
    const sql = fs.readFileSync(MIGRATION_077, 'utf-8');
    expect(sql).toContain('event_id, event_name, event_version, domain, occurred_at');
    expect(sql).toContain('session_id, anonymous_id, user_id, screen, entity_type, entity_id');
    expect(sql).toContain('journey_id, properties, context, dedupe_key');
  });

  it('97-event parity is preserved through 00077 (server dict + allowlists live in 00077)', () => {
    const sql = contractSql();
    for (const ev of Object.keys(TELEMETRY_EVENT_SCHEMAS)) {
      expect(sql, `server missing event '${ev}' after 00077`).toContain(`WHEN '${ev}'`);
    }
    // 00077 itself is a full re-create (has the WITH the whole allowlist CASE)
    const own = fs.readFileSync(MIGRATION_077, 'utf-8');
    for (const ev of Object.keys(TELEMETRY_EVENT_SCHEMAS)) {
      expect(own, `00077 dropped event '${ev}'`).toContain(`WHEN '${ev}'`);
    }
  });

  it('verify script exists and covers the journey contract', () => {
    const v = readSql('supabase/verify/telemetry_journey_identity.sql');
    expect(v).toContain('journey_id');
    expect(v).toContain('INVALID_JOURNEY_ID');
    expect(v).toContain('get_telemetry_analytics');
  });
});

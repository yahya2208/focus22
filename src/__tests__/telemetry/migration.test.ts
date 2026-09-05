import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FORBIDDEN_KEYS } from '../../core/telemetry/privacy';
import { TELEMETRY_EVENT_SCHEMAS } from '../../core/telemetry/events';
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
const VERIFY = path.resolve(__dirname, '../../../supabase/verify/telemetry_events.sql');

/**
 * The complete server contract. 00057 defines the closed write/read contract;
 * 00061 (Phase 8) and 00067 (Pilot) are ADDITIVE re-creates of
 * record_telemetry_event and get_telemetry_analytics with extra event->domain
 * / allowlist branches. The inventory checks below therefore read ALL THREE
 * migrations as one contract.
 */
function contractSql(): string {
  return [MIGRATION, MIGRATION_061, MIGRATION_067].map((f) => fs.readFileSync(f, 'utf-8')).join('\n');
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

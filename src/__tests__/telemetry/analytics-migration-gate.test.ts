import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * T4.2 Phase 1 — offline structural verification of migration 00058
 * (get_telemetry_analytics read RPC). No live DB: asserts the server-side
 * contract, security invariants, aggregate-only guarantees, and that it stays
 * purely additive (never touches 00057 / telemetry_events / RLS / writes).
 */

const MIGRATION = path.resolve(__dirname, '../../../supabase/migrations/00058_telemetry_analytics.sql');

const sql = fs.readFileSync(MIGRATION, 'utf-8');
const lower = sql.toLowerCase();

function numOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('00058 telemetry analytics read RPC — existence & numbering', () => {
  it('migration file exists', () => {
    expect(fs.existsSync(MIGRATION)).toBe(true);
  });

  it('defines public.get_telemetry_analytics with the required typed filters', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_telemetry_analytics(');
    expect(sql).toContain('p_date_from timestamptz DEFAULT NULL');
    expect(sql).toContain('p_date_to   timestamptz DEFAULT NULL');
    expect(sql).toContain('p_domain    text        DEFAULT NULL');
    expect(sql).toContain('p_event     text        DEFAULT NULL');
    expect(sql).toContain('p_game      text        DEFAULT NULL');
    expect(sql).toContain('p_entity_id text        DEFAULT NULL');
    expect(sql).toContain('RETURNS jsonb');
  });
});

describe('00058 — security contract', () => {
  it('is SECURITY DEFINER with hardened search_path', () => {
    expect(lower).toContain('security definer');
    expect(sql).toContain("SET search_path = ''");
  });

  it('authorizes INSIDE the function against public.users.role (admin/super_admin/researcher)', () => {
    expect(sql).toContain('FROM public.users u WHERE u.id = v_uid');
    expect(sql).toContain("v_role NOT IN ('admin', 'super_admin', 'researcher')");
    expect(sql).toContain("RETURN jsonb_build_object('error', 'UNAUTHORIZED')");
  });

  it('rejects anonymous callers (auth.uid() IS NULL)', () => {
    expect(sql).toContain('IF v_uid IS NULL THEN');
    expect(sql).toContain("RETURN jsonb_build_object('error', 'UNAUTHORIZED')");
  });

  it('never grants direct table access and never opens SELECT policies', () => {
    // No GRANT on telemetry_events (table stays RLS-denied).
    expect(sql).not.toMatch(/GRANT\s+(SELECT|ALL)\s+ON\s+public\.telemetry_events/i);
    expect(sql).not.toContain('CREATE POLICY');
    // The only grants in this migration are on the function itself.
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_telemetry_analytics(');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_telemetry_analytics(');
  });

  it('grants EXECUTE only to authenticated (never anon for analytics reads)', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_telemetry_analytics\([^)]*\) TO authenticated;/);
    expect(sql).not.toContain('TO authenticated, anon');
    expect(sql).not.toMatch(/TO anon/);
  });

  it('does not redefine or drop record_telemetry_event (00057 write path intact)', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.record_telemetry_event');
    expect(sql).not.toContain('DROP FUNCTION IF EXISTS public.record_telemetry_event');
    expect(sql).not.toContain('DROP FUNCTION public.record_telemetry_event');
    expect(sql).not.toContain('record_telemetry_event(');
  });

  it('does not modify 00057 structure, RLS, or writes (additive-only)', () => {
    for (const forbidden of [
      'DROP TABLE',
      'ALTER TABLE',
      'ENABLE ROW LEVEL SECURITY',
      'REVOKE ALL ON public.telemetry_events',
      'GRANT ALL ON public.telemetry_events',
      'INSERT INTO public.telemetry_events',
      'UPDATE public.telemetry_events',
      'DELETE FROM public.telemetry_events',
    ]) {
      expect(sql, `00058 must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('00058 — aggregate-only output (no raw rows / no PII / no identifiers)', () => {
  it('returns counts and top-N business ids, never raw telemetry rows', () => {
    // The RPC never selects raw columns into its output: only COUNT/GROUP BY/agg.
    expect(sql).toContain("'total_events'");
    expect(sql).toContain('COUNT(DISTINCT session_id)');
    expect(sql).toContain('COUNT(DISTINCT anonymous_id)');
    expect(sql).toContain('COUNT(DISTINCT user_id)');
    expect(sql).toContain('LIMIT 50');
  });

  it('does NOT return user_id, anonymous_id, session_id, or raw properties in any output key', () => {
    // The JSONB output keys are aggregates only — none of the raw identifiers.
    for (const identifier of ['user_id', 'anonymous_id', 'session_id']) {
      expect(sql).not.toMatch(new RegExp(`'${identifier}'\\s*,?\\s*`));
    }
    // No raw 'properties' object is ever echoed into the response.
    expect(sql).not.toContain("'properties', te.properties");
    expect(sql).not.toContain("properties'");
  });
});

describe('00058 — closed filters (no arbitrary SQL / dynamic columns / properties)', () => {
  it('validates domain against the closed taxonomy and event against the closed registry', () => {
    expect(sql).toContain('INVALID_FILTER');
    expect(sql).toContain("v_domain IS NULL OR v_domain IN (");
    expect(sql).toContain("'app','navigation','category','product','listing','cart','request','ad','game','ttt','system'");
    expect(sql).toContain('INVALID_DATE_RANGE');
  });

  it('uses only bound static filters — no dynamic SQL, no arbitrary property column names', () => {
    expect(lower).not.toContain('execute format');
    expect(lower).not.toContain('xmlagg');
    expect(lower).not.toContain('quote_ident');
  });
});

describe('00058 — reusable count helpers are not misused', () => {
  it('does not merely return a scalar COUNT to the client without aggregation guarantees', () => {
    // The function returns a structured JSONB document, not a raw row set.
    expect(sql).toContain("RETURN jsonb_build_object(");
    expect(sql).toContain("'error', null");
  });
});

describe('00058 — grants count sanity', () => {
  it('has exactly one REVOKE + one GRANT on the function (house model)', () => {
    expect(numOccurrences(sql, 'REVOKE ALL ON FUNCTION public.get_telemetry_analytics')).toBe(1);
    expect(numOccurrences(sql, 'GRANT EXECUTE ON FUNCTION public.get_telemetry_analytics')).toBe(1);
  });
});

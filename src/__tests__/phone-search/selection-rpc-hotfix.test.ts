import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REGRESSION (production incident 2026-08-22):
 * phone_search_selections stayed at ZERO rows forever even though the entire
 * frontend path was healthy. Runtime probe proved the RPC itself crashed on
 * EVERY call with `42883: operator does not exist: uuid = text` because
 * record_search_selection compared inventory_items.id (uuid) against
 * p_device_id (text). Mock-based tests cannot catch DB type errors — these
 * pins guard the SQL fix; the authoritative proof remains the production
 * re-test (verify-selection.mjs + SQL Editor row check).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('hotfix 00032 — selection RPC must not crash on uuid=text', () => {
  const migration = read('supabase/migrations/00032_fix_record_search_selection_uuid.sql');

  it('device existence check compares on the TEXT side', () => {
    expect(migration).toContain('inventory_items WHERE id::text = p_device_id');
  });

  it('the crashing uuid=text comparison no longer exists in the function body', () => {
    expect(migration).not.toMatch(/FROM\s+inventory_items\s+WHERE\s+id\s*=\s*p_device_id/);
  });

  it('signature, SECURITY DEFINER and grants are preserved', () => {
    expect(migration).toContain('record_search_selection(\n  p_search_event_id bigint');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_search_selection\(bigint, text, text\) TO anon;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_search_selection\(bigint, text, text\) TO authenticated;/);
  });

  it('no other migration defines a record_search_selection that still compares uuid to bare text', () => {
    const older = read('supabase/migrations/00030_phone_search_events.sql');
    // 00032 supersedes 00030's body; the old definition may remain there but
    // must be re-created by 00032 afterwards.
    expect(older).toContain('CREATE OR REPLACE FUNCTION public.record_search_selection');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.record_search_selection');
  });

  it('service surfaces swallowed RPC failures in DEV instead of hiding them', () => {
    const svc = read('src/services/phone-search-service.ts');
    const warns = svc.match(/console\.warn/g)?.length ?? 0;
    expect(warns).toBeGreaterThanOrEqual(2);
    expect(svc).toContain('[phone-search] recordSearchSelection failed:');
  });

  it('get_phone_intelligence: all device_id joins cast inventory uuid to text (11 sites)', () => {
    const casts = migration.match(/\.device_id[ \t]*=[ \t]*ii\.id::text/g)?.length ?? 0;
    expect(casts).toBe(11);
    // No raw text=uuid JOIN may remain in actual SQL (aliases are word-chars;
    // the header comment's '<agg>' placeholder must not match).
    const raw = migration.match(/ON\s+\w+\.device_id[ \t]*=[ \t]*ii\.id(?!::text)/g)?.length ?? 0;
    expect(raw).toBe(0);
    // Signature + staff-only grants preserved.
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_phone_intelligence(');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_phone_intelligence(text, text) TO authenticated;');
  });
});

describe('hotfix 00033 — explicit TEXT↔TEXT joins + executable installation gate', () => {
  const sql = read('supabase/migrations/00033_fix_phone_intelligence_joins_v2.sql')
    .slice(read('supabase/migrations/00033_fix_phone_intelligence_joins_v2.sql').indexOf('CREATE OR REPLACE FUNCTION'));

  it('rebuilds get_phone_intelligence with both-side casts at exactly 11 join sites', () => {
    const casts = sql.match(/\.device_id::text[ \t]*=[ \t]*ii\.id::text/g)?.length ?? 0;
    expect(casts).toBe(11);
  });

  it('no uncast device-id correlation remains in the SQL', () => {
    const raw = sql.match(/\.device_id(?:::text)?[ \t]*=[ \t]*ii\.id(?!::text)/g)?.length ?? 0;
    expect(raw).toBe(0);
  });

  it('signature, authorization, scoring and grants untouched vs 00031 source', () => {
    expect(sql).toContain("p_time_range text DEFAULT 'all'");
    expect(sql).toContain("WHERE u.id = auth.uid()");
    expect(sql).toContain("'search_to_selection_rate', CASE");
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_phone_intelligence(text, text) TO authenticated;');
  });

  it('ships an executable gate that proves the INSTALLED body (pg_proc) and runs the staff path', () => {
    const gate = read('supabase/verify/get_phone_intelligence_post_00033.sql');
    expect(gate).toContain('pg_proc');
    expect(gate).toContain("request.jwt.claims");
    expect(gate).toContain("get_phone_intelligence('all', NULL)");
    for (const key of ['search_analytics', 'search_to_phone', 'search_without_selection', 'demand_overview']) {
      expect(gate).toContain(key);
    }
  });
});

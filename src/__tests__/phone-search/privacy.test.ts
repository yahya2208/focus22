import { describe, it, expect } from 'vitest';
import migrationSql from '../../../supabase/migrations/00030_phone_search_events.sql?raw';

describe('phone_search_events privacy', () => {
  it('RLS is enabled on both tables', () => {
    expect(migrationSql).toContain('ALTER TABLE public.phone_search_events ENABLE ROW LEVEL SECURITY');
    expect(migrationSql).toContain('ALTER TABLE public.phone_search_selections ENABLE ROW LEVEL SECURITY');
  });

  it('staff read policy on search_events gates on user role', () => {
    expect(migrationSql).toContain('"Staff read search events"');
    expect(migrationSql).toContain("'admin'");
    expect(migrationSql).toContain("'super_admin'");
    expect(migrationSql).toContain("'researcher'");
  });

  it('staff read policy on search_selections gates on user role', () => {
    expect(migrationSql).toContain('"Staff read search selections"');
    expect(migrationSql).toContain("'admin'");
  });

  it('RPCs are SECURITY DEFINER (only RPCs can write)', () => {
    expect(migrationSql).toContain('SECURITY DEFINER');
  });

  it('no public INSERT/UPDATE/DELETE grants on search tables', () => {
    const lines = migrationSql.split('\n').filter(l => !l.trim().startsWith('--'));
    const nonComment = lines.join('\n');
    expect(nonComment).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+public\.phone_search/);
  });

  it('RPCs grant EXECUTE to anon and authenticated', () => {
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.record_phone_search');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.record_search_selection');
  });
});

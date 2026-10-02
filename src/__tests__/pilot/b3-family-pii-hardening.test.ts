/**
 * B3 — family PII hardening contract (00120_b3_family_pii_hardening.sql).
 *
 * Static guarantees on the migration text, in the same style as the
 * order-authority suite: the new RPC must be least-privilege by
 * construction, and the public read path on family_groups must be gone.
 * These tests pin the migration — they do not touch any database.
 */
import { describe, expect, it } from 'vitest';
import migration120 from '../../../supabase/migrations/00120_b3_family_pii_hardening.sql?raw';

function functionBody(): string {
  const start = migration120.indexOf('CREATE OR REPLACE FUNCTION public.pilot_store_order_families');
  const end = migration120.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration120.slice(start, end);
}

describe('B3 — pilot_store_order_families is least-privilege by construction', () => {
  it('is SECURITY DEFINER with a pinned empty search_path', () => {
    const body = functionBody();
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toMatch(/SET\s+search_path\s*=\s*''/);
  });

  it('rejects unauthenticated callers and authorizes operator-of-store or admin', () => {
    const body = functionBody();
    expect(body).toContain('UNAUTHENTICATED');
    expect(body).toContain('PERMISSION_DENIED');
    expect(body).toContain('public.fn_admin_uid() IS NOT NULL');
    expect(body).toContain('s.operator_user_id = v_uid');
  });

  it('derives families from the store orders — never from caller-supplied ids', () => {
    const body = functionBody();
    expect(body).toContain('FROM public.orders o');
    expect(body).toContain('o.store_id = p_store_id');
    expect(body).not.toMatch(/p_family_id/);
  });

  it('returns exactly (family_id, name, name_ar) — PII is structurally unreturnable', () => {
    const body = functionBody();
    expect(body).toMatch(/RETURNS TABLE\s*\(\s*family_id\s+uuid,\s*name\s+text,\s*name_ar\s+text\s*\)/);
    for (const col of [
      'contact_name',
      'contact_phone',
      'contact_address',
      'contact_notes',
      'preferred_delivery_time',
      'veg_notes',
    ]) {
      expect(body).not.toContain(col);
    }
    expect(body).not.toMatch(/SELECT\s+fg\.\*\s|SELECT\s+o\.\*/);
  });

  it('is executable by authenticated only — never anon', () => {
    expect(migration120).toContain(
      'GRANT EXECUTE ON FUNCTION public.pilot_store_order_families(uuid) TO authenticated',
    );
    expect(migration120).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pilot_store_order_families[^;]*TO\s+anon/,
    );
  });
});

describe('B3 — public read path on family_groups is removed', () => {
  it('drops the public active-family policy', () => {
    expect(migration120).toContain(
      'DROP POLICY IF EXISTS "Public read active family groups" ON public.family_groups',
    );
    expect(migration120).not.toMatch(/CREATE POLICY "Public read active family groups"/);
  });

  it('narrows the admin policy to authenticated (anon removed)', () => {
    expect(migration120).toContain(
      'DROP POLICY IF EXISTS "Admin read all family groups" ON public.family_groups',
    );
    const recreated = migration120.slice(
      migration120.indexOf('CREATE POLICY "Admin read all family groups"'),
    );
    expect(recreated).toMatch(/FOR SELECT TO authenticated\s/);
    expect(recreated).not.toContain('TO anon');
  });

  it('self-checks that no public SELECT path on family_groups remains', () => {
    expect(migration120).toContain('pg_policies');
    expect(migration120).toContain('00120: public SELECT path on family_groups still present');
  });

  it('issues no operative statement against anything outside the B3 scope', () => {
    // Mentions in comments do not count — only DDL / grants / policies.
    expect(migration120).not.toMatch(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.(pilot_my_family|pilot_neighborhood_families|pilot_admin_list_families)\b/,
    );
    expect(migration120).not.toMatch(
      /(GRANT|REVOKE|DROP POLICY|CREATE POLICY|ALTER TABLE)[^;]*(family_members|ledger|neighborhood_families)/,
    );
  });
});

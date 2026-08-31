import { describe, expect, it } from 'vitest';
import m56 from '../../../supabase/migrations/00056_create_listing_for_category.sql?raw';

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

// ── 00056 — create_listing_for_category orchestration RPC ───────────────────

describe('Migration 00056 — create_listing_for_category (atomic create + membership)', () => {
  it('is a NEW additive function (no DROP/ALTER of existing objects)', () => {
    const executable = stripComments(m56);
    for (const forbidden of [
      'DROP TABLE',
      'DROP COLUMN',
      'DROP POLICY',
      'DROP FUNCTION',
      'DROP VIEW',
      'DELETE FROM',
      'TRUNCATE',
      'ALTER TABLE',
      'ALTER FUNCTION',
      'CREATE OR REPLACE FUNCTION public.category_products_admin_assign',
      'CREATE OR REPLACE FUNCTION public.listing_create',
      'CREATE OR REPLACE FUNCTION public.create_listing_for_category',
    ]) {
      // The only CREATE OR REPLACE FUNCTION allowed is the NEW orchestrator.
      if (forbidden === 'CREATE OR REPLACE FUNCTION public.create_listing_for_category') {
        expect(m56).toContain(forbidden);
      } else {
        expect(executable, forbidden).not.toContain(forbidden);
      }
    }
  });

  it('declares SECURITY DEFINER + VOLATILE + SET search_path = public', () => {
    expect(m56).toContain('SECURITY DEFINER');
    expect(m56).toContain('VOLATILE');
    expect(m56).toContain('SET search_path = public');
  });

  it('carries the intended signature and returns uuid', () => {
    expect(m56).toContain('CREATE OR REPLACE FUNCTION public.create_listing_for_category(');
    expect(m56).toContain('p_category_id  uuid,');
    expect(m56).toContain('p_category     text,');
    expect(m56).toContain('RETURNS uuid');
  });

  it('enforces admin authorization server-side using BOTH category and inventory gates', () => {
    expect(m56).toContain('public.categories_is_admin() AND public.inventory_is_admin()');
    expect(m56).toContain('ADMIN_REQUIRED');
  });

  it('rejects phone (legacy flow preserved) with a clear error', () => {
    expect(m56).toContain('phones must use the legacy inventory_add_item flow');
  });

  it('validates the category exists, is active, and its domain matches, with distinct errors', () => {
    expect(m56).toContain('CATEGORY_NOT_FOUND');
    expect(m56).toContain('CATEGORY_INACTIVE');
    expect(m56).toContain('CATEGORY_DOMAIN_MISMATCH');
    expect(m56).toContain('v_domain IS DISTINCT FROM p_category');
  });

  it('reuses the existing listing_create (does NOT duplicate its logic)', () => {
    expect(m56).toContain('public.listing_create(');
    expect(m56).not.toContain('INSERT INTO public.inventory_items');
    expect(m56).not.toContain('INSERT INTO public.produce_details');
    expect(m56).not.toContain('INSERT INTO public.car_details');
    expect(m56).not.toContain('INSERT INTO public.property_details');
  });

  it('inserts category_products membership in the same transaction ON CONFLICT DO NOTHING', () => {
    expect(m56).toContain('INSERT INTO public.category_products (category_id, product_id, sort_order)');
    expect(m56).toContain('ON CONFLICT (category_id, product_id) DO NOTHING');
  });

  it('grants EXECUTE to authenticated ONLY (never anon/PUBLIC)', () => {
    expect(m56).toMatch(/REVOKE ALL ON FUNCTION public\.create_listing_for_category/);
    expect(m56).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_listing_for_category[\s\S]*TO authenticated/);
    const revokeAnon = /REVOKE ALL ON FUNCTION public\.create_listing_for_category[\s\S]*FROM PUBLIC;/.test(m56);
    expect(revokeAnon).toBe(true);
  });
});

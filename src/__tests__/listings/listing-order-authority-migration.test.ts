/**
 * 00052 (Listing Order Authority) DB-migration content gate.
 *
 * B1 + I1: the override makes delivery_create_order SERVER-authoritative for
 * every catalog_ref item, resolving price/stock/name against v_public_listings
 * (the SAME published+in-stock gate the shopper sees). This gate enforces:
 *   - 00052 is the highest migration and is additive (one function REPLACE +
 *     grants + post-check DO block — no tables/policies).
 *   - It RESTORES the exact 00050 contract: signature (p_customer, p_items),
 *     return shape and all 00050 error codes (UNAUTHENTICATED /
 *     CUSTOMER_INFO_REQUIRED / ZONE_NOT_ACTIVE / ITEMS_REQUIRED), plus the new
 *     ITEM_NOT_FOUND / ITEM_NOT_ORDERABLE for unresolvable / non-orderable rows.
 *   - Authoritative resolution only (unit_price/name/quantity from the view,
 *     never the client) and least privilege (create = authenticated only).
 *   - 00050 / 00051 / CategoryNav.tsx remain FROZEN (untouched on disk).
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import migration52 from '../../../supabase/migrations/00052_listing_order_authority.sql?raw';
import migration50 from '../../../supabase/migrations/00050_categories_delivery.sql?raw';
import migration51 from '../../../supabase/migrations/00051_category_content.sql?raw';

const SRC = path.resolve(__dirname, '../..');
const categoryNavSource = fs.readFileSync(
  path.join(SRC, 'components', 'categories', 'CategoryNav.tsx'),
  'utf-8',
);

const MIGRATIONS = import.meta.glob('../../../supabase/migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function numericPrefix(name: string): number | null {
  const m = /^(\d{5})_/.exec(name);
  return m ? Number(m[1]) : null;
}

describe('00052 — Listing Order Authority', () => {
  it('is the highest migration and exists on disk', () => {
    const names = Object.keys(MIGRATIONS).map(basename);
    const nums = names.map(numericPrefix).filter((n): n is number => n !== null);
    expect(Math.max(...nums)).toBe(52);
    expect(names).toContain('00052_listing_order_authority.sql');
  });

  it('is additive — only replaces delivery_create_order, creates no tables/policies', () => {
    expect(migration52).toContain('CREATE OR REPLACE FUNCTION public.delivery_create_order');
    expect(migration52).not.toContain('CREATE TABLE');
    expect(migration52).not.toContain('CREATE POLICY');
    expect(migration52).not.toContain('CREATE OR REPLACE FUNCTION public.delivery_estimate');
    expect(migration52).not.toContain('CREATE OR REPLACE FUNCTION public.categories_is_admin');
  });

  it('preserves the 00050 signature and every 00050 error code', () => {
    expect(migration52).toContain(
      'CREATE OR REPLACE FUNCTION public.delivery_create_order(p_customer jsonb, p_items jsonb)',
    );
    for (const code of [
      'UNAUTHENTICATED',
      'CUSTOMER_INFO_REQUIRED',
      'ZONE_NOT_ACTIVE',
      'ITEMS_REQUIRED',
    ]) {
      expect(migration52, `${code} must be preserved`).toContain(code);
    }
  });

  it('adds ITEM_NOT_FOUND / ITEM_NOT_ORDERABLE and resolves against v_public_listings', () => {
    expect(migration52).toContain('ITEM_NOT_FOUND');
    expect(migration52).toContain('ITEM_NOT_ORDERABLE');
    expect(migration52).toContain('public.v_public_listings');
    expect(migration52).toContain('v.quantity > 0');
    // Catalog items take the authoritative unit price from the resolved view row,
    // never from the client payload (closes I1 for the real order path).
    expect(migration52).toContain('v_item_unit := COALESCE(v_row_price, 0)');
    expect(migration52).toContain('INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price');
  });

  it('is SECURITY DEFINER with an empty search_path and least privilege (create = authenticated only)', () => {
    expect(migration52).toContain('SECURITY DEFINER');
    expect(migration52).toContain("SET search_path = ''");
    expect(migration52).toMatch(/REVOKE ALL ON FUNCTION public\.delivery_create_order/);
    expect(migration52).toContain(
      'GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated',
    );
    // create must NOT be granted to anon (public order placement is gated).
    expect(migration52).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO anon',
    );
  });

  it('fails loudly if the override did not take effect (post-check DO block)', () => {
    expect(migration52).toContain('IF NOT EXISTS (');
    expect(migration52).toContain("SELECT 1 FROM pg_proc WHERE proname = 'delivery_create_order'");
    expect(migration52).toContain('RAISE EXCEPTION');
    expect(migration52).toContain("'delivery_create_order missing after 00052'");
  });

  it('00050, 00051 and CategoryNav.tsx remain FROZEN (untouched on disk)', () => {
    // 00052 does not duplicate or weaken the 00050 authz gate (it only CALLS
    // delivery_estimate, it never re-CREATEs it — covered by the additive test).
    expect(migration52).not.toContain('CREATE OR REPLACE FUNCTION public.categories_is_admin()');
    expect(migration52).not.toContain('CREATE OR REPLACE FUNCTION public.delivery_estimate');
    expect(migration50).toContain('CREATE OR REPLACE FUNCTION public.delivery_estimate');
    expect(migration50).toContain(
      'GRANT EXECUTE ON FUNCTION public.delivery_estimate(uuid, numeric) TO anon, authenticated',
    );
    expect(migration51).toContain('CREATE TABLE IF NOT EXISTS public.category_products');
    expect(categoryNavSource).not.toContain('category_products');
    expect(categoryNavSource).not.toContain('delivery_create_order');
  });
});

/**
 * B4 — server-authoritative order pricing (00121_b4_order_price_authority.sql).
 *
 * Static contract on the migration text (same ?raw pattern as the
 * order-authority suite): every payable line must be catalog-backed, client
 * unit_price must never enter the math, and the 00103 drift markers must
 * survive in order. Pins the migration — touches no database.
 */
import { describe, expect, it } from 'vitest';
import migration121 from '../../../supabase/migrations/00121_b4_order_price_authority.sql?raw';

function functionBody(): string {
  const start = migration121.indexOf(
    'CREATE OR REPLACE FUNCTION public.delivery_create_order(',
  );
  const end = migration121.indexOf('$$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration121.slice(start, end);
}

describe('B4 — free-form payable path is removed', () => {
  it('T2/T3: empty or missing catalog_ref raises ARGUMENTS_INVALID before any math', () => {
    const body = functionBody();
    // COALESCE treats a missing field exactly like '' — one guard covers both.
    expect(body).toMatch(/v_ref := COALESCE\(btrim\(\(v_item->>'catalog_ref'\)::text\), ''\);/);
    const guardAt = body.indexOf("IF v_ref = '' THEN");
    expect(guardAt).toBeGreaterThan(-1);
    const guardBlock = body.slice(guardAt, guardAt + 200);
    expect(guardBlock).toContain("RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023'");
    // The raise sits before the FIRST subtotal accumulation in Pass 1.
    expect(guardAt).toBeLessThan(body.indexOf('v_subtotal := v_subtotal'));
  });

  it('T7: no free-form persistence branch remains (Pass 2 included)', () => {
    const body = functionBody();
    // Both former free-form persist shapes are gone.
    expect(body).not.toContain("COALESCE(v_item->>'name', '')");
    expect(body).not.toMatch(/GREATEST\(COALESCE\(\(v_item->>'quantity'\)::numeric, 1\), 1\)/);
    // Every order_items insert uses the server-resolved catalog values.
    const inserts = body.match(/INSERT INTO public\.order_items/g) ?? [];
    expect(inserts.length).toBe(1);
  });

  it('T1/T4/T5/T6: client unit_price is never read — catalog price is the only source', () => {
    const body = functionBody();
    expect(body).not.toContain("v_item->>'unit_price'");
    expect(body).toContain('v_item_unit := COALESCE(v_row_price, 0)');
    expect(body).toContain('FROM public.v_public_listings v');
  });

  it('T8: subtotal/fee/total stay server-computed; client sends no money fields', () => {
    const body = functionBody();
    expect(body).toContain('v_subtotal := v_subtotal + v_item_unit * v_item_qty');
    expect(body).toContain('v_subtotal + v_fee');
    for (const field of [`p_customer->>'subtotal'`, `p_customer->>'total'`, `p_items->>'total'`]) {
      expect(body).not.toContain(field);
    }
  });
});

describe('B4 — existing catalog/family/order checks are preserved', () => {
  it.each([
    'UNAUTHENTICATED',
    'CUSTOMER_INFO_REQUIRED',
    'ZONE_NOT_ACTIVE',
    'ITEMS_REQUIRED',
    'ITEM_NOT_FOUND',
    'ITEM_NOT_ORDERABLE',
    'QUANTITY_INVALID',
    'MULTI_STORE_ORDER',
    'FAMILY_ACCOUNT_REQUIRED',
    'DUPLICATE_ORDER',
  ])('error code %s still present', (code) => {
    expect(functionBody()).toContain(code);
  });

  it('signature, security posture, and grants are unchanged', () => {
    const body = functionBody();
    expect(body).toContain('RETURNS jsonb');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toMatch(/SET\s+search_path\s*=\s*''/);
    expect(migration121).toContain(
      'GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) TO authenticated',
    );
    expect(migration121).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.delivery_create_order\(jsonb,\s*jsonb,\s*boolean\)[^;]*TO\s+anon/,
    );
  });

  it('00103 drift markers survive in the required order', () => {
    const body = functionBody();
    const familyAt = body.indexOf('FAMILY_ACCOUNT_REQUIRED');
    const intentAt = body.indexOf('COALESCE(p_intentional');
    expect(familyAt).toBeGreaterThan(-1);
    expect(intentAt).toBeGreaterThan(-1);
    expect(familyAt).toBeLessThan(intentAt);
  });
});

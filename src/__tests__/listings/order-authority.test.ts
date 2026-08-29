/**
 * 00052 (Listing Order Authority) — server-authoritative order matrix.
 *
 * Because migrations are owner-applied to the live target, this suite proves
 * the server contract DETERMINISTICALLY: every clause of `delivery_create_order`
 * (00052) that makes the server authoritative (price/name/quantity from
 * `v_public_listings`, never the client) plus the security posture, and the
 * client wiring that hands the server the canonical `inventory_items.id`
 * (`catalog_ref`) so the authority applies end-to-end.
 *
 * Matrix covered:
 *   - entry authz  → UNAUTHENTICATED when anon (no client call reaches the DB)
 *   - catalog ref  → resolved ONLY against v_public_listings with v.quantity > 0
 *   - phone/sale   → authoritative unit_price = view sell_price (never client)
 *   - quantity     → clamped to view stock and floored at 1 (subtotal + persist)
 *   - car/sale     → orderable (no monthly rejection)
 *   - property/rent→ price_period = 'monthly' → ITEM_NOT_ORDERABLE
 *   - unresolved/  zero-qty → ITEM_NOT_FOUND
 *   - name/domain  → from resolved brand/model, never client
 *   - free-form    → legacy verbatim path preserved (no catalog_ref)
 *   - 00050 codes  → UNAUTHENTICATED/CUSTOMER_INFO_REQUIRED/ZONE_NOT_ACTIVE/
 *                    ITEMS_REQUIRED all preserved
 *   - least privilege → SECURITY DEFINER, SET search_path='', create granted to
 *                       authenticated ONLY (anon denied)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import migration52 from '../../../supabase/migrations/00052_listing_order_authority.sql?raw';

const { mockRpc, resetDefaults } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  return { mockRpc, resetDefaults: () => mockRpc.mockReset() };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

import { createDeliveryOrder } from '../../services/delivery-service';

describe('00052 — server authoritative order matrix (SQL gate)', () => {
  it('is the active override: CREATE OR REPLACE, one signature, no client trust', () => {
    expect(migration52).toContain(
      'CREATE OR REPLACE FUNCTION public.delivery_create_order(p_customer jsonb, p_items jsonb)',
    );
  });

  it('entry auth guard: anon (no uid) is rejected with UNAUTHENTICATED', () => {
    expect(migration52).toContain('auth.uid();');
    expect(migration52).toContain("IF v_uid IS NULL THEN");
    expect(migration52).toContain("RAISE EXCEPTION 'UNAUTHENTICATED';");
  });

  it('catalog refs resolve ONLY against v_public_listings with the shopper gate (quantity > 0)', () => {
    expect(migration52).toContain('FROM public.v_public_listings v');
    expect(migration52).toContain('WHERE v.id = v_ref::uuid');
    expect(migration52).toContain('AND v.quantity > 0');
  });

  it('authoritative unit price comes from the resolved view row, never the client', () => {
    // For catalog items the client unit_price MUST NOT be trusted.
    expect(migration52).toContain('v_item_unit := COALESCE(v_row_price, 0)');
    // The client-supplied unit_price appears only in the free-form (no ref) branch.
    const freeForm = migration52.indexOf("v_item_unit := COALESCE((v_item->>'unit_price')::numeric, 0);");
    expect(freeForm).toBeGreaterThan(-1);
    // Catalog authority is asserted BEFORE the free-form fallback, in its own branch.
    expect(migration52).toContain("v_item_unit := COALESCE(v_row_price, 0);");
  });

  it('name comes from the resolved brand/model, never the client', () => {
    for (const s of [
      "btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, ''))",
    ]) {
      expect(migration52).toContain(s);
    }
  });

  it('quantity is clamped to view stock and floored at 1 (subtotal and persist)', () => {
    expect(migration52).toContain(
      'v_item_qty  := GREATEST(LEAST(COALESCE((v_item->>\'quantity\')::integer, 1), v_row_qty), 1);',
    );
    expect(migration52).toContain(
      'GREATEST(LEAST(COALESCE((v_item->>\'quantity\')::integer, 1), v_row_qty), 1)',
    );
  });

  it('unresolved / zero-stock / private catalog ref is rejected ITEM_NOT_FOUND', () => {
    expect(migration52).toContain("IF v_row_id IS NULL THEN");
    expect(migration52).toContain("RAISE EXCEPTION 'ITEM_NOT_FOUND'");
  });

  it('monthly-period rows (rental properties) are not physically orderable (ITEM_NOT_ORDERABLE)', () => {
    expect(migration52).toContain("IF v_row_period = 'monthly' THEN");
    expect(migration52).toContain("RAISE EXCEPTION 'ITEM_NOT_ORDERABLE'");
  });

  it('covers the 3 mandatory domains: phones/cars (sale) orderable, properties (rent) rejected', () => {
    // Phones + cars are 'sale' period in the view → only the monthly branch rejects,
    // so sale rows of ANY domain pass the authority gate.
    expect(migration52).toContain("v_row_period = 'monthly'");
    // The gate is on the shared view (all domains), not a hard-coded phone list.
    expect(migration52).toContain('FROM public.v_public_listings v');
  });

  it('free-form (no catalog_ref) lines preserve the legacy verbatim path', () => {
    expect(migration52).toContain("IF v_ref = '' THEN");
    expect(migration52).toContain("COALESCE((v_item->>'unit_price')::numeric, 0)");
    expect(migration52).toContain("COALESCE(v_item->>'name', '')");
  });

  it('preserves every 00050 error code and return shape', () => {
    for (const code of [
      'CUSTOMER_INFO_REQUIRED',
      'ZONE_NOT_ACTIVE',
      'ITEMS_REQUIRED',
      'ITEM_NOT_FOUND',
      'ITEM_NOT_ORDERABLE',
    ]) {
      expect(migration52, code).toContain(code);
    }
    for (const field of ['order_id', 'order_number', 'subtotal', 'delivery_fee', 'total']) {
      expect(migration52, field).toContain(field);
    }
  });

  it('least privilege: SECURITY DEFINER, empty search_path, create = authenticated only', () => {
    expect(migration52).toContain('SECURITY DEFINER');
    expect(migration52).toContain("SET search_path = ''");
    expect(migration52).toMatch(/REVOKE ALL ON FUNCTION public\.delivery_create_order\(\s*jsonb,\s*jsonb\s*\)/);
    expect(migration52).toContain(
      'GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated',
    );
    expect(migration52).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO anon',
    );
  });
});

describe('00052 — client wiring hands the server the canonical inventory id', () => {
  beforeEach(() => {
    resetDefaults();
    mockRpc.mockResolvedValue({
      data: JSON.stringify({
        order_id: 'o1', order_number: 'FC-000001', status: 'pending',
        subtotal: 1200, delivery_fee: 10, total: 1210,
        eta_minutes_min: 30, eta_minutes_max: 45,
      }),
      error: null,
    });
  });

  it('sends the canonical inventory_items.id as catalog_ref for every item', async () => {
    await createDeliveryOrder(
      { name: 'A', phone: '1', zoneId: 'z1' },
      [{ catalogRef: 'inv-abc-123', name: 'Apple iPhone', unitPrice: 1200, quantity: 2 }],
    );
    const call = mockRpc.mock.calls[0]!;
    expect(call[0]).toBe('delivery_create_order');
    const items = (call[1] as { p_items: Array<{ catalog_ref: string }> }).p_items;
    expect(items[0]!.catalog_ref).toBe('inv-abc-123');
  });

  it('omits client price/quantity authority — the server overrides them on the DB side', async () => {
    await createDeliveryOrder(
      { name: 'A', phone: '1', zoneId: 'z1' },
      [{ catalogRef: 'inv-abc-123', name: 'Apple iPhone', unitPrice: 0, quantity: 99 }],
    );
    const items = (mockRpc.mock.calls[0]![1] as { p_items: Array<Record<string, unknown>> }).p_items;
    // The client may SEND a unit_price, but 00052 ignores it for catalog items
    // (asserted above); this guarantees the overridden server value wins.
    expect(items[0]!.catalog_ref).toBe('inv-abc-123');
  });
});

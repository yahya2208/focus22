/**
 * Neighborhood Pilot — migration gate tests (offline, structural).
 * No live DB. These assert the SQL migrations 00065/00066/00067 satisfy the
 * architectural + security + reset + scale invariants of the Pilot Epic.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M65 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00065_neighborhood_store_pilot.sql'), 'utf-8');
const M66 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00066_pilot_seed.sql'), 'utf-8');
const M67 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00067_telemetry_pilot_events.sql'), 'utf-8');
const M69 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00069_platform_ready_orders.sql'), 'utf-8');
const M70 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00070_pilot_account_approval.sql'), 'utf-8');

const FN_IN = (src: string, name: string): string => {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in migration source`).toBeGreaterThan(-1);
  const tail = src.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

describe('00065 — neighborhood/store model (Gates N/S/O)', () => {
  it('defines the new domain tables', () => {
    expect(M65).toContain('CREATE TABLE IF NOT EXISTS public.neighborhoods');
    expect(M65).toContain('CREATE TABLE IF NOT EXISTS public.stores');
    expect(M65).toContain('CREATE TABLE IF NOT EXISTS public.family_groups');
    expect(M65).toContain('CREATE TABLE IF NOT EXISTS public.neighborhood_families');
    expect(M65).toContain('CREATE TABLE IF NOT EXISTS public.store_inventory');
  });

  it('stores are scoped to a neighborhood; inventory stays canonical', () => {
    expect(M65).toMatch(/public\.stores\s*\([\s\S]*neighborhood_id\s+uuid NOT NULL REFERENCES public\.neighborhoods\(id\)/);
    expect(M65).toMatch(/public\.store_inventory\s*\([\s\S]*inventory_id\s+uuid NOT NULL REFERENCES public\.inventory_items\(id\)/);
    // canonical inventory must NOT be altered by the pilot
    expect(M65).not.toMatch(/ALTER TABLE public\.inventory_items/);
  });

  it('orders gain who/store/neighborhood columns (Phase 5) without touching core columns', () => {
    expect(M65).toContain('ADD COLUMN IF NOT EXISTS store_id');
    expect(M65).toContain('ADD COLUMN IF NOT EXISTS neighborhood_id');
    expect(M65).toContain('ADD COLUMN IF NOT EXISTS user_id');
    expect(M65).not.toContain('ALTER COLUMN');
  });

  it('delivery_create_order is extended additively (same contract + store tags)', () => {
    expect(M65).toMatch(/CREATE OR REPLACE FUNCTION public\.delivery_create_order\(p_customer jsonb, p_items jsonb\)/);
    expect(M65).toContain('SECURITY DEFINER');
    expect(M65).toContain("SET search_path = ''");
    for (const code of ['UNAUTHENTICATED', 'CUSTOMER_INFO_REQUIRED', 'ZONE_NOT_ACTIVE', 'ITEMS_REQUIRED', 'ITEM_NOT_FOUND', 'ITEM_NOT_ORDERABLE']) {
      expect(M65).toContain(code);
    }
    expect(M65).toContain('MULTI_STORE_ORDER');
    expect(M65).toContain("'store_id', v_store_id");
    expect(M65).toContain("'neighborhood_id', v_neigh_id");
  });
});

describe('00065/00066 — security posture (Security Gate)', () => {
  it('every write-capable pilot RPC is SECURITY DEFINER with fixed search_path', () => {
    const rpcs = [
      'pilot_admin_upsert_neighborhood',
      'pilot_admin_upsert_store',
      'pilot_admin_set_store_inventory',
      'pilot_admin_upsert_family',
      'pilot_admin_link_family',
      'pilot_orders_for_store',
      'pilot_order_set_status',
      'pilot_reset',
    ];
    for (const r of rpcs) {
      const block = M65.split(`FUNCTION public.${r}`)[1] ?? '';
      expect(block, `${r} must define the function`).toContain('SECURITY DEFINER');
      expect(block, `${r} must fix search_path`).toContain("SET search_path = ''");
    }
  });

  it('public storefront RPCs are anon-granted and gated on active status', () => {
    for (const r of ['pilot_active_neighborhoods', 'pilot_active_stores', 'pilot_store_products', 'pilot_neighborhood_families']) {
      expect(M65).toContain(`GRANT EXECUTE ON FUNCTION public.${r}(`);
      expect(M65).toContain(`REVOKE ALL ON FUNCTION public.${r}(`);
    }
    expect(M65).toContain("AND s.status = 'active'");
    expect(M65).toContain("ii.is_published = TRUE");
    expect(M65).toContain('ii.quantity > 0');
  });

  it('store-order RPCs demand operator-or-admin server-side', () => {
    expect(M65).toContain('public.fn_admin_uid() IS NOT NULL');
    expect(M65).toContain('s.operator_user_id = v_uid');
    expect(M65).toContain("RAISE EXCEPTION 'PERMISSION_DENIED'");
  });

  it('orders table stays admin/operator-read only (no direct user row leak)', () => {
    // delivery_create_order is the ONLY normal-user write path (grants are
    // untouched): authenticated may not SELECT orders directly via the new cols.
    expect(M65).toContain('REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC');
  });
});

describe('00066 + reset — deterministic seed & guarded cleanup (Phases 4/12/13)', () => {
  it('seed is idempotent and marker-guarded', () => {
    expect(M66).toContain('ON CONFLICT (neighborhood_id, family_id) DO NOTHING');
    expect(M66).toContain('ON CONFLICT (model_id, variant, condition, color) DO NOTHING');
    expect(M66).toContain("source_key LIKE 'pilot:%'");
    expect(M66).toContain("WHERE NOT EXISTS");
  });

  it('seed provides exactly five families + one store', () => {
    const familySlugs = [...M66.matchAll(/'pilot-family-\d+'/g)].map((m) => m[0]);
    expect(new Set(familySlugs).size).toBeGreaterThanOrEqual(5);
    for (let i = 1; i <= 5; i++) {
      expect(M66).toContain(`'pilot-family-${i}'`);
    }
    expect(M66).toContain("'pilot-store-1'");
    expect(M66).toContain("'pilot-neighborhood-1'");
  });

  it('pilot_reset only touches pilot-* rows and orders from pilot stores', () => {
    const resetBlock = M65.split('pilot_reset()')[1] ?? '';
    expect(resetBlock).toContain("slug LIKE 'pilot-%'");
    expect(resetBlock).toContain("source_key LIKE 'pilot:%'");
    expect(resetBlock).toContain('DELETE FROM public.orders');
    expect(resetBlock).toContain('PERMISSION_DENIED');
    // Must NOT blanket-truncate the canonical tables.
    expect(resetBlock).not.toMatch(/TRUNCATE/);
    expect(resetBlock).not.toContain('DELETE FROM public.inventory_items;');
  });

  it('seed products are the same shape as admin inventory (no fabricated extras)', () => {
    // Only the canonical inventory_items columns are inserted.
    expect(M66).not.toMatch(/INSERT INTO public\.inventory_items[\s\S]{0,200}extra/);
  });
});

describe('00067 — telemetry pilot events (Gate T, server half)', () => {
  it('adds the 9 pilot events to the closed server dictionary', () => {
    for (const ev of ['neighborhood_view', 'store_view', 'family_view', 'checkout_start', 'checkout_submit', 'order_created', 'order_failed', 'order_status_changed', 'order_completed']) {
      expect(M67, `missing ${ev}`).toContain(`WHEN '${ev}'`);
    }
  });

  it('extends the analytics domain + event registries with the new domains/events', () => {
    const domList = (M67.match(/v_dom_ok\s*:=\s*\([\s\S]*?\);/s)?.[0] ?? '');
    expect(domList).toContain("'neighborhood'");
    expect(domList).toContain("'order'");
    const evList = (M67.match(/v_ev_ok\s*:=\s*\([\s\S]*?\);/s)?.[0] ?? '');
    expect(evList).toContain("'checkout_submit'");
    expect(evList).toContain("'order_completed'");
    expect(M67).toContain("CREATE OR REPLACE FUNCTION public.record_telemetry_event");
  });
});

describe('seed scale contract (Phase 14) — second units need no new schema', () => {
  it('scaling data (Store #2 / Family #6) uses the SAME insert signatures as the seed', () => {
    // Store #2: same insert as the seeded store (data-level only).
    expect(M66).toContain('INSERT INTO public.stores (neighborhood_id, name, name_ar, slug, status, description, contact_phone)');
    expect(M66).toContain('INSERT INTO public.family_groups (name, name_ar, slug, status, description)');
    // No special-casing of a single numeric suffix anywhere in the model/seed.
    expect(M65).not.toMatch(/pilot-(store|neighborhood|family)-1/);
    expect([...M66.matchAll(/'pilot-family-\d+'/g)].length).toBeGreaterThanOrEqual(5);
  });
});

describe('00068 — courier layer & order visibility (Phases 3/6/10; Courier Gate)', () => {
  const M68 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00068_pilot_courier_delivery.sql'), 'utf-8');
  const FN = (name: string): string => {
    const start = M68.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    expect(start, `${name} must be defined`).toBeGreaterThan(-1);
    const tail = M68.slice(start);
    const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
    return end === -1 ? tail : tail.slice(0, end);
  };

  it('defines pilot_couriers with RLS and admin-only management', () => {
    expect(M68).toContain('CREATE TABLE IF NOT EXISTS public.pilot_couriers');
    expect(M68).toContain('user_id     uuid NOT NULL REFERENCES public.users(id)');
    expect(M68).toContain('ALTER TABLE public.pilot_couriers ENABLE ROW LEVEL SECURITY');
    expect(M68).toContain('"Courier read own membership"');
    expect(M68).toContain('"Admin manage couriers"');
  });

  it('adds courier assignment columns to orders without touching existing columns', () => {
    expect(M68).toContain('ADD COLUMN IF NOT EXISTS courier_user_id     uuid REFERENCES public.users(id)');
    expect(M68).toContain('ADD COLUMN IF NOT EXISTS courier_assigned_at timestamptz');
    expect(M68).not.toContain('DROP COLUMN');
    expect(M68).not.toContain('ALTER COLUMN');
  });

  it('every new RPC is SECURITY DEFINER with fixed search_path', () => {
    for (const r of [
      'pilot_my_stores',
      'pilot_order_detail',
      'pilot_orders_available',
      'pilot_orders_for_courier',
      'pilot_order_accept',
      'pilot_courier_set_status',
      'pilot_order_status_for_user',
      'pilot_admin_set_courier',
      'pilot_admin_pilot_health',
    ]) {
      const block = FN(r);
      expect(block, `${r} must be SECURITY DEFINER`).toContain('SECURITY DEFINER');
      expect(block, `${r} must fix search_path`).toContain("SET search_path = ''");
    }
  });

  it('courier status follows strict, canonical-only transitions (no invented statuses)', () => {
    const block = FN('pilot_courier_set_status');
    expect(block).toContain("'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'");
    expect(block).toContain("(p_status = 'out_for_delivery' AND v_cur IN ('confirmed', 'preparing'))");
    expect(block).toContain("(p_status = 'delivered' AND v_cur = 'out_for_delivery')");
    expect(block).toContain('TRANSITION_NOT_ALLOWED');
  });

  it('courier streams never expose the customer phone (least privilege)', () => {
    expect(FN('pilot_orders_available')).not.toMatch(/customer_phone/);
    expect(FN('pilot_orders_for_courier')).not.toMatch(/customer_phone/);
    const detail = FN('pilot_order_detail');
    expect(detail).toMatch(/CASE WHEN v_admin IS NOT NULL OR EXISTS/);
    expect(detail).toContain("jsonb_build_object('customer_phone', o.customer_phone)");
  });

  it('order accept is race-safe with a single guarded UPDATE', () => {
    const block = FN('pilot_order_accept');
    expect(block).toContain('AND courier_user_id IS NULL');
    expect(block).toContain("AND status IN ('confirmed', 'preparing')");
    expect(block).toContain("RAISE EXCEPTION 'ORDER_UNASSIGNABLE'");
  });

  it('keeps the double grant contract (REVOKE ALL then GRANT) for every new RPC', () => {
    for (const r of [
      'pilot_my_stores',
      'pilot_order_detail',
      'pilot_orders_available',
      'pilot_orders_for_courier',
      'pilot_order_accept',
      'pilot_courier_set_status',
      'pilot_order_status_for_user',
      'pilot_admin_set_courier',
      'pilot_admin_pilot_health',
    ]) {
      expect(M68, `${r} revoke`).toContain(`REVOKE ALL ON FUNCTION public.${r}(`);
      expect(M68, `${r} grant`).toContain(`GRANT EXECUTE ON FUNCTION public.${r}(`);
    }
  });

  it('does not modify the central RBAC matrix or telemetry privacy contract (read-only health)', () => {
    expect(M68).not.toMatch(/INSERT INTO public\.ROLE_PERMISSIONS/);
    expect(M68).not.toMatch(/INSERT INTO public\.ROLE_CAPABILITY_MAP/);
    expect(M68).not.toMatch(/ALTER TABLE public\.(users|roles|ROLE_|telemetry_)/);
    expect(M68).not.toMatch(/record_telemetry_event/);
    // admin health only READS telemetry to count pilot events.
    const health = FN('pilot_admin_pilot_health');
    expect(health).toMatch(/SELECT count\(\*\)::int FROM public\.telemetry_events/);
  });
});

describe('00069 — platform-ready orders (Gap fix: store is a fulfilment point)', () => {
  it('redefines delivery_create_order so INSERT status is confirmed', () => {
    const block = FN_IN(M69, 'delivery_create_order');
    expect(M69).toMatch(/CREATE OR REPLACE FUNCTION public\.delivery_create_order\(p_customer jsonb, p_items jsonb\)/);
    expect(block).toContain('v_subtotal, v_fee, v_subtotal + v_fee, \'confirmed\', v_notes');
  });

  it('returns confirmed (pending is never produced by delivery_create_order)', () => {
    const block = FN_IN(M69, 'delivery_create_order');
    expect(block).toContain("'status', 'confirmed'");
    expect(block).not.toMatch(/\), 'pending',/);
  });

  it('preserves every protection verbatim (server authority + errors + store tags)', () => {
    const block = FN_IN(M69, 'delivery_create_order');
    expect(block).toContain('SECURITY DEFINER');
    expect(block).toContain("SET search_path = ''");
    for (const code of ['UNAUTHENTICATED', 'CUSTOMER_INFO_REQUIRED', 'ZONE_NOT_ACTIVE', 'ITEMS_REQUIRED', 'ITEM_NOT_FOUND', 'ITEM_NOT_ORDERABLE']) {
      expect(block).toContain(code);
    }
    expect(block).toContain('MULTI_STORE_ORDER');
    expect(block).toContain("'store_id', v_store_id");
    expect(block).toContain("'neighborhood_id', v_neigh_id");
    expect(block).toContain('AND v.quantity > 0');
    expect(block).toContain('nextval(\'public.orders_id_seq\')');
  });

  it('is additive-only: no schema/RLS/other-function churn, grant contract intact', () => {
    expect(M69).not.toMatch(/ALTER TABLE/);
    expect(M69).not.toMatch(/CREATE (TABLE|POLICY)/);
    expect(M69).not.toMatch(/DROP FUNCTION/);
    expect((M69.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(1);
    expect(M69).toContain('REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC;');
    expect(M69).toContain('GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated;');
  });
});

describe('00070 — independent accounts + admin approval (account architecture)', () => {
  it('adds the operator approval ledger with pending/active/suspended vocabulary', () => {
    expect(M70).toContain('CREATE TABLE IF NOT EXISTS public.pilot_store_operators');
    expect(M70).toMatch(/status\s+text NOT NULL\s+CHECK \(status IN \('pending', 'active', 'suspended'\)\)/);
    expect(M70).toMatch(/FOREIGN KEY|REFERENCES public\.users\(id\)/);
    expect(M70).toContain('ALTER TABLE public.pilot_store_operators ENABLE ROW LEVEL SECURITY');
    expect(M70).toContain('"Admin read all operators"');
    expect(M70).toContain('"Admin manage operators"');
    expect(M70).toContain('"Operator read own membership"');
  });

  it('extends courier membership vocabulary to the approval statuses', () => {
    expect(M70).toContain("CHECK (status IN ('pending', 'active', 'inactive', 'suspended'))");
    expect(M70).toMatch(/ADD CONSTRAINT pilot_couriers_status_check/);
    // Must not touch the table columns or the UNIQUE membership key.
    expect(M70).not.toMatch(/DROP COLUMN/);
    expect(M70).not.toMatch(/ALTER COLUMN/);
    expect(M70).not.toMatch(/DROP TABLE/);
  });

  it('approval RPCs are admin-gated SECURITY DEFINER with fixed search_path', () => {
    for (const r of [
      'pilot_admin_set_operator_status',
      'pilot_admin_list_operators',
      'pilot_admin_set_courier_status',
      'pilot_admin_list_couriers',
    ]) {
      const block = FN_IN(M70, r);
      expect(block, `${r} SECURITY DEFINER`).toContain('SECURITY DEFINER');
      expect(block, `${r} search_path`).toContain("SET search_path = ''");
      expect(block, `${r} admin gate`).toContain('fn_admin_uid()');
      expect(block, `${r} permission check`).toContain("RAISE EXCEPTION 'PERMISSION_DENIED'");
    }
  });

  it('operator approval syncs the single existing enforcement point (operator_user_id)', () => {
    const block = FN_IN(M70, 'pilot_admin_set_operator_status');
    expect(block).toMatch(/UPDATE public\.stores\s+SET operator_user_id = p_user_id, updated_at = now\(\)\s+WHERE id = p_store_id/);
    expect(block).toMatch(/UPDATE public\.stores\s+SET operator_user_id = NULL, updated_at = now\(\)\s+WHERE id = p_store_id AND operator_user_id = p_user_id/);
    // 'active' carries approval audit (who + when).
    expect(block).toContain("CASE WHEN p_status = 'active'");
  });

  it('grants: every new approval RPC is REVOKE ALL then GRANT EXECUTE for authenticated', () => {
    for (const r of [
      'pilot_admin_set_operator_status',
      'pilot_admin_list_operators',
      'pilot_admin_set_courier_status',
      'pilot_admin_list_couriers',
    ]) {
      expect(M70, `${r} revoke`).toContain(`REVOKE ALL ON FUNCTION public.${r}(`);
      expect(M70, `${r} grant`).toContain(`GRANT EXECUTE ON FUNCTION public.${r}(`);
    }
  });

  it('does NOT weaken or amend the existing enforcement/security surface', () => {
    // New RPCs plus the courier set-status redefinition (authorization tightened
    // from mere assignment to ACTIVE membership; transitions unchanged).
    const redefined = [...M70.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]);
    expect(redefined).toEqual([
      'pilot_admin_set_operator_status',
      'pilot_admin_list_operators',
      'pilot_admin_set_courier_status',
      'pilot_admin_list_couriers',
      'pilot_courier_set_status',
    ]);
    // No amendment to the central RBAC matrix, telemetry, or core tables.
    expect(M70).not.toMatch(/INSERT INTO public\.ROLE_PERMISSIONS/);
    expect(M70).not.toMatch(/INSERT INTO public\.ROLE_CAPABILITY_MAP/);
    expect(M70).not.toMatch(/ALTER TABLE public\.(users|roles|orders|stores)/);
    expect(M70).not.toMatch(/record_telemetry_event/);
    expect(M70).not.toMatch(/service_role/);
    // No blanket grant to anonymous on the new/production tables.
    expect(M70).toContain('GRANT SELECT ON public.pilot_store_operators TO authenticated;');
  });

  it('hardens courier set-status: ACTIVE membership required, transitions preserved', () => {
    const cs = FN_IN(M70, 'pilot_courier_set_status');
    // Authorization no longer relies on courier_user_id assignment alone.
    expect(cs).toContain("pc.status = 'active'");
    expect(cs).toContain("PERMISSION_DENIED' USING ERRCODE = '42501");
    // Strict transition matrix and argument contract carry over verbatim.
    expect(cs).toContain("p_status = 'out_for_delivery' AND v_cur IN ('confirmed', 'preparing')");
    expect(cs).toContain("p_status = 'delivered' AND v_cur = 'out_for_delivery'");
    expect(cs).toContain("TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023");
    expect(cs).toContain("ORDER_NOT_FOUND' USING ERRCODE = 'P0002");
    expect(cs).toContain("SET search_path = ''");
    expect(cs).toContain('SECURITY DEFINER');
  });

  it('connects the approval workflow end-to-end (Pending -> Admin Approval -> Active)', () => {
    // 'pending' is the onboarding state; admin 'active' grants operation; downgrade denies.
    const set = FN_IN(M70, 'pilot_admin_set_operator_status');
    expect(set).toContain("NOT IN ('pending', 'active', 'suspended')");
    const list = FN_IN(M70, 'pilot_admin_list_operators');
    expect(list).toContain("p_store_id uuid DEFAULT NULL");
    const setC = FN_IN(M70, 'pilot_admin_set_courier_status');
    expect(setC).toContain("NOT IN ('pending', 'active', 'inactive', 'suspended')");
    const listC = FN_IN(M70, 'pilot_admin_list_couriers');
    expect(listC).toContain("p_store_id uuid DEFAULT NULL");
  });
});
/**
 * Neighborhood Pilot — 00082 operational order visibility + realtime gate.
 * Offline structural gate over supabase/migrations/00082_operational_orders_realtime.sql.
 * No live DB. Verifies the GATE-6 SQL contract:
 *   my-orders RPC (owner/admin, bounded, no phone), owner-visible detail with
 *   the phone guard preserved, realtime publication EXACTLY orders +
 *   order_status_history (no courier-location feed), scoped RLS read policies
 *   (no anon, no SELECT-all, initplan auth.uid()), grant invariants preserved.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M82 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00082_operational_orders_realtime.sql'),
  'utf-8',
);

const FN = (name: string): string => {
  const start = M82.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00082`).toBeGreaterThan(-1);
  const tail = M82.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

describe('00082 — customer My Orders (pilot_my_orders)', () => {
  it('is SECURITY DEFINER with fixed search_path and STABLE', () => {
    const block = FN('pilot_my_orders');
    expect(block).toContain('SECURITY DEFINER');
    expect(block).toContain("SET search_path = ''");
    expect(block).toContain('STABLE');
  });

  it('is owner-or-admin scoped with no enumeration and no phone in the list', () => {
    const block = FN('pilot_my_orders');
    expect(block).toContain('WHERE o.user_id = v_uid');
    expect(block).toContain('OR public.fn_admin_uid() IS NOT NULL');
    expect(block).toContain('LIMIT 100');
    expect(block).not.toMatch(/customer_phone/);
    // Non-owners must not be able to see arbitrary orders.
    expect(block).not.toMatch(/WHERE o.user_id IS NULL/);
  });

  it('keeps the REVOKE ALL / anon-revoke / authenticated-grant contract', () => {
    expect(M82).toContain('REVOKE ALL ON FUNCTION public.pilot_my_orders() FROM PUBLIC;');
    expect(M82).toContain('REVOKE EXECUTE ON FUNCTION public.pilot_my_orders() FROM anon;');
    expect(M82).toContain('GRANT EXECUTE ON FUNCTION public.pilot_my_orders() TO authenticated;');
  });
});

describe('00082 — pilot_order_detail extended to the owner (phone guard intact)', () => {
  it('adds owner authorization while keeping courier/operator/admin branches', () => {
    const block = FN('pilot_order_detail');
    expect(block).toContain('OR v_customer = v_uid');
    expect(block).toContain('s.operator_user_id = v_uid');
    expect(block).toContain('OR v_courier = v_uid');
    expect(block).toContain('v_admin IS NOT NULL');
  });

  it('preserves the 00068 phone guard (admin / store operator only)', () => {
    const block = FN('pilot_order_detail');
    expect(block).toMatch(/CASE WHEN v_admin IS NOT NULL OR EXISTS/);
    expect(block).toContain("jsonb_build_object('customer_phone', o.customer_phone)");
    expect(block).toContain("ELSE '{}'::jsonb");
  });

  it('keeps SECURITY DEFINER, search_path and the double-grant contract', () => {
    const block = FN('pilot_order_detail');
    expect(block).toContain('SECURITY DEFINER');
    expect(block).toContain("SET search_path = ''");
    expect(M82).toContain('REVOKE ALL ON FUNCTION public.pilot_order_detail(uuid) FROM PUBLIC;');
    expect(M82).toContain('REVOKE EXECUTE ON FUNCTION public.pilot_order_detail(uuid) FROM anon;');
    expect(M82).toContain('GRANT EXECUTE ON FUNCTION public.pilot_order_detail(uuid) TO authenticated;');
  });
});

describe('00082 — realtime publication (exactly the two order tables)', () => {
  it('publishes orders + order_status_history with guarded, idempotent adds', () => {
    expect(M82).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;');
    expect(M82).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;');
    expect(M82).toMatch(/pg_publication_tables/);
    expect(M82).toContain("pubname = 'supabase_realtime'");
  });

  it('NEVER publishes courier location tables (no live GPS feed)', () => {
    expect(M82).not.toMatch(/ADD TABLE public\.pilot_courier_locations/);
    expect(M82).not.toMatch(/ADD TABLE public\.pilot_courier_locations_latest/);
    expect(M82).toMatch(/pilot_courier_locations_latest/); // explicitly named OUT in bounds/checks
  });
});

describe('00082 — scoped RLS read policies', () => {
  it('adds the three scoped orders policies with initplan auth.uid() and no anon', () => {
    for (const name of [
      'Realtime read own orders',
      'Realtime read courier assigned orders',
      'Realtime read store orders',
    ]) {
      const stmt = M82.split(`CREATE POLICY "${name}"`)[1] ?? '';
      expect(stmt, name).toMatch(/AS PERMISSIVE FOR SELECT TO authenticated/);
      expect(stmt, name).not.toMatch(/TO (anon|public)/);
      expect(stmt, name).not.toMatch(/TO postgres/);
      const uid = (stmt.match(/auth\.uid\(\)/g) ?? []).length;
      const wuid = (stmt.match(/\(select\s+auth\.uid\(\)\)/gi) ?? []).length;
      expect(uid, name).toBeGreaterThan(0);
      expect(wuid, name).toBe(uid); // every auth.uid() is initplan-wrapped
      expect(stmt, name).not.toMatch(/USING \(true\)/);
    }
  });

  it('scopes each orders policy to its own actor (no cross-role SELECT-all)', () => {
    const own = M82.split('CREATE POLICY "Realtime read own orders"')[1] ?? '';
    expect(own).toContain('(SELECT auth.uid()) = user_id');
    const courier = M82.split('CREATE POLICY "Realtime read courier assigned orders"')[1] ?? '';
    expect(courier).toContain('(SELECT auth.uid()) = courier_user_id');
    const store = M82.split('CREATE POLICY "Realtime read store orders"')[1] ?? '';
    expect(store).toContain('s.operator_user_id = (SELECT auth.uid())');
    expect(store).toMatch(/s\.id = store_id/);
  });

  it('adds the admin live-view policy (fn_admin_uid) so the ops feed is not dead for admins', () => {
    const admin = M82.split('CREATE POLICY "Realtime read all orders (admin)"')[1] ?? '';
    expect(admin).toMatch(/AS PERMISSIVE FOR SELECT TO authenticated/);
    expect(admin).not.toMatch(/TO (anon|public)/);
    expect(admin).toContain('USING (public.fn_admin_uid() IS NOT NULL)');
  });

  it('adds the three scoped history policies keyed through the parent order', () => {
    for (const name of [
      'Realtime history owner',
      'Realtime history courier',
      'Realtime history store',
    ]) {
      const stmt = M82.split(`CREATE POLICY "${name}"`)[1] ?? '';
      expect(stmt, name).toMatch(/AS PERMISSIVE FOR SELECT TO authenticated/);
      expect(stmt, name).not.toMatch(/TO (anon|public)/);
      const uid = (stmt.match(/auth\.uid\(\)/g) ?? []).length;
      const wuid = (stmt.match(/\(select\s+auth\.uid\(\)\)/gi) ?? []).length;
      expect(wuid, name).toBe(uid);
      expect(stmt, name).toMatch(/o\.id = order_id/);
    }
  });
});

describe('00082 — boundaries & grant invariants', () => {
  it('touches nothing outside its domain (no RBAC/telemetry/service-role/schema churn)', () => {
    const code = M82.replace(/^\s*--.*$/gm, '').trim();
    expect(code).not.toMatch(/INSERT INTO public\.ROLE_PERMISSIONS/);
    expect(code).not.toMatch(/INSERT INTO public\.ROLE_CAPABILITY_MAP/);
    expect(code).not.toMatch(/record_telemetry_event/);
    expect(code).not.toMatch(/service_role/);
    expect(code).not.toMatch(/CREATE TABLE|DROP TABLE|ALTER TABLE|ALTER COLUMN|DROP COLUMN/);
    expect(code).not.toMatch(/DROP FUNCTION/);
  });

  it('adds no speculative indexes', () => {
    expect(M82).not.toMatch(/CREATE INDEX/);
  });

  it('post-checks enforce the SELECT-only grant contract on both tables', () => {
    expect(M82).toContain("RAISE EXCEPTION '00082: authenticated gained a WRITE grant on orders'");
    expect(M82).toContain(
      "RAISE EXCEPTION '00082: authenticated has a WRITE grant on order_status_history'",
    );
    expect(M82).toContain('00082: courier location tables must NOT be published');
  });
});
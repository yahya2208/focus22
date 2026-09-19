/**
 * GATE 3 — ORDER LIFECYCLE + STATUS HISTORY (migration 00079).
 * Offline structural proofs (no live DB), mirroring the 00078 location
 * convention exactly:
 *   Single machine   — all transitions live in exactly ONE private helper
 *                      (pilot_assert_transition); RPCs delegate, no copies.
 *   Matrix (GATE-1)  — O/A rows + C-only rows gated on assignment; terminal
 *                      delivered/cancelled cannot be left; no customer writes.
 *   Assignment       — accept stays race-safe (unassigned-only guarded UPDATE);
 *                      courier_set_status is assignment-scoped (cross-courier
 *                      impossible), active-membership re-checked per call.
 *   Atomicity        — status UPDATE + history INSERT in the same function
 *                      (same transaction), after ROW_COUNT=1 confirms.
 *   History          — append-only table, RLS admin-only, no write grants,
 *                      server-written events only, THREE justified indexes.
 *   Timeline         — authorised owner/assignee/operator/admin only;
 *                      ORDER_NOT_FOUND hides non-authorised ids.
 *   Creation event   — delivery_create_order writes the single 'created'
 *                      event (previous_status='', actor_role customer).
 *   Boundaries       — no telemetry/RBAC/realtime/accounts/GPS/00078/00064.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M79 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00079_order_lifecycle_status_history.sql'), 'utf-8');
const M50 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00050_categories_delivery.sql'), 'utf-8');

// CODE = executable SQL only (comments document; assertions read code).
const CODE = M79.replace(/^\s*--.*$/gm, '').trim();
// FN_BLOCKS from CODE (comment-free) so the reduce actually removes bodies.
const FN_BLOCKS = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?\n\$\$/g)].map((m) => m[0]);
const TOP = FN_BLOCKS.reduce((acc, b) => acc.replace(b, ''), CODE);
// Comment-less text of one function (header + body + trailing grants if any).
const FN = (name: string): string => {
  const start = M79.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00079`).toBeGreaterThan(-1);
  const tail = M79.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};
// The full CREATE TABLE block for a table name.
const TBL = (name: string): string =>
  (M79.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}\\s\\([\\s\\S]*?\\);`))?.[0] ?? '');

describe('Single canonical state machine — EXACTLY one matrix, nowhere else', () => {
  it('order_status_history is defined once with the canonical schema', () => {
    const block = TBL('order_status_history');
    expect(block).toBeTruthy();
    expect(block).toMatch(/id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(block).toMatch(/order_id\s+uuid NOT NULL REFERENCES public\.orders\(id\) ON DELETE CASCADE/);
    expect(block).toContain("previous_status  text NOT NULL CHECK (previous_status = '' OR previous_status IN");
    for (const s of ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']) {
      expect(block).toContain(s);
    }
    expect(block).toContain('event_type       text NOT NULL CHECK (event_type IN');
    for (const e of ['created', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'courier_assigned', 'reassigned', 'status_set']) {
      expect(block).toContain(e);
    }
    expect(block).toMatch(/actor_user_id\s+uuid REFERENCES public\.users\(id\) ON DELETE SET NULL/);
    expect(block).toContain("actor_role       text NOT NULL CHECK (actor_role IN");
    expect(block).toContain("'customer','store_operator','courier','admin')");
    expect(block).not.toContain("'system'");
    expect(block).toContain("created_at       timestamptz NOT NULL DEFAULT now()");
  });

  it('the transition matrix appears in pilot_assert_transition only (no duplicate rule set)', () => {
    const helper = FN('pilot_assert_transition');
    // Every GATE-1 matrix row is a literal inside the helper.
    expect(helper).toContain("v_cur = 'pending'          AND p_new_status = 'confirmed'");
    expect(helper).toContain("v_cur = 'pending'          AND p_new_status = 'cancelled'");
    expect(helper).toContain("v_cur = 'confirmed'        AND p_new_status = 'preparing'");
    expect(helper).toContain("v_cur = 'confirmed'        AND p_new_status = 'cancelled'");
    expect(helper).toContain("v_cur = 'preparing'        AND p_new_status = 'out_for_delivery'");
    expect(helper).toContain("v_cur = 'preparing'        AND p_new_status = 'cancelled'");
    expect(helper).toContain("v_cur = 'out_for_delivery' AND p_new_status = 'delivered'");
    // Courier rows are the ONLY two C transitions and require assignment.
    expect(helper).toContain("v_role = 'courier' AND v_assigned = v_uid");
    expect(helper).toMatch(/v_role = 'courier' AND v_assigned = v_uid AND \(/);
    // The matrix does NOT exist anywhere outside the helper.
    const outside = FN('pilot_order_set_status') + FN('pilot_courier_set_status') + FN('pilot_order_accept');
    for (const row of ["AND p_new_status = 'confirmed'", "AND p_new_status = 'delivered'", "AND p_new_status = 'out_for_delivery'"]) {
      expect(outside, `matrix row must not be duplicated in RPC: ${row}`).not.toContain(row);
    }
  });

  it('delivered and cancelled are TERMINAL — the matrix has no row leaving them', () => {
    const helper = FN('pilot_assert_transition');
    for (const target of ['delivered', 'cancelled', 'preparing', 'out_for_delivery', 'confirmed']) {
      expect(helper, `delivered -> ${target} must not exist`).not.toContain(
        `v_cur = 'delivered'          AND p_new_status = '${target}'`,
      );
      expect(helper, `cancelled -> ${target} must not exist`).not.toContain(
        `v_cur = 'cancelled'          AND p_new_status = '${target}'`,
      );
    }
    // Justify with the terminal guard: no actor can reach a from-state of delivered/cancelled.
    expect(helper).not.toMatch(/v_cur = 'delivered'/);
    expect(helper).not.toMatch(/v_cur = 'cancelled'/);
  });
});

describe('Actor resolution is server-side (admin > operator > courier > customer)', () => {
  it('the helper computes role from auth.uid() + memberships, never from arguments', () => {
    const block = FN('pilot_assert_transition');
    expect(block).toMatch(/v_uid\s+uuid := auth\.uid\(\);/);
    expect(block).toContain('IF public.fn_admin_uid() IS NOT NULL THEN');
    expect(block).toContain("v_role := 'admin'");
    expect(block).toContain("AND s.operator_user_id = v_uid");
    expect(block).toContain("v_role := 'store_operator'");
    expect(block).toContain("AND pc.status = 'active'");
    expect(block).toContain("v_role := 'courier'");
    expect(block).not.toMatch(/v_role := COALESCE\(p_.*role/);
    expect(block).not.toMatch(/p_role|p_actor_role|p_new_status::.*role/);
    // Per-call suspension semantics: operator_user_id and courier 'active' are
    // re-read inside the call, so a just-suspended actor loses authority.
    expect(block).not.toMatch(/CACHE|current_setting.*role|SET ROLE/);
  });

  it('pilot_order_set_status keeps its operator_or_admin gate only', () => {
    const block = FN('pilot_order_set_status');
    expect(block).toContain("NOT (\n    public.fn_admin_uid() IS NOT NULL\n    OR EXISTS (\n      SELECT 1 FROM public.stores s\n      WHERE s.id = v_store AND s.operator_user_id = v_uid\n    )\n  )");
    expect(block).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'");
    expect(block).not.toMatch(/pilot_couriers/);
  });

  it('pilot_courier_set_status is assignment-scoped (assigned courier OR admin only)', () => {
    const block = FN('pilot_courier_set_status');
    expect(block).toContain('o.courier_user_id = v_uid OR public.fn_admin_uid() IS NOT NULL');
    expect(block).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'");
    expect(block).toContain("RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002'");
    // No store-wide courier membership short-circuit survives in this RPC.
    expect(block).not.toMatch(/pilot_couriers pc/);
  });
});

describe('Concurrency — every transition/claim is an atomic guarded UPDATE', () => {
  it('status transitions use UPDATE ... WHERE status = <read-current> + ROW_COUNT', () => {
    const helper = FN('pilot_assert_transition');
    expect(helper).toContain("WHERE id = p_order_id AND status = v_cur;");
    expect(helper).toContain('GET DIAGNOSTICS v_done = ROW_COUNT;');
    expect(helper).toContain('IF v_done = 0 THEN');
    expect(helper).toContain("RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';");
    // Single read + single matching update: no lost-update hole, no window.
    expect(helper).toContain("SELECT o.status, o.store_id, o.courier_user_id, o.user_id");
    expect(helper).toContain('FROM public.orders o');
  });

  it('claims keep the 00068 race-safe unassigned-only guard + ORDER_UNASSIGNABLE', () => {
    const helper = FN('pilot_assert_transition');
    expect(helper).toContain("AND courier_user_id IS NULL");
    expect(helper).toContain("AND status IN ('confirmed', 'preparing')");
    expect(helper).toContain("RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';");
    // Exactly one claimer wins: the guarded UPDATE is the only writer.
    expect(helper).toMatch(/UPDATE public\.orders[\s\S]*?courier_user_id\s*=\s*v_uid/);
    expect(helper).not.toMatch(/SELECT .* FOR UPDATE/);
  });

  it('history INSERT happens only AFTER the guarded UPDATE succeeds (no ghost events)', () => {
    const helper = FN('pilot_assert_transition');
    const updIdx = helper.indexOf('UPDATE public.orders');
    const insIdx = helper.indexOf('INSERT INTO public.order_status_history');
    expect(updIdx).toBeGreaterThan(-1);
    expect(insIdx).toBeGreaterThan(updIdx);
    // No INSERT can execute after v_done = 0 (it raises before the INSERT).
    const diagIdx = helper.indexOf('GET DIAGNOSTICS v_done = ROW_COUNT;', updIdx);
    expect(diagIdx).toBeGreaterThan(updIdx);
    expect(diagIdx).toBeLessThan(insIdx);
  });
});

describe('History is append-only and server-written (no client mutation path)', () => {
  it('order_status_history has NO direct INSERT/UPDATE/DELETE grant at all', () => {
    expect(M79).toContain('GRANT SELECT ON public.order_status_history TO authenticated;');
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(M79, priv).not.toMatch(new RegExp(`GRANT ${priv}[^;]*ON public\\.order_status_history`));
    }
    expect(M79).not.toMatch(/GRANT [^;]*ON public\.order_status_history\s*TO anon/);
  });

  it('RLS is enabled with exactly the one ADMIN-ONLY policy (00078-style)', () => {
    expect(M79).toContain('ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;');
    expect(M79).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
    const policies = M79.match(/CREATE POLICY "[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain('"Admin manage order status history"');
    expect(policies[0]).toContain('USING (public.fn_admin_uid() IS NOT NULL)');
    expect(policies[0]).toContain('WITH CHECK (public.fn_admin_uid() IS NOT NULL)');
    expect(CODE).not.toMatch(/FOR SELECT TO anon/);
    expect(CODE).not.toMatch(/USING \((TRUE|true)\)/);
  });

  it('every history write is the OLD-status->NEW-status pair in the same transaction', () => {
    const helper = FN('pilot_assert_transition') + FN('delivery_create_order');
    // helper: 2 inserts (courier_assigned + status path); creation: 1 ('created').
    expect((helper.match(/INSERT INTO public\.order_status_history/g) ?? []).length).toBe(3);
    // status path: previous_status = v_cur, event_type = p_new_status
    expect(FN('pilot_assert_transition')).toMatch(/VALUES \(\s*p_order_id,\s*v_cur,\s*p_new_status/);
    // creation path: previous_status = '', event_type = 'created', actor customer
    expect(FN('delivery_create_order')).toMatch(/v_order_id,\s*'',\s*'confirmed',\s*'created'/);
  });

  it('creates no speculative index — exactly three justified indexes', () => {
    const indexes = CODE.match(/CREATE INDEX IF NOT EXISTS\s+(\w+)/g) ?? [];
    expect(indexes).toEqual([
      'CREATE INDEX IF NOT EXISTS idx_order_status_history_order_time',
      'CREATE INDEX IF NOT EXISTS idx_order_status_history_order_status',
      'CREATE INDEX IF NOT EXISTS idx_order_status_history_actor_time',
    ]);
    expect(CODE).not.toMatch(/CREATE INDEX IF NOT EXISTS [^;]*created_at\s+(DESC|ASC)[^;]*PARTIAL|WHERE created_at/);
    expect(CODE).not.toMatch(/CREATE INDEX IF NOT EXISTS [^;]*\(created_at/);
  });

  it('does NOT backfill invented history for legacy orders', () => {
    // No top-level (compiled-one-time) INSERT into the history table.
    expect(TOP).not.toMatch(/INSERT INTO public\.order_status_history/);
    // All history inserts live inside the two SECURITY DEFINER function bodies.
    expect(CODE).not.toMatch(/UPDATE public\.orders\s+SET\s+status[^;]*ORDER BY/);
  });
});

describe('pilot_order_timeline — authorised read with ordering + no enumeration', () => {
  const block = FN('pilot_order_timeline');

  it('is SECURITY DEFINER + STABLE + fixed search_path + authenticated-only grant', () => {
    expect(block).toContain('STABLE');
    expect(block).toContain('SECURITY DEFINER');
    expect(block).toContain("SET search_path = ''");
    expect(M79).toContain('REVOKE EXECUTE ON FUNCTION public.pilot_order_timeline(uuid) FROM anon;');
    expect(M79).toContain('GRANT EXECUTE ON FUNCTION public.pilot_order_timeline(uuid) TO authenticated;');
  });

  it('authorises customer owner / assigned courier / store operator / admin', () => {
    expect(block).toContain('public.fn_admin_uid() IS NOT NULL');
    expect(block).toContain('o.user_id = v_uid');
    expect(block).toContain('o.courier_user_id = v_uid');
    expect(block).toContain('s.id = o.store_id AND s.operator_user_id = v_uid');
  });

  it('raises ORDER_NOT_FOUND for non-authorised ids (no enumeration leak)', () => {
    expect(block).toContain("RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002'");
    const okIdx = block.indexOf('SELECT EXISTS (');
    const denyIdx = block.indexOf('RAISE EXCEPTION', okIdx);
    // Authorisation gate precedes any event read.
    const aggIdx = block.indexOf('jsonb_agg');
    expect(aggIdx).toBeGreaterThan(denyIdx);
    expect(block).not.toMatch(/PERMISSION_DENIED/);
  });

  it('returns doc-shaped events ordered created_at ASC, id ASC', () => {
    expect(block).toContain('ORDER BY h.created_at ASC, h.id ASC');
    for (const k of ['id', 'order_id', 'previous_status', 'new_status', 'event_type', 'actor_user_id', 'actor_role', 'reason', 'metadata', 'created_at']) {
      expect(block, k).toContain(`'${k}'`);
    }
    expect(block).toContain("jsonb_build_object('order_id', p_order_id, 'events', v_events)");
  });
});

describe('RPC delegation + preserved contracts (00065/00068/00070)', () => {
  it('pilot_order_set_status keeps signature, error codes, and publishes transition', () => {
    expect(M79).toMatch(/CREATE OR REPLACE FUNCTION public\.pilot_order_set_status\(p_order_id uuid, p_status text\)/);
    const block = FN('pilot_order_set_status');
    expect(block).toContain('UNAUTHENTICATED');
    expect(block).toContain("RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';");
    expect(block).toContain("RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';");
    expect(block).toContain('public.pilot_assert_transition(p_order_id, p_status, false)');
    expect(block).not.toMatch(/UPDATE public\.orders/); // updates live in the helper only
  });

  it('pilot_courier_set_status delegates and never bypasses the matrix', () => {
    expect(M79).toMatch(/CREATE OR REPLACE FUNCTION public\.pilot_courier_set_status\(p_order_id uuid, p_status text\)/);
    const block = FN('pilot_courier_set_status');
    expect(block).toContain('UNAUTHENTICATED');
    expect(block).toContain('public.pilot_assert_transition(p_order_id, p_status, false)');
    expect(block).not.toMatch(/UPDATE public\.orders/);
  });

  it('pilot_order_accept delegates the assign path and records courier_assigned', () => {
    const block = FN('pilot_order_accept');
    expect(block).toContain('UNAUTHENTICATED');
    expect(block).toContain("RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';");
    expect(block).toContain("pc.status = 'active'");
    expect(block).toContain('s.operator_user_id = v_uid');
    expect(block).toContain('public.pilot_assert_transition(p_order_id, NULL, true)');
    expect(block).not.toMatch(/UPDATE public\.orders/);
    expect(FN('pilot_assert_transition')).toContain("'courier_assigned'");
  });

  it('delivery_create_order is a minimal additive change (same contract + created event)', () => {
    const block = FN('delivery_create_order');
    for (const code of ['UNAUTHENTICATED', 'CUSTOMER_INFO_REQUIRED', 'ZONE_NOT_ACTIVE', 'ITEMS_REQUIRED', 'ITEM_NOT_FOUND', 'ITEM_NOT_ORDERABLE', 'MULTI_STORE_ORDER']) {
      expect(block, code).toContain(code);
    }
    expect(block).toContain("RETURNING id INTO v_order_id;");
    const returningIdx = block.indexOf('RETURNING id INTO v_order_id;');
    const createdIdx = block.indexOf("'created'");
    expect(createdIdx).toBeGreaterThan(returningIdx);
  });

  it('every client RPC keeps the double grant contract and has anon revoked', () => {
    for (const fn of ['pilot_order_timeline', 'pilot_order_set_status', 'pilot_courier_set_status', 'pilot_order_accept', 'delivery_create_order']) {
      expect(M79, fn).toContain(`REVOKE ALL ON FUNCTION public.${fn}(`);
      expect(M79, fn).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}(`);
      expect(M79, fn).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(`);
    }
    // The private helper is owner-only: REVOKE ALL + anon revoke + NO grant.
    expect(M79).toContain('REVOKE ALL ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM PUBLIC;');
    expect(M79).toContain('REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM anon;');
    expect(M79).toContain('REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM authenticated;');
    expect(M79).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_assert_transition\(/);
  });
});

describe('Regression — GATE 3 scope boundaries held', () => {
  it('does not alter the orders table or any schema outside order_status_history', () => {
    expect(CODE).not.toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(CODE).not.toMatch(/ALTER TABLE public\.orders(?!_status_history)/);
    expect(CODE).not.toMatch(/ALTER COLUMN/);
    expect(CODE).not.toMatch(/DROP TABLE/);
    expect(CODE).not.toMatch(/DROP COLUMN/);
  });

  it('does NOT touch accounts, RBAC, telemetry, Realtime, GPS, or 00078/00064 objects', () => {
    expect(CODE).not.toMatch(/ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP|record_telemetry_event/);
    expect(CODE).not.toMatch(/ALTER PUBLICATION|supabase_realtime|postgres_changes|\.channel\(/);
    expect(CODE).not.toMatch(/pilot_courier_locations/);
    expect(CODE).not.toMatch(/latitude|longitude|center_lat|center_lng/);
    expect(CODE).not.toMatch(/pilot_admin_|pilot_reset|admin_control_center/);
    expect(CODE).not.toMatch(/CREATE EXTENSION|pg_cron/);
    // courier_assigned stays an EVENT type, never a new ORDER status value.
    expect(CODE).not.toMatch(/status text NOT NULL DEFAULT [^;]*courier_assigned/);
    expect(CODE).not.toMatch(/new_status\s+text NOT NULL CHECK \(new_status IN\s*\([^)]*courier_assigned/);
    expect(CODE).not.toMatch(/\bcourier_assigned\b[^;]*GENERATED ALWAYS/);
    expect(CODE).not.toMatch(/\bADD COLUMN IF NOT EXISTS[^;]*courier_assigned/);
    expect(M50).toContain("status         text NOT NULL DEFAULT 'pending'"); // canonical column untouched
  });

  it('no frontend-facing schema drift: assignment remains courier_user_id on orders', () => {
    expect(M79).not.toMatch(/ADD COLUMN .*courier_user_id/);
    expect(M79).toMatch(/courier_user_id\s*=\s*v_uid/);
    expect(M79).not.toMatch(/courier_user_id\s+uuid PRIMARY KEY/);
  });

  it('documented rollback is complete and mirrors every object created/redefined', () => {
    expect(M79).toMatch(/-- Rollback:/);
    for (const obj of [
      'DROP TABLE public.order_status_history',
      'DROP FUNCTION public.pilot_assert_transition',
      'DROP FUNCTION public.pilot_order_timeline',
      'pilot_order_set_status      (00065 migration body)',
      'pilot_order_accept          (00068 migration body)',
      'pilot_courier_set_status    (00070 migration body)',
      'delivery_create_order       (00069 migration body)',
    ]) {
      expect(M79, obj).toContain(obj);
    }
  });

  it('keeps a post-check DO block that fails loudly on structural drift', () => {
    expect(M79).toMatch(/DO \$\$/);
    expect(M79).toContain('00079: order_status_history missing after migration');
    expect(M79).toContain('00079: lifecycle RPC(s) missing after migration');
    expect(M79).toContain('00079: authenticated has a WRITE grant on order_status_history');
  });
});
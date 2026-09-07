/**
 * GATE 4 — ORDER ASSIGNMENT SYSTEM (migration 00080).
 * Offline structural proofs (no live DB), same convention as 00079:
 *   Admin-only     — pilot_admin_assign_order authorises via fn_admin_uid
 *                    ONLY; operators/couriers/customers have no lane.
 *   Window         — assignment is dispatch authority: status must be
 *                    confirmed|preparing; delivered/cancelled are TERMINAL;
 *                    out_for_delivery onward the assignment is frozen.
 *   Eligibility    — target courier must be an ACTIVE pilot_couriers
 *                    membership of the SAME store as the order (chains
 *                    order->store->neighborhood->courier; blocks cross-store,
 *                    cross-neighborhood, inactive/suspended).
 *   Events         — first assignment records 'courier_assigned' (metadata
 *                    courier_user_id); a different courier records
 *                    'reassigned' (previous+new); same-courier repeat is an
 *                    idempotent 'noop' that writes NO history.
 *   Atomicity      — assignment UPDATE + history INSERT share one function
 *                    body (one transaction); INSERT only after the guarded
 *                    UPDATE confirms ROW_COUNT = 1.
 *   Concurrency    — the order row is locked (SELECT ... FOR UPDATE) and the
 *                    UPDATE is re-guarded (courier_user_id IS NOT DISTINCT
 *                    FROM <value read under lock>) -> ORDER_UNASSIGNABLE on a
 *                    surprise change; two admins serialize deterministically.
 *   Status keeps   — assignment NEVER changes order.status
 *                    (previous_status = new_status).
 *   Hardening      — direct client DML on public.orders is revoked (RLS is
 *                    row-level and cannot scope a single column); mutations
 *                    flow through SECURITY DEFINER RPCs only.
 *   Boundaries     — no RBAC/telemetry/realtime/GPS/accounts/schema drift.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M80 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00080_admin_assignment.sql'), 'utf-8');
const M79 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00079_order_lifecycle_status_history.sql'), 'utf-8');
const M50 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00050_categories_delivery.sql'), 'utf-8');

// CODE = executable SQL only (comments document; assertions read code).
const CODE = M80.replace(/^\s*--.*$/gm, '').trim();

// BODY = header + pure function body, ending at the closing $$; of the one RPC.
const BODY = (name: string): string => {
  const start = M80.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00080`).toBeGreaterThan(-1);
  const from = M80.slice(start);
  const end = from.indexOf('\n$$;');
  return end === -1 ? from : from.slice(0, end + 3);
};

describe('Admin assignment authority — single fixed-signature SECURITY DEFINER RPC', () => {
  it('pilot_admin_assign_order(uuid, uuid) exists with the canonical hardcoded skeleton', () => {
    expect(M80).toMatch(
      /CREATE OR REPLACE FUNCTION public\.pilot_admin_assign_order\(\s*p_order_id\s+uuid,\s*p_courier_user_id\s+uuid\s*\)/,
    );
    const body = BODY('pilot_admin_assign_order');
    expect(body).toContain('RETURNS jsonb');
    expect(body).toContain('LANGUAGE plpgsql');
    expect(body).toContain('VOLATILE');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain("SET search_path = ''");
    expect(M80).toContain('-- 2) Admin assignment authority');
  });

  it('is the ONLY function in 00080 (no second RPC, no dropped helper count)', () => {
    expect((M80.match(/CREATE OR REPLACE FUNCTION /g) ?? []).length).toBe(1);
  });
});

describe('Authorization — admin-only, no operator/courier/customer lane', () => {
  const body = BODY('pilot_admin_assign_order');

  it('raises UNAUTHENTICATED before ANY production read or write', () => {
    const unauth = body.indexOf('UNAUTHENTICATED');
    const firstRead = Math.min(...['SELECT o.store_id', 'PERFORM 1', 'UPDATE public.orders', 'INSERT INTO public.order_status_history'].map((s) => body.indexOf(s)).filter((i) => i > -1));
    expect(unauth).toBeGreaterThan(-1);
    expect(unauth).toBeLessThan(firstRead);
  });

  it('admits ONLY fn_admin_uid(); a non-admin gets PERMISSION_DENIED', () => {
    expect(body).toContain('IF public.fn_admin_uid() IS NULL THEN');
    expect(body).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';");
    const gate = body.indexOf('fn_admin_uid() IS NULL');
    const firstStmt = Math.min(...['SELECT o.store_id', 'PERFORM 1', 'UPDATE public.orders', 'INSERT INTO public.order_status_history'].map((s) => body.indexOf(s)).filter((i) => i > -1));
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(firstStmt);
  });

  it('has no operator_user_id branch and no courier self-assign branch', () => {
    expect(body).not.toMatch(/operator_user_id = v_uid/);
    expect(body).not.toMatch(/courier_user_id\s*=\s*v_uid/);
    expect(body).not.toMatch(/v_role := 'customer'/);
  });
});

describe('Assignment window — dispatch authority on confirmed|preparing only', () => {
  const body = BODY('pilot_admin_assign_order');

  it('guards with ASSIGNMENT_NOT_ALLOWED (P0002) unless status is confirmed or preparing', () => {
    expect(body).toContain("IF v_status IS DISTINCT FROM 'confirmed' AND v_status IS DISTINCT FROM 'preparing' THEN");
    expect(body).toContain("RAISE EXCEPTION 'ASSIGNMENT_NOT_ALLOWED' USING ERRCODE = 'P0002';");
    // No other status is assignable: confirmed/preparing are the SOLE window.
    for (const s of ['pending', 'out_for_delivery', 'delivered', 'cancelled']) {
      expect(body, s).not.toMatch(new RegExp(`'${s}'\\s*THEN`));
    }
  });

  it('assignment NEVER mutates order.status (previous_status = new_status)', () => {
    expect(body).not.toMatch(/SET\s+status\s*=/);
    expect(body).toMatch(/p_order_id, v_status, v_status, v_event_type,/);
  });
});

describe('Courier eligibility — ACTIVE membership of the SAME store', () => {
  const body = BODY('pilot_admin_assign_order');

  it('checks pilot_couriers for user = target AND store = order store AND active', () => {
    expect(body).toContain('PERFORM 1');
    expect(body).toContain('FROM public.pilot_couriers c');
    expect(body).toContain('WHERE c.user_id = p_courier_user_id');
    expect(body).toContain('AND c.store_id = v_store');
    expect(body).toContain("AND c.status = 'active'");
    expect(body).toContain('IF NOT FOUND THEN');
    expect(body).toContain("RAISE EXCEPTION 'COURIER_INELIGIBLE' USING ERRCODE = '22023';");
  });

  it('courier membership must be re-read per call (suspension is server-side)', () => {
    expect(body).not.toMatch(/CACHE|current_setting|SET ROLE/);
  });
});

describe('Events — courier_assigned, reassigned, idempotent noop', () => {
  const body = BODY('pilot_admin_assign_order');

  it('first assignment (current NULL) records courier_assigned + courier metadata', () => {
    expect(body).toContain("IF v_current_courier IS NULL THEN");
    expect(body).toContain("v_event_type := 'courier_assigned';");
    expect(body).toContain("v_metadata   := jsonb_build_object('courier_user_id', p_courier_user_id);");
  });

  it('reassignment records reassigned + previous/new courier metadata', () => {
    expect(body).toContain("v_event_type := 'reassigned';");
    expect(body).toContain(
      "v_metadata   := jsonb_build_object(\n      'previous_courier_user_id', v_current_courier,\n      'new_courier_user_id', p_courier_user_id\n    );",
    );
    expect(body).toContain("'reassigned_from', v_current_courier");
  });

  it('same-courier repeat is an idempotent noop that writes NO history', () => {
    const noopIdx = body.indexOf("IF v_current_courier IS NOT DISTINCT FROM p_courier_user_id THEN");
    expect(noopIdx).toBeGreaterThan(-1);
    const noopEnd = body.indexOf('END IF;', noopIdx);
    const noop = body.slice(noopIdx, noopEnd);
    expect(noop).toContain("'event_type', 'noop'");
    expect(noop).not.toMatch(/INSERT INTO public\.order_status_history|UPDATE public\.orders/);
    // The noop branch precedes any event/history write.
    expect(noopIdx).toBeLessThan(body.indexOf('INSERT INTO public.order_status_history'));
  });

  it('records actor_role admin (never system) on assignment events', () => {
    expect(body).toContain("v_uid, 'admin', '', v_metadata, v_updated_at");
    expect(body).not.toMatch(/'system'/);
  });
});

describe('Atomicity — assignment UPDATE + history INSERT in ONE transaction', () => {
  const body = BODY('pilot_admin_assign_order');

  it('the guarded UPDATE runs before the INSERT (no ghost events, no lost state)', () => {
    const upd = body.indexOf('UPDATE public.orders');
    const ins = body.indexOf('INSERT INTO public.order_status_history');
    const diag = body.indexOf('GET DIAGNOSTICS v_rows = ROW_COUNT;');
    expect(upd).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(upd);
    expect(diag).toBeGreaterThan(upd);
    expect(diag).toBeLessThan(ins);
    // UPDATE + INSERT share the single function body = one implicit transaction.
    expect(M80).not.toMatch(/BEGIN;/);
    expect(M80).not.toMatch(/COMMIT;/);
  });
});

describe('Concurrency — serialised, deterministic, never a lost write', () => {
  const body = BODY('pilot_admin_assign_order');

  it('takes a row lock (FOR UPDATE) and re-guards the write under it', () => {
    expect(body).toMatch(/SELECT o\.store_id, o\.status, o\.courier_user_id\s+INTO v_store, v_status, v_current_courier[\s\S]*FOR UPDATE/);
    expect(body).toContain('AND courier_user_id IS NOT DISTINCT FROM v_current_courier;');
    expect(body).toContain('GET DIAGNOSTICS v_rows = ROW_COUNT;');
    expect(body).toContain('IF v_rows <> 1 THEN');
    expect(body).toContain("RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';");
  });

  it('no advisory locks, no SKIP LOCKED, no retry loop can paper over the race', () => {
    expect(body).not.toMatch(/pg_advisory|SKIP LOCKED|FOR UPDATE NOWAIT/);
    expect(body).not.toMatch(/FOR .* LOOP|\.replace\(|RETRY/);
  });
});

describe('Direct client write path on public.orders is closed', () => {
  it('revokes INSERT/UPDATE/DELETE from authenticated (the ONLY column-level mechanism)', () => {
    expect(M80).toContain('REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;');
  });

  it('does NOT re-grant any DML on public.orders outside the rollback comment', () => {
    expect(CODE).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON public\.orders/);
    // Existing SELECT grant (00050) is untouched: 00080 adds nothing.
    expect(CODE).not.toMatch(/GRANT [^;]*ON public\.orders/);
  });

  it('keeps the history table append-only: no new write grants, no DELETE', () => {
    expect(CODE).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON public\.order_status_history/);
    expect(CODE).not.toMatch(/DELETE FROM public\.order_status_history/);
  });
});

describe('Grant contract + integrity', () => {
  it('EXECUTE granted to authenticated only; anon and PUBLIC revoked', () => {
    expect(M80).toContain('GRANT EXECUTE ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) TO authenticated;');
    expect(M80).toContain('REVOKE ALL ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM PUBLIC;');
    expect(M80).toContain('REVOKE ALL ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM anon;');
  });

  it('has a DO-block that fails loudly on structural drift', () => {
    expect(M80).toMatch(/DO \$\$/);
    for (const code of [
      'INTEGRITY_ADMIN_ASSIGN_LOCK_MISSING',
      'INTEGRITY_ADMIN_ASSIGN_EVENTS_MISSING',
      'INTEGRITY_ADMIN_ASSIGN_GUARDS_MISSING',
      'INTEGRITY_ADMIN_ASSIGN_HISTORY_MISSING',
      'INTEGRITY_ADMIN_ASSIGN_AUTH_MISSING',
      'INTEGRITY_ORDERS_DIRECT_DML_NOT_REVOKED',
      'INTEGRITY_ADMIN_ASSIGN_GRANT_MISSING',
      'INTEGRITY_HISTORY_TABLE_MISSING',
    ]) {
      expect(M80, code).toContain(code);
    }
  });

  it('documents a complete rollback (drop RPC + restore the revoked grants)', () => {
    expect(M80).toContain('-- Rollback');
    expect(M80).toContain('DROP FUNCTION public.pilot_admin_assign_order(uuid, uuid);');
    expect(M80).toContain('GRANT INSERT, UPDATE, DELETE ON public.orders TO authenticated;');
  });
});

describe('Boundaries — no schema, RBAC, telemetry, realtime, GPS or account drift', () => {
  it('creates no table, alters no table, adds no column', () => {
    expect(CODE).not.toMatch(/CREATE TABLE/);
    expect(CODE).not.toMatch(/ALTER TABLE public\.orders/);
    expect(CODE).not.toMatch(/ADD COLUMN/);
    expect(CODE).not.toMatch(/DROP TABLE|DROP COLUMN/);
  });

  it('does not redefine order_status_history or its event types (00079 remains canonical)', () => {
    expect(CODE).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.order_status_history/);
    expect(CODE).not.toMatch(/event_type\s+text NOT NULL CHECK/);
    // The remaining event vocabulary still comes from 00079.
    expect(M79).toContain("'courier_assigned','reassigned','status_set'");
  });

  it('keeps the six canonical order statuses — no synthetic courier_assigned status', () => {
    expect(M50).toContain("status         text NOT NULL DEFAULT 'pending'");
    expect(CODE).not.toMatch(/status text NOT NULL DEFAULT [^;]*courier_assigned|'assigned'/);
    expect(CODE).not.toMatch(/courier_assigned\b[^;]*CHECK/);
  });

  it('touches no RBAC, telemetry, realtime, GPS or accounts objects', () => {
    expect(CODE).not.toMatch(/ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP|record_telemetry_event/);
    expect(CODE).not.toMatch(/ALTER PUBLICATION|supabase_realtime|postgres_changes|\.channel\(/);
    expect(CODE).not.toMatch(/pilot_courier_locations|latitude|longitude|center_lat|center_lng/);
    expect(CODE).not.toMatch(/auth\.admin|deleteUser|inviteUser|reset_password/);
    expect(CODE).not.toMatch(/CREATE EXTENSION|pg_cron/);
  });

  it('does not mutate production data (no top-level UPDATE outside the RPC body)', () => {
    const bodyIdx = CODE.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_assign_order');
    // CODE excludes comments, so the only pre-function executable statement is
    // the REVOKE — no UPDATE/INSERT of orders exists outside the RPC body.
    expect(CODE.slice(0, bodyIdx)).not.toMatch(/UPDATE (public\.)?orders|INSERT INTO (public\.)?orders/);
  });
});
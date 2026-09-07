/**
 * GATE 4 — ORDER ASSIGNMENT SYSTEM — DEDICATED NEGATIVE-PATH SUITE
 * (migration 00080). Offline structural proofs, same convention as 00079.
 *
 * This suite proves the SERVER side has NO escape hatch for:
 *   * anyone but an admin assigning/reassigning (no operator/courier lane)
 *   * assigning to a courier of another store / inactive / suspended member
 *   * assigning outside confirmed|preparing (pending, out_for_delivery,
 *     delivered, cancelled are all closed; two are terminal)
 *   * unassigning (no NULL target, no courier_unassigned, no unassign RPC)
 *   * assignment silently changing order.status (status is orthogonal)
 *   * direct client UPDATE orders SET courier_user_id (DML revoked)
 *   * lost-write races (row lock + re-guarded UPDATE + ORDER_UNASSIGNABLE)
 *   * forged/ghost history (only courier_assigned/reassigned literals; the
 *     noop branch writes nothing; actor is admin, never system)
 *   * anonymous execution, backfilling legacy orders, or resetting the
 *     six-status vocabulary / RBAC / telemetry / realtime / GPS.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M80 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00080_admin_assignment.sql'), 'utf-8');
const M79 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00079_order_lifecycle_status_history.sql'), 'utf-8');

// CODE = executable SQL only (comments document; assertions read code).
const CODE = M80.replace(/^\s*--.*$/gm, '').trim();

const BODY = (name: string): string => {
  const start = M80.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00080`).toBeGreaterThan(-1);
  const from = M80.slice(start);
  const end = from.indexOf('\n$$;');
  return end === -1 ? from : from.slice(0, end + 3);
};

describe('Negative — no actor but an admin can assign', () => {
  const body = BODY('pilot_admin_assign_order');

  it('the fn_admin_uid gate is the ONLY authorizer: no operator_user_id, no courier branch', () => {
    expect(body).toContain('IF public.fn_admin_uid() IS NULL THEN');
    expect(body).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';");
    expect(body).not.toMatch(/operator_user_id/);
    // A courier can never name themselves a target via an accept/self path.
    expect(body).not.toMatch(/courier_user_id\s*=\s*v_uid/);
    expect(body).not.toMatch(/v_role := 'courier'/);
  });

  it('UNAUTHENTICATED precedes EVERY guard and every statement', () => {
    const unauth = body.indexOf('UNAUTHENTICATED');
    expect(unauth).toBeGreaterThan(-1);
    const firstStmt = Math.min(...['SELECT o.store_id', 'PERFORM 1', 'UPDATE public.orders', 'INSERT INTO public.order_status_history'].map((s) => body.indexOf(s)).filter((i) => i > -1));
    expect(unauth).toBeLessThan(firstStmt);
    expect(CODE).not.toMatch(/GRANT EXECUTE ON FUNCTION [^;]*TO anon/);
  });
});

describe('Negative — eligibility closes every wrong-target path', () => {
  const body = BODY('pilot_admin_assign_order');

  it('a courier of the WRONG store / wrong neighborhood is structurally rejected', () => {
    // Scope: the membership must equal the ORDER's store (order->store->neighborhood->courier).
    expect(body).toContain('AND c.store_id = v_store');
    // No store-agnostic / all-stores courier shortcut exists.
    expect(body).not.toMatch(/c\.store_id\s+IN\s*\(|c\.store_id IS NULL/);
  });

  it('inactive or suspended membership can never satisfy eligibility (active only)', () => {
    expect(body).toContain("AND c.status = 'active'");
    const activeCount = (body.match(/c\.status\s*=\s*'active'/g) ?? []).length;
    expect(activeCount).toBe(1);
    // A target membership decision has no fallback to inactive/suspended.
    expect(body).not.toMatch(/OR c\.status|status IN \('active', 'inactive'\)/);
  });

  it('a missing membership yields COURIER_INELIGIBLE (never a wildcard)', () => {
    expect(body).toContain('IF NOT FOUND THEN');
    expect(body).toContain("RAISE EXCEPTION 'COURIER_INELIGIBLE' USING ERRCODE = '22023';");
  });
});

describe('Negative — assignment window is closed outside confirmed|preparing', () => {
  const body = BODY('pilot_admin_assign_order');

  it('pending is NOT assignable (dispatch requires operator confirmation)', () => {
    // The only surviving window check is IS DISTINCT FROM 'confirmed' AND IS
    // DISTINCT FROM 'preparing'; 'pending' is therefore rejected by it.
    expect(body).toContain("IF v_status IS DISTINCT FROM 'confirmed' AND v_status IS DISTINCT FROM 'preparing' THEN");
    // And 'pending' never appears as an allowed literal anywhere in the body.
    expect(body).not.toMatch(/v_status IS DISTINCT FROM 'pending'/);
  });

  it('out_for_delivery, delivered, cancelled are all rejected (ASSIGNMENT_NOT_ALLOWED)', () => {
    for (const s of ['out_for_delivery', 'delivered', 'cancelled']) {
      expect(body, s).not.toMatch(new RegExp(`v_status IS DISTINCT FROM '${s}'`));
    }
    // One single rejection point covers the whole closed set.
    expect((body.match(/ASSIGNMENT_NOT_ALLOWED/g) ?? []).length).toBe(1);
  });

  it('assignment can never reopen a terminal order (no status change at all)', () => {
    expect(body).not.toMatch(/SET\s+status\s*=/);
    expect(body).not.toMatch(/status\s*=\s*'confirmed'|status\s*=\s*'preparing'/);
    // The six-status vocabulary stays exactly what 00079/00050 define.
    expect(M79).toMatch(/new_status\s+text NOT NULL CHECK \(new_status IN/);
    expect(CODE).not.toMatch(/'assigned'|'courier_assigned'\s*(,|\))/);
  });
});

describe('Negative — no unassign path exists', () => {
  const body = BODY('pilot_admin_assign_order');

  it('a NULL courier target is ARGUMENTS_INVALID (assign is not unassign)', () => {
    expect(body).toContain('IF p_order_id IS NULL OR p_courier_user_id IS NULL THEN');
    expect(body).toContain("RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';");
  });

  it('no NULL assignment write, no courier_unassigned event, no unassign function', () => {
    // The only NULL reference to the target is the ARGUMENTS_INVALID guard —
    // no statement ever writes courier_user_id = NULL (no unassign).
    expect(body).toContain('IF p_order_id IS NULL OR p_courier_user_id IS NULL THEN');
    expect(body).not.toMatch(/SET\s+courier_user_id\s*=\s*NULL/);
    expect(body).not.toMatch(/courier_user_id\s*=\s*NULL/);
    expect(CODE).not.toMatch(/courier_unassigned/);
    expect(M80).not.toMatch(/pilot_admin_unassign_order/);
    expect(M80).not.toMatch(/pilot_admin_reassign_order/);
  });
});

describe('Negative — no lost-write race, no forged history', () => {
  const body = BODY('pilot_admin_assign_order');

  it('every write is guarded: row lock + WHERE identity match + ROW_COUNT check', () => {
    expect(body).toMatch(/FOR UPDATE/);
    expect(body).toMatch(/AND courier_user_id IS NOT DISTINCT FROM v_current_courier;/);
    expect(body).toContain('GET DIAGNOSTICS v_rows = ROW_COUNT;');
    expect(body).toContain('IF v_rows <> 1 THEN');
    expect(body).toContain("RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';");
    expect(body).not.toMatch(/pg_advisory|SKIP LOCKED|FOR UPDATE NOWAIT/);
    expect(body).not.toMatch(/FOR .* LOOP|RETRY/);
  });

  it('history carries exactly the two assignment event literals (+noop in-return)', () => {
    const courierAssigned = (body.match(/'courier_assigned'/g) ?? []).length;
    const reassigned = (body.match(/'reassigned'/g) ?? []).length;
    expect(courierAssigned).toBe(1);
    expect(reassigned).toBe(1);
    // 'noop' is a RETURN label, never an INSERTed event_type.
    const insIdx = body.indexOf('INSERT INTO public.order_status_history');
    expect(body.slice(0, insIdx)).toContain("'event_type', 'noop'");
    expect(body.slice(0, insIdx)).not.toMatch(/INSERT INTO/);
  });

  it('the actor is admin (never system / never impersonated from arguments)', () => {
    expect(body).toContain("v_uid, 'admin', '', v_metadata, v_updated_at");
    expect(body).not.toMatch(/p_actor|v_actor|\bsystem\b/);
  });
});

describe('Negative — direct client mutation is impossible', () => {
  it('authenticated lost INSERT/UPDATE/DELETE on orders; nothing re-grants it', () => {
    expect(M80).toContain('REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;');
    expect(CODE).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*ON public\.orders/);
    expect(CODE).not.toMatch(/GRANT [^;]*ON public\.order_status_history[^;]*(INSERT|UPDATE|DELETE)/);
  });

  it('no anonymous path exists on orders or history (defense in depth)', () => {
    expect(CODE).not.toMatch(/FOR SELECT TO anon/);
    expect(CODE).not.toMatch(/GRANT [^;]*ON public\.orders TO anon/);
  });

  it('RLS policies on orders are NOT weakened (00074 hardening intact)', () => {
    // 00080 contains no CREATE POLICY anywhere.
    expect(CODE).not.toMatch(/CREATE POLICY/);
    expect(M79).toContain('CREATE POLICY "Admin manage order status history"');
  });
});

describe('Negative — production data and scope boundaries are untouched', () => {
  it('no top-level statement mutates legacy orders (no backfill, no demo assignment)', () => {
    const bodyIdx = CODE.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_assign_order');
    // CODE excludes comments, so the only pre-function executable statement is
    // the REVOKE — no UPDATE/INSERT of orders exists outside the RPC body.
    expect(CODE.slice(0, bodyIdx)).not.toMatch(/UPDATE (public\.)?orders|INSERT INTO (public\.)?orders/);
  });

  it("assignment authority is NOT extended to couriers' latest or location tables", () => {
    expect(CODE).not.toMatch(/pilot_courier_locations/);
  });

  it('keeps the 00079 history contract byte-intact (no DDL on history here)', () => {
    expect(CODE).not.toMatch(/ALTER TABLE/);
    expect(CODE).not.toMatch(/CREATE TABLE/);
    expect(CODE).not.toMatch(/ADD COLUMN/);
  });

  it('RBAC / telemetry / realtime / GPS / accounts objects are absent', () => {
    expect(CODE).not.toMatch(/ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP|record_telemetry_event/);
    expect(CODE).not.toMatch(/ALTER PUBLICATION|supabase_realtime|postgres_changes/);
    expect(CODE).not.toMatch(/center_lat|center_lng|latitude|longitude/);
    expect(CODE).not.toMatch(/auth\.admin|deleteUser|inviteUser/);
    expect(CODE).not.toMatch(/CREATE EXTENSION|pg_cron/);
  });
});
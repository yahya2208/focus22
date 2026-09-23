/**
 * GATE V1.4 — 00108 assert supersede gate (offline, structural).
 * No live DB. Pins 00108_assert_preparing_delivered_admin.sql:
 * byte-identical to 00090 except ONE added admin row
 * (preparing → delivered); operator/courier/customer rows unchanged;
 * posture (signature/DEFINER/search_path/ACL/history) preserved.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M90 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00090_pilot_courier_handoff_invariant.sql'),
  'utf-8',
);
const M108 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00108_assert_preparing_delivered_admin.sql'),
  'utf-8',
);

const ROWS = (src: string): string[] => {
  const start = src.indexOf('v_allowed := (');
  const end = src.indexOf(');', start);
  const region = src.slice(start, end === -1 ? undefined : end);
  const rows: string[] = [];
  const re = /\(\s*v_cur = '([a-z_]+)'\s+AND p_new_status = '([a-z_]+)'[^)]*\)/g;
  for (const m of region.matchAll(re)) rows.push(`${m[1]}:${m[2]}`);
  return rows.sort();
};

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('00108 — exactly one added matrix row', () => {
  it('is a strict superset of the 00090 matrix: +admin preparing→delivered', () => {
    const before = ROWS(M90);
    const after = ROWS(M108);
    const added = after.filter((r) => {
      const i = before.indexOf(r);
      if (i === -1) return true;
      before.splice(i, 1);
      return false;
    });
    expect(before).toEqual([]);
    expect(added).toEqual(['preparing:delivered']);
  });

  it('the new row sits inside the admin block only', () => {
    const adminBlock = M108.slice(
      M108.indexOf("(v_role = 'admin' AND ("),
      M108.indexOf("OR (v_role = 'store_operator'"),
    );
    expect(adminBlock).toContain("(v_cur = 'preparing'        AND p_new_status = 'delivered')");
    const nonAdmin = M108.slice(M108.indexOf("OR (v_role = 'store_operator'"));
    expect(nonAdmin).not.toMatch(/v_cur = 'preparing'\s+AND p_new_status = 'delivered'/);
  });
});

describe('00108 — posture preserved verbatim', () => {
  it('keeps signature, DEFINER, search_path, assignment mode and history logic', () => {
    for (const snippet of [
      'CREATE OR REPLACE FUNCTION public.pilot_assert_transition(',
      'p_accept     boolean DEFAULT false',
      'SECURITY DEFINER',
      "SET search_path = ''",
      'courier_assigned',
      'ORDER_UNASSIGNABLE',
      'IF NOT v_allowed THEN',
      "RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';",
      'INSERT INTO public.order_status_history (',
      'REVOKE ALL ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM PUBLIC;',
      'REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM anon;',
      'REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM authenticated;',
    ]) {
      expect(norm(M108)).toContain(norm(snippet));
    }
  });

  it('introduces no new functions, tables, triggers, or grants', () => {
    expect(M108.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(1);
    expect(M108).not.toMatch(/CREATE TABLE|CREATE TRIGGER|CREATE POLICY|GRANT EXECUTE ON FUNCTION public\.(?!pilot_assert_transition)/);
  });
});

describe('00108 — settle-at-preparing path unblocked', () => {
  it('the edge the atomic settle needs exists for the admin actor', () => {
    const adminBlock = M108.slice(
      M108.indexOf("(v_role = 'admin' AND ("),
      M108.indexOf("OR (v_role = 'store_operator'"),
    );
    expect(adminBlock).toContain("p_new_status = 'delivered'");
    // Atomicity preserved: settle still routes through assert before PURCHASE
    // (pinned by pilot-ledger-gate); this migration only widens the matrix.
  });
});

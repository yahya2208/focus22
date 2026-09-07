/**
 * Neighborhood Pilot — pilot account provisioning & admin approval (00081).
 * Offline, structural: asserts the migration closes the Gate-5 gaps on top of
 * the existing 00070 approval layer WITHOUT re-inventing accounts or touching
 * the order/lifecycle/assignment RPCs or the global RBAC model.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M81 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00081_pilot_account_provisioning.sql'), 'utf-8');

const FN = (name: string): string => {
  const start = M81.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined in 00081`).toBeGreaterThan(-1);
  const tail = M81.slice(start);
  const end = tail.search(/\nCREATE OR REPLACE FUNCTION public\.|\nGRANT EXECUTE ON FUNCTION public\./);
  return end === -1 ? tail : tail.slice(0, end);
};

const GRANT_ONLY_AUTHENTICATED = (name: string): void => {
  const i = M81.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(i, `${name} must be defined in 00081`).toBeGreaterThan(-1);
  const h = M81.slice(i);
  const block = h.slice(0, Math.max(h.indexOf('\n-- ===='), 0));
  expect(block).toContain('GRANT EXECUTE ON FUNCTION public');
  expect(block).toContain('TO authenticated');
  expect(block).toContain('REVOKE ALL ON FUNCTION public');
  expect(block).toContain('FROM PUBLIC');
  expect(block).toContain('FROM anon');
};

describe('00081 — boundaries preserved (Gate-5 brief §5/§30/§38-§40)', () => {
  it('introduces no global RBAC change and no auth-table/account creation', () => {
    expect(M81).not.toMatch(/ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP/);
    expect(M81).not.toMatch(/ALTER TABLE public\.(users|roles|orders|stores)/);
    expect(M81).not.toMatch(/INSERT INTO auth\.users/);
    expect(M81).not.toMatch(/auth\.admin|sign[Uu]p|create_user|user_manager/);
    expect(M81).not.toMatch(/service_role/);
  });

  it('never touches the order/lifecycle/assignment/telemetry surfaces', () => {
    for (const r of [
      'pilot_order_accept',
      'pilot_order_set_status',
      'pilot_assert_transition',
      'pilot_admin_assign_order',
      'record_telemetry_event',
      'pilot_courier_set_status',
      'pilot_reset',
    ]) {
      expect(M81).not.toContain(`FUNCTION public.${r}`);
    }
    expect(M81).not.toMatch(/ALTER TABLE public\.(order_status_history|orders|settings)/);
    expect(M81).not.toMatch(/geolocation|\blat\b|longitude/);
  });

  it('reuses rather than recreates the membership ledgers', () => {
    expect(M81).not.toContain('CREATE TABLE IF NOT EXISTS public.pilot_store_operators');
    expect(M81).not.toContain('CREATE TABLE IF NOT EXISTS public.pilot_couriers');
    expect(M81).toContain('CREATE TABLE IF NOT EXISTS public.pilot_membership_history');
  });
});

describe('00081 — audit ledger (brief §13)', () => {
  it('defines the append-only membership history ledger', () => {
    expect(M81).toMatch(/member_kind\s+text NOT NULL CHECK \(member_kind IN \('operator', 'courier'\)\)/);
    expect(M81).toContain('event_type   text NOT NULL CHECK (event_type IN');
    expect(M81).toContain('actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL');
    expect(M81).toContain("actor_role    text NOT NULL CHECK (actor_role IN ('admin'))");
  });

  it('is admin-read-only — no client write grants whatsoever', () => {
    expect(M81).toContain('GRANT SELECT ON public.pilot_membership_history TO authenticated;');
    expect(M81).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public\.pilot_membership_history/);
  });

  it('writes ledger events only inside the admin RPCs (same transaction)', () => {
    expect(FN('pilot_write_membership_event')).toContain('INSERT INTO public.pilot_membership_history');
    const setter = FN('pilot_admin_set_operator_status');
    expect(setter).toContain('pilot_write_membership_event');
    expect(FN('pilot_admin_set_courier_status')).toContain('pilot_write_membership_event');
    expect(FN('pilot_admin_set_courier')).toContain('pilot_write_membership_event');
  });
});

describe('00081 — operator approval (state machine §12, exclusivity §14, sync §14)', () => {
  const OP = FN('pilot_admin_set_operator_status');

  it('is SECURITY DEFINER with fixed search_path and serializes on the store', () => {
    expect(OP).toContain('SECURITY DEFINER');
    expect(OP).toContain("SET search_path = ''");
    expect(OP).toMatch(/FROM public\.stores WHERE id = p_store_id FOR UPDATE/);
    expect(OP).toContain('STORE_NOT_FOUND');
  });

  it('enforces the operator transition matrix', () => {
    expect(OP).toContain("(v_old = ''          AND p_status = 'pending')");
    expect(OP).toContain("OR (v_old = 'pending'    AND p_status = 'active')");
    expect(OP).toContain("OR (v_old = 'active'     AND p_status = 'suspended')");
    expect(OP).toContain("OR (v_old = 'suspended'  AND p_status = 'active')");
    expect(OP).toContain('OR v_old = p_status');
    expect(OP).toContain("RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED'");
  });

  it('approvals are recorded as events by an admin actor with old->new state', () => {
    expect(OP).toContain("'operator', p_store_id, p_user_id, v_old, p_status, v_uid");
  });

  it('demotes the previous active operator and enforces one active per store', () => {
    expect(OP).toContain("WHERE store_id = p_store_id AND status = 'active'");
    expect(OP).toContain("SET status = 'pending'");
    expect(OP).toContain("'replaced as active operator'");
    expect(M81).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS pilot_store_operators_one_active/);
  });

  it('keeps stores.operator_user_id = the single active operator (or clears)', () => {
    expect(OP).toContain("IF p_status = 'active' THEN");
    expect(OP).toContain('SET operator_user_id = p_user_id, updated_at = now()');
    expect(OP).toContain('SET operator_user_id = NULL, updated_at = now()');
  });

  it('preserves approved_by/approved_at on deactivation', () => {
    expect(OP).toContain('ELSE pilot_store_operators.approved_by END');
    expect(OP).toContain('ELSE pilot_store_operators.approved_at END');
  });

  it('is granted to authenticated only', () => {
    GRANT_ONLY_AUTHENTICATED('pilot_admin_set_operator_status');
  });
});

describe('00081 — courier approval (state machine §12, membership §15)', () => {
  const CR = FN('pilot_admin_set_courier_status');

  it('is SECURITY DEFINER with fixed search_path and serializes on the store', () => {
    expect(CR).toContain('SECURITY DEFINER');
    expect(CR).toContain("SET search_path = ''");
    expect(CR).toMatch(/FROM public\.stores WHERE id = p_store_id FOR UPDATE/);
  });

  it('enforces the courier transition matrix', () => {
    expect(CR).toContain("(v_old = ''         AND p_status = 'pending')");
    expect(CR).toContain("OR (v_old = 'pending'   AND p_status = 'active')");
    expect(CR).toContain("OR (v_old = 'active'    AND p_status IN ('inactive', 'suspended'))");
    expect(CR).toContain("OR (v_old = 'inactive'  AND p_status = 'active')");
    expect(CR).toContain("OR (v_old = 'suspended' AND p_status = 'active')");
    expect(CR).toContain('OR v_old = p_status');
    expect(CR).toContain("RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED'");
  });

  it('upserts via the UNIQUE(user_id, store_id) key — no duplicate memberships', () => {
    expect(CR).toContain('ON CONFLICT (user_id, store_id) DO UPDATE SET');
  });

  it('records the courier event with actor + old->new state', () => {
    expect(CR).toContain("'courier', p_store_id, p_user_id, v_old, p_status, v_uid");
  });

  it('is granted to authenticated only', () => {
    GRANT_ONLY_AUTHENTICATED('pilot_admin_set_courier_status');
  });
});

describe('00081 — legacy pilot_admin_set_courier bypass closed (brief §8/§20)', () => {
  const LG = FN('pilot_admin_set_courier(');

  it('still exists with the 00068 signature but creates memberships as pending', () => {
    expect(LG).toContain('CREATE OR REPLACE FUNCTION public.pilot_admin_set_courier(');
    expect(LG).toContain('p_active boolean');
    expect(LG).toContain("INSERT INTO public.pilot_couriers (user_id, store_id, status)");
    expect(LG).toContain("VALUES (p_user_id, p_store_id, 'pending')");
    expect(LG).toContain("status', 'pending', 'event_type', 'pending'");
  });

  it('routes existing members through the courier state machine', () => {
    expect(LG).toContain("v_target := CASE WHEN COALESCE(p_active, TRUE) THEN 'active' ELSE 'inactive' END;");
    expect(LG).toContain("RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED'");
  });

  it('never provisions an instant-active membership', () => {
    expect(LG).not.toMatch(/VALUES \(p_user_id, p_store_id, 'active'\)/);
  });

  it('is granted to authenticated only', () => {
    GRANT_ONLY_AUTHENTICATED('pilot_admin_set_courier');
  });
});

describe('00081 — admin user lookup (brief §22/§25)', () => {
  const FU = FN('pilot_admin_find_users');

  it('finds existing REAL identities by normalized exact email, admin-guarded', () => {
    expect(FU).toContain('SECURITY DEFINER');
    expect(FU).toContain("SET search_path = ''");
    expect(FU).toContain("RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'");
    expect(FU).toMatch(/SELECT jsonb_build_object\(/);
    expect(FU).toMatch(/jsonb_build_object\([\s\S]{0,120}'user_id',/);
  });

  it('clamps the result limit and never exposes account secrets', () => {
    expect(FU).toContain("p_limit IS NULL OR p_limit < 1 OR p_limit > 100");
    expect(FU).toContain("btrim(lower(COALESCE(p_email, '')))");
    expect(FU).not.toMatch(/password|encrypted_password|secret|token|raw_user_meta_data/);
  });

  it('includes the user’s current pilot memberships for a safe UI decision', () => {
    expect(FU).toContain("'operator_memberships', COALESCE((");
    expect(FU).toContain("'courier_memberships', COALESCE((");
  });

  it('is granted to authenticated only — never anon', () => {
    GRANT_ONLY_AUTHENTICATED('pilot_admin_find_users');
    const i = M81.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_find_users');
    const block = M81.slice(i, M81.indexOf('\nCREATE OR REPLACE FUNCTION public.pilot_admin_set_operator_status'));
    expect(block).toContain('REVOKE ALL ON FUNCTION public.pilot_admin_find_users(text, integer) FROM anon');
  });
});

describe('00081 — post-apply integrity gate', () => {
  it('fails loudly on structural drift', () => {
    expect(M81).toContain("RAISE EXCEPTION 'INTEGRITY_OPERATOR_TRANSITIONS_MISSING'");
    expect(M81).toContain("RAISE EXCEPTION 'INTEGRITY_OPERATOR_AUDIT_MISSING'");
    expect(M81).toContain("RAISE EXCEPTION 'INTEGRITY_LEGACY_BYPASS_OPEN'");
    expect(M81).toContain("RAISE EXCEPTION 'INTEGRITY_LEDGER_DIRECT_WRITE_OPEN'");
    expect(M81).toContain("RAISE EXCEPTION 'INTEGRITY_OPERATOR_EXCLUSIVITY_MISSING'");
  });
});
/**
 * Neighborhood Pilot — pilot account provisioning (00081) NEGATIVE suite.
 * Offline, structural. Asserts the illegal membership transitions are NOT
 * reachable through any admin path, that instant-active provisioning cannot be
 * expressed, and that the ids/no-op/concurrency guards keep the audit ledger
 * truthful. Space-normalized so SQL formatting cannot weaken the matrix.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const M81 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00081_pilot_account_provisioning.sql'), 'utf-8');

const OP = M81.slice(
  M81.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_set_operator_status'),
  M81.indexOf('\nCREATE OR REPLACE FUNCTION public.pilot_admin_set_courier_status'),
);
const CR = M81.slice(
  M81.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_set_courier_status'),
  M81.indexOf('\nCREATE OR REPLACE FUNCTION public.pilot_admin_set_courier('),
);
const LG = M81.slice(
  M81.indexOf('CREATE OR REPLACE FUNCTION public.pilot_admin_set_courier('),
  M81.indexOf('\nDO $$'),
);

const forbid = (src: string, re: RegExp, msg: string): void => {
  expect(re.test(src), msg).toBe(false);
};

const TRAN = (from: string, to: string): RegExp =>
  new RegExp(`v_old\\s*=\\s*'${from}'\\s+AND\\s+p_status\\s*=\\s*'${to}'`);

describe('operator state machine — illegal jumps are unreachable (§12)', () => {
  it('cannot skip the provisioning step (no instant-active/suspended/inactive)', () => {
    forbid(OP, TRAN('', 'active'), 'operator provision must land in pending, never active');
    forbid(OP, TRAN('', 'suspended'), 'operator provision must land in pending, never suspended');
    forbid(OP, TRAN('', 'inactive'), 'inactive is not an operator status');
  });

  it('cannot downgrade an active operator to pending or bypass to suspended', () => {
    forbid(OP, TRAN('active', 'pending'), 'active operator can only be suspended, never reset to pending');
    forbid(OP, TRAN('pending', 'suspended'), 'pending operator can only be approved, never suspended');
    forbid(OP, TRAN('pending', 'inactive'), 'pending operator can only be approved');
  });

  it('cannot reactivate a suspended operator into anything but active', () => {
    forbid(OP, TRAN('suspended', 'pending'), 'suspended operator can only be reactivated / stay suspended');
    forbid(OP, TRAN('suspended', 'inactive'), 'suspended operator can only be reactivated');
  });

  it('idempotent repeats produce NO approval side-effects', () => {
    expect(OP).toContain('IF v_old = p_status THEN');
    expect(OP).toContain("'event_type', 'noop'");
    expect(OP).toMatch(/RETURN jsonb_build_object\([\s\S]*'event_type', 'noop'/);
  });
});

describe('courier state machine — illegal jumps are unreachable (§12/§15)', () => {
  it('cannot skip the provisioning step', () => {
    forbid(CR, TRAN('', 'active'), 'courier provision must land in pending, never active');
    forbid(CR, TRAN('', 'inactive'), 'courier provision must land in pending, never inactive');
    forbid(CR, TRAN('', 'suspended'), 'courier provision must land in pending, never suspended');
  });

  it('cannot bypass pending or revert active to pending', () => {
    forbid(CR, TRAN('pending', 'inactive'), 'pending courier can only be approved');
    forbid(CR, TRAN('pending', 'suspended'), 'pending courier can only be approved');
    forbid(CR, TRAN('active', 'pending'), 'active courier can only be deactivated or suspended');
  });

  it('cannot slide between inactive/suspended without going through active', () => {
    forbid(CR, TRAN('inactive', 'suspended'), 'inactive -> suspended would skip re-approval');
    forbid(CR, TRAN('suspended', 'inactive'), 'suspended -> inactive would skip re-approval');
    forbid(CR, TRAN('suspended', 'pending'), 'suspended courier can only be reactivated');
    forbid(CR, TRAN('inactive', 'pending'), 'inactive courier can only be reactivated');
  });

  it('idempotent repeats stay event-free', () => {
    expect(CR).toContain("'event_type', 'noop'");
  });
});

describe('legacy pilot_admin_set_courier — bypass is structurally impossible', () => {
  it('the boolean never creates an instant-active membership', () => {
    forbid(LG, TRAN('', 'active'), 'legacy RPC must provision new identities as pending');
    forbid(LG, TRAN('', 'inactive'), 'legacy RPC must provision new identities as pending');
    forbid(LG, /VALUES \(p_user_id, p_store_id, 'active'\)/, 'no path inserts a brand-new active courier');
  });

  it('legacy transitions route only through legal courier pairs', () => {
    forbid(LG, TRAN('pending', 'inactive'), 'legacy path may not skip approval');
    forbid(LG, TRAN('suspended', 'inactive'), 'legacy path may not slip a suspended user to inactive');
    forbid(LG, TRAN('active', 'pending'), 'legacy path cannot revert a courier to pending');
  });

  it('guarded write keeps the matrix meaningful under concurrency', () => {
    expect(LG).toMatch(/WHERE user_id = p_user_id AND store_id = p_store_id AND status = v_old/);
    expect(LG).toContain("RAISE EXCEPTION 'COURIER_CONFLICT'");
  });
});

describe('concurrency — admin actions serialize deterministically (§33)', () => {
  it('every status RPC locks the store row to order concurrent admins', () => {
    expect(OP).toMatch(/FROM public\.stores WHERE id = p_store_id FOR UPDATE/);
    expect(CR).toMatch(/FROM public\.stores WHERE id = p_store_id FOR UPDATE/);
    expect(LG).toMatch(/FROM public\.stores WHERE id = p_store_id FOR UPDATE/);
  });

  it('the membership row is read under lock before deciding the transition', () => {
    expect(OP).toMatch(/FROM public\.pilot_store_operators[\s\S]*FOR UPDATE/);
    expect(CR).toMatch(/FROM public\.pilot_couriers[\s\S]*FOR UPDATE/);
    expect(LG).toMatch(/FROM public\.pilot_couriers[\s\S]*FOR UPDATE/);
  });

  it('a unique_violation during operator activation is surfaced, never swallowed', () => {
    expect(OP).toContain('EXCEPTION WHEN unique_violation THEN');
    expect(OP).toContain("RAISE EXCEPTION 'OPERATOR_CONFLICT'");
  });
});

describe('secrets and authorization surface (§22/§24/§25)', () => {
  it('the lookup and all redefinitions expose nothing sensitive', () => {
    expect(M81).not.toMatch(/encrypted_password|password_hash|reset_token|provider_token/);
    expect(M81).not.toMatch(/raw_user_meta_data/);
    expect(M81).not.toMatch(/service_role|supabase_admin|set_config/);
  });

  it('the ledger cannot be manipulated through grants or RLS escapes', () => {
    expect(M81).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public\.pilot_membership_history/);
    expect(M81).not.toMatch(/WITH CHECK \(true\)|USING \(true\)/);
  });
});
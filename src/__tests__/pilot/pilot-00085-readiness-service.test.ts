/**
 * GATE 8B Step 2C — OPERATIONAL READINESS SERVICE (00085 + readiness-service).
 * Offline tests: (a) migration-gate structure for 00085, (b) the client
 * readiness-service contract, (c) 00080-00084 regression invariants. DB-side
 * behaviour is additionally proven by the post-apply DO-gate + controlled E2E.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const M84 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00084_pilot_operational_readiness.sql'),
  'utf-8',
);
const M85 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00085_pilot_operational_readiness_service.sql'),
  'utf-8',
);
const M81 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00081_pilot_account_provisioning.sql'), 'utf-8');
const M83 = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/00083_pilot_provision_new_membership.sql'), 'utf-8');

const RPC_BODY = (sql: string, name: string): string => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const tail = sql.slice(start);
  const end = tail.search(/\nGRANT |\nREVOKE |\nCREATE OR REPLACE FUNCTION public\.|\nDO \$\$/);
  return (end === -1 ? tail : tail.slice(0, end));
};

const READY_RPC = RPC_BODY(M85, 'pilot_admin_set_operational_ready');
const WRITE_EVENT = RPC_BODY(M85, 'pilot_write_readiness_event');
const CLEAR_HELPER = RPC_BODY(M85, 'pilot_clear_readiness_if_set');
const OP_STATUS = RPC_BODY(M85, 'pilot_admin_set_operator_status');
const CO_STATUS = RPC_BODY(M85, 'pilot_admin_set_courier_status');
const LEGACY_COURIER = RPC_BODY(M85, 'pilot_admin_set_courier(');
const LIST_OPS = RPC_BODY(M85, 'pilot_admin_list_operators');
const LIST_COS = RPC_BODY(M85, 'pilot_admin_list_couriers');

const mocks = {
  rpc: vi.fn(),
};
vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { setOperationalReady } from '../../services/readiness-service';

beforeEach(() => {
  mocks.rpc.mockReset();
});

// ————————————————————— 1–6 AUTH & SECURITY —————————————————————
describe('00085 — readiness RPC auth & security posture', () => {
  it('1. is SECURITY DEFINER with a fixed empty search_path', () => {
    expect(READY_RPC).toContain('SECURITY DEFINER');
    expect(READY_RPC).toContain("SET search_path = ''");
  });

  it('2. grants EXECUTE to authenticated and revokes PUBLIC/anon', () => {
    expect(M85).toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_admin_set_operational_ready[\s\S]*?TO authenticated;/);
    expect(M85).toContain('FROM PUBLIC;');
    expect(M85).toContain('FROM anon;');
  });

  it('3. readiness helpers are owner-only (no anon/authenticated EXECUTE)', () => {
    for (const h of ['pilot_write_readiness_event', 'pilot_clear_readiness_if_set']) {
      expect(M85).toContain(`REVOKE ALL ON FUNCTION public.${h}(`);
      expect(M85).toContain(`REVOKE EXECUTE ON FUNCTION public.${h}(`);
      expect(M85).toContain(`REVOKE EXECUTE ON FUNCTION public.${h}(`);
    }
  });

  it('4. re-verifies the admin identity (fn_admin_uid + PERMISSION_DENIED)', () => {
    expect(READY_RPC).toContain('fn_admin_uid()');
    expect(READY_RPC).toMatch(/IF v_uid IS NULL THEN[\s\S]*?PERMISSION_DENIED/);
    expect(READY_RPC).toContain('42501');
  });

  it('5. records the ACTUAL actor role from public.users (admin/super_admin)', () => {
    expect(READY_RPC).toMatch(/SELECT role INTO v_role FROM public\.users WHERE id = v_uid;/);
    expect(WRITE_EVENT).toMatch(/actor_role/);
  });

  it('6. never opens a client table-write path (audit table DML stays closed)', () => {
    expect(M85).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
    expect(M84).toMatch(/REVOKE INSERT, UPDATE, DELETE ON (TABLE )?public\.pilot_operational_readiness_history/);
  });
});

// ————————————————————— 7–13 STATE MACHINE —————————————————————
describe('00085 — readiness state machine', () => {
  it('7. SET READY requires active membership (TRANSITION_NOT_ALLOWED)', () => {
    expect(READY_RPC).toContain('TRANSITION_NOT_ALLOWED');
    expect(READY_RPC).toMatch(/IF p_ready AND v_status IS DISTINCT FROM 'active'/);
  });

  it('8. validates args (member_kind operator|courier only, ARGUMENTS_INVALID)', () => {
    expect(READY_RPC).toMatch(/NOT IN \('operator', 'courier'\)/);
    expect(READY_RPC).toContain('ARGUMENTS_INVALID');
    expect(READY_RPC).toContain('22023');
  });

  it('9. rejects unknown memberships (MEMBERSHIP_NOT_FOUND)', () => {
    expect(READY_RPC).toContain('MEMBERSHIP_NOT_FOUND');
    expect(READY_RPC).toContain('P0002');
  });

  it('10. is idempotent: no-op writes NO audit event (noop before the audit call)', () => {
    expect(READY_RPC).toContain("'event_type', 'noop'");
    expect(READY_RPC).toMatch(/'event_type', 'noop'[\s\S]*?pilot_write_readiness_event/);
  });

  it('11. a real transition writes EXACTLY one audit event via the helper', () => {
    expect(READY_RPC).toContain('PERFORM public.pilot_write_readiness_event(');
    expect(READY_RPC).not.toContain('INSERT INTO public.pilot_operational_readiness_history');
    expect(READY_RPC).toContain("'event_type', CASE WHEN p_ready THEN 'ready' ELSE 'not_ready' END");
  });

  it('12. serializes via SELECT ... FOR UPDATE on the membership row', () => {
    expect(READY_RPC).toContain('FOR UPDATE');
  });

  it('13. CLEAR READY never changes membership status / users.role / RBAC', () => {
    expect(READY_RPC).not.toMatch(/UPDATE public\.pilot_(store_operators|couriers)\s+SET\s+status/);
    expect(READY_RPC).not.toMatch(/UPDATE public\.users\s+SET\s+role/);
  });
});

// ————————————————————— 14–19 AUDIT INTEGRITY —————————————————————
describe('00085 — readiness audit integrity', () => {
  it('14. writes through the owner-only helper; integrity gate fails on drift', () => {
    expect(WRITE_EVENT).toMatch(/INSERT INTO public\.pilot_operational_readiness_history/);
    expect(M85).toContain("RAISE EXCEPTION '00085: readiness RPC missing'");
    expect(M85).toContain("RAISE EXCEPTION '00085: readiness client DML open'");
  });

  it('14b. subject FKs never cascade, actor FK is SET NULL (00084 baseline intact)', () => {
    expect(M84).toMatch(/REFERENCES public\.stores\(id\)/);
    expect(M84).toMatch(/REFERENCES public\.users\(id\)/);
    expect(M84).toMatch(/ON DELETE SET NULL/);
    expect(M84).not.toMatch(/ON DELETE CASCADE/);
    // 00085 must not recreate or re-constrain the audit table.
    expect(M85).not.toMatch(/ALTER TABLE public\.pilot_operational_readiness_history/);
    expect(M85).not.toContain('CREATE TABLE IF NOT EXISTS public.pilot_operational_readiness_history');
  });

  it('15. FK audit writes respect actor identity + reason/metadata', () => {
    expect(WRITE_EVENT).toContain('actor_user_id');
    expect(WRITE_EVENT).toContain('COALESCE(p_reason, \'\')');
    expect(WRITE_EVENT).toContain('COALESCE(p_metadata, \'{}\')');
    expect(WRITE_EVENT).toContain('old_ready');
    expect(WRITE_EVENT).toContain('new_ready');
  });

  it('16. audit table is NOT realtime-subscribed', () => {
    expect(M85).not.toMatch(/ALTER PUBLICATION/);
    expect(M84).not.toMatch(/ALTER PUBLICATION[\s\S]*pilot_operational_readiness_history/);
  });

  it('17. audit remains admin-READ only (no new/weakened policies here)', () => {
    expect(M85).not.toContain('CREATE POLICY');
    expect(M85).not.toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('18. service-role never gains the admin readiness RPC; no client direct write', () => {
    expect(M85).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_admin_set_operational_ready[\s\S]*?TO service_role/);
    expect(M85).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_(write|clear)_readiness/);
    expect(M85).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
  });

  it('19. clear helper is a guarded conditional write (atomic, one event)', () => {
    expect(CLEAR_HELPER).toMatch(/AND operational_ready = true/);
    expect(CLEAR_HELPER).toContain('GET DIAGNOSTICS v_rows = ROW_COUNT');
    expect(CLEAR_HELPER).not.toMatch(/INSERT INTO public\.pilot_(store_operators|couriers)/);
  });
});

// ————————————————————— 20–28 LIFECYCLE INVALIDATION —————————————————————
describe('00085 — lifecycle invalidation (same-transaction, explicit RPC)', () => {
  it('20. operator status RPC clears readiness when leaving active', () => {
    expect(OP_STATUS).toContain('PERFORM public.pilot_clear_readiness_if_set(');
    expect(OP_STATUS).toMatch(/v_old = 'active' AND p_status IS DISTINCT FROM 'active'/);
    expect(OP_STATUS).toContain("'membership transition to ' || p_status");
  });

  it('21. operator replacement clears the PREVIOUS active operator', () => {
    expect(OP_STATUS).toContain("'replaced as active operator'");
    expect(OP_STATUS).toMatch(/pilot_clear_readiness_if_set\([\s\S]*?v_prev/);
  });

  it('22. courier status RPC clears readiness when leaving active', () => {
    expect(CO_STATUS).toContain('PERFORM public.pilot_clear_readiness_if_set(');
    expect(CO_STATUS).toMatch(/v_old = 'active' AND p_status IS DISTINCT FROM 'active'/);
  });

  it('23. legacy set_courier(bool) clears readiness on active -> inactive', () => {
    expect(LEGACY_COURIER).toContain('PERFORM public.pilot_clear_readiness_if_set(');
    expect(LEGACY_COURIER).toMatch(/v_old = 'active' AND v_target IS DISTINCT FROM 'active'/);
  });

  it('24. reactivation NEVER auto-restores readiness (no set-true in lifecycle)', () => {
    for (const body of [OP_STATUS, CO_STATUS, LEGACY_COURIER]) {
      expect(body).not.toMatch(/SET\s+operational_ready\s*=\s*true/);
      expect(body).not.toMatch(/operational_ready\s*=\s*true/);
    }
  });

  it('25. lifecycle bodies never write the audit row directly (helper only)', () => {
    for (const body of [OP_STATUS, CO_STATUS, LEGACY_COURIER]) {
      expect(body).not.toContain('INSERT INTO public.pilot_operational_readiness_history');
    }
  });

  it('26. provisioning (00083) stays pending-only and readiness-free', () => {
    const M83RPC = RPC_BODY(M83, 'pilot_provision_new_membership');
    expect(M83RPC).toMatch(/'pending'/);
    expect(M83RPC).not.toContain('operational_ready');
  });

  it('27. invalidation records the same-actor identity + reason', () => {
    expect(OP_STATUS).toContain("'operator', p_store_id, p_user_id, v_uid, v_role");
    expect(CO_STATUS).toContain("'courier', p_store_id, p_user_id, v_uid, v_role");
    expect(LEGACY_COURIER).toContain("'courier', p_store_id, p_user_id, v_uid, v_role");
  });

  it('28. clear helper never performs an UPDATE when already false (idempotent)', () => {
    expect(CLEAR_HELPER).toContain('RETURN false;');
  });
});

// ————————————————————— 29–37 REGRESSION —————————————————————
describe('00085 — regression: 00080-00084 invariants hold', () => {
  it('29. does not redefine the order / assignment / realtime / provision surface', () => {
    for (const r of [
      'pilot_admin_assign_order',
      'pilot_order_set_status',
      'pilot_courier_set_status',
      'record_telemetry_event',
      'fn_admin_uid',
      'pilot_admin_upsert_store',
    ]) {
      expect(M85).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    expect(M85).not.toContain('CREATE TABLE');
    expect(M85).not.toContain('ALTER TABLE public.orders');
    expect(M85).not.toContain('ALTER TABLE public.order_status_history');
  });

  it('30. adds no tables / no realtime publications / no policies', () => {
    expect(M85).not.toMatch(/CREATE TABLE/);
    expect(M85).not.toMatch(/ALTER PUBLICATION/);
    expect(M85).not.toMatch(/CREATE POLICY/);
  });

  it('31. leaves telemetry + auth/RBAC + 00078 courier presence fields untouched', () => {
    expect(M85).not.toMatch(/record_telemetry_event/);
    expect(M85).not.toMatch(/ALTER TABLE public\.pilot_couriers/);
    expect(M85).not.toMatch(/UPDATE public\.users/);
  });

  it('32. admin list RPCs expose the server readiness truth', () => {
    expect(LIST_OPS).toContain("'operational_ready', pso.operational_ready");
    expect(LIST_COS).toContain("'operational_ready', pc.operational_ready");
  });

  it('33. list RPCs keep the admin guard + fixed search_path', () => {
    for (const b of [LIST_OPS, LIST_COS]) {
      expect(b).toContain('SECURITY DEFINER');
      expect(b).toContain("SET search_path = ''");
      expect(b).toContain('fn_admin_uid()');
      expect(b).toContain('PERMISSION_DENIED');
    }
  });

  it('34. defines NO Pilot START / GPS / geofence / presence surface', () => {
    expect(M85).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(pilot_start|start_pilot)\w*/);
    expect(M85).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.(pilot_start_history|pilot_cycle)/);
    for (const needle of ['check_in', 'latitude', 'longitude', 'geolocation', 'PostGIS', 'READY_INTENT']) {
      expect(M85.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  it('35. membership ledger stays write-closed', () => {
    expect(M85).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON (TABLE )?public\.pilot_membership_history/);
    expect(M81).toMatch(/REVOKE INSERT, UPDATE, DELETE ON (TABLE )?public\.pilot_membership_history/);
  });

  it('36. readiness RPC mutates only operational_ready', () => {
    expect(READY_RPC).not.toMatch(/UPDATE public\.users/);
    expect(READY_RPC).not.toMatch(/UPDATE public\.stores/);
    expect(READY_RPC).toMatch(/SET operational_ready = p_ready/);
  });

  it('37. post-apply integrity gate fails loudly on drift', () => {
    for (const marker of [
      'readiness RPC missing',
      'readiness RPC not SECURITY DEFINER',
      'readiness RPC search_path not empty',
      'readiness row lock missing',
      'readiness admin guard missing',
      'readiness audit write missing',
      'readiness active-only guard missing',
      'readiness authenticated EXECUTE missing',
      'readiness anon EXECUTE open',
      'readiness helper EXECUTE open beyond owner',
      'operator status invalidation missing',
      'operator replacement readiness clear missing',
      'courier status invalidation missing',
      'legacy courier invalidation missing',
      'list operators must expose operational_ready',
      'list couriers must expose operational_ready',
      'readiness history FK cascades',
      'readiness client DML open',
      'readiness history in realtime',
      'pilot-start surface must not exist',
      'membership ledger DML reopened',
      'operator exclusivity index missing',
      'provision RPC ACL drifted',
      'orders direct DML reopened',
      'existing operator already ready',
      'existing courier already ready',
      'readiness audit expected empty pre-E2E',
    ]) {
      expect(M85, marker).toContain(marker);
    }
  });
});

// ————————————————————— CONCURRENCY (37++) —————————————————————
describe('00085 — concurrency contract', () => {
  it('readiness RPC locks the membership row FOR UPDATE (serializes)', () => {
    expect(READY_RPC).toContain('FOR UPDATE');
    expect(CLEAR_HELPER).toMatch(/AND operational_ready = true/);
  });

  it('lifecycle RPCs lock the store + membership before clearing readiness', () => {
    expect(OP_STATUS).toContain('FOR UPDATE');
    expect(CO_STATUS).toContain('FOR UPDATE');
  });
});

// ————————————————————— CLIENT SERVICE CONTRACT —————————————————————
describe('readiness-service — client contract', () => {
  it('maps to the exact admin RPC signature', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        member_kind: 'courier', store_id: 's1', user_id: 'u9', status: 'active',
        operational_ready: true, actor_user_id: 'a1', actor_role: 'admin', event_type: 'ready',
      },
      error: null,
    });
    const res = await setOperationalReady({ memberKind: 'courier', storeId: 's1', userId: 'u9', ready: true });
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_operational_ready', {
      p_member_kind: 'courier',
      p_store_id: 's1',
      p_user_id: 'u9',
      p_ready: true,
      p_reason: '',
      p_metadata: {},
    });
    expect(res.event_type).toBe('ready');
    expect(res.operational_ready).toBe(true);
  });

  it('supports clear + explicit reason', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        member_kind: 'operator', store_id: 's1', user_id: 'u2', status: 'active',
        operational_ready: false, actor_user_id: 'a1', actor_role: 'super_admin', event_type: 'not_ready',
      },
      error: null,
    });
    await setOperationalReady({ memberKind: 'operator', storeId: 's1', userId: 'u2', ready: false, reason: 'admin manual clear' });
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_operational_ready', {
      p_member_kind: 'operator',
      p_store_id: 's1',
      p_user_id: 'u2',
      p_ready: false,
      p_reason: 'admin manual clear',
      p_metadata: {},
    });
  });

  it('surfaces PERMISSION_DENIED from the server substantively', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(setOperationalReady({ memberKind: 'courier', storeId: 's1', userId: 'u9', ready: true })).rejects.toThrow('PERMISSION_DENIED');
  });

  it('surfaces a rejected transition (server 22023) as RPC_ERROR', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TRANSITION_NOT_ALLOWED', code: '22023' } });
    await expect(setOperationalReady({ memberKind: 'courier', storeId: 's1', userId: 'u9', ready: true })).rejects.toThrow('22023');
  });
});
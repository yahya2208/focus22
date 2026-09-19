/**
 * GATE 8B Step 4 — PILOT START (00086 + pilot-start-service).
 * Offline tests: (a) migration-gate structure for 00086, (b) the client
 * pilot-start-service contract, (c) 00080-00085 regression invariants, and
 * (d) the read-only verifier. DB-side behaviour is proven by the post-apply
 * DO-gate + a future controlled E2E (no production apply in this gate).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const M86 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00086_pilot_start.sql'),
  'utf-8',
);
const V86 = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/verify/00086_pilot_start.sql'),
  'utf-8',
);

const RPC_BODY = (sql: string, name: string): string => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must be defined`).toBeGreaterThan(-1);
  const tail = sql.slice(start);
  const end = tail.search(/\nGRANT |\nREVOKE |\nCREATE OR REPLACE FUNCTION public\.|\nDO \$\$/);
  return (end === -1 ? tail : tail.slice(0, end));
};

const START_RPC = RPC_BODY(M86, 'pilot_admin_start_pilot');
const STATUS_RPC = RPC_BODY(M86, 'pilot_admin_pilot_start_status');

const mocks = {
  rpc: vi.fn(),
};
vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchPilotStartStatus, startPilot } from '../../services/pilot-start-service';

beforeEach(() => {
  mocks.rpc.mockReset();
});

// ————————————————————— 1–8 AUTH & SECURITY —————————————————————
describe('00086 — START RPC auth & security posture', () => {
  it('1. is SECURITY DEFINER with a fixed empty search_path', () => {
    expect(START_RPC).toContain('SECURITY DEFINER');
    expect(START_RPC).toContain("SET search_path = ''");
  });

  it('2. grants EXECUTE to authenticated and revokes PUBLIC/anon for both RPCs', () => {
    expect(M86).toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_admin_start_pilot\(uuid, uuid, jsonb\) TO authenticated;/);
    expect(M86).toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_admin_pilot_start_status\(uuid, uuid\) TO authenticated;/);
    expect(M86).toContain('FROM PUBLIC;');
    expect(M86).toContain('FROM anon;');
  });

  it('3. re-verifies the admin identity (fn_admin_uid + PERMISSION_DENIED) and never opens service-role', () => {
    expect(START_RPC).toContain('fn_admin_uid()');
    expect(START_RPC).toMatch(/IF v_uid IS NULL THEN[\s\S]*?PERMISSION_DENIED/);
    expect(START_RPC).toContain('42501');
    expect(M86).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_admin_start_pilot[\s\S]*?TO service_role/);
    expect(M86).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.pilot_admin_pilot_start_status[\s\S]*?TO service_role/);
  });

  it('4. records the ACTUAL actor role from public.users (admin/super_admin)', () => {
    expect(START_RPC).toMatch(/SELECT role INTO v_role FROM public\.users WHERE id = v_uid;/);
    expect(START_RPC).toMatch(/'actor_role',\s*v_role/);
  });

  it('5. START never writes to stores / users / memberships / readiness (reads only)', () => {
    for (const t of ['stores', 'users', 'pilot_store_operators', 'pilot_couriers', 'pilots', 'pilot_operational_readiness_history', 'pilot_membership_history']) {
      expect(START_RPC, t).not.toMatch(new RegExp(`(UPDATE|INSERT INTO) public\\.${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    }
  });

  it('6. the START table has no client write grants (append-only from client perspective)', () => {
    expect(M86).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
    expect(M86).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.pilot_pilot_starts FROM anon;/);
    expect(M86).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.pilot_pilot_starts FROM authenticated;/);
  });

  it('7. status (read) RPC is STABLE, guarded, and never mutates', () => {
    expect(STATUS_RPC).toContain('STABLE');
    expect(STATUS_RPC).toContain('SECURITY DEFINER');
    expect(STATUS_RPC).toContain('fn_admin_uid()');
    expect(STATUS_RPC).not.toMatch(/INSERT|UPDATE|DELETE FROM/);
  });

  it('8. admin-read policy + SELECT grant mirror the readiness history (00084) convention', () => {
    expect(M86).toContain('CREATE POLICY "Admin read pilot start runs"');
    expect(M86).toContain('GRANT SELECT ON public.pilot_pilot_starts TO authenticated;');
    expect(M86).toContain('ENABLE ROW LEVEL SECURITY');
  });
});

// ————————————————————— 9–17 PRECONDITION STATE MACHINE —————————————————————
describe('00086 — START precondition state machine (deterministic codes)', () => {
  const codes: Array<[string, string]> = [
    ['ARGUMENTS_INVALID', '22023'],
    ['STORE_NOT_FOUND', 'P0002'],
    ['STORE_INACTIVE', '22023'],
    ['OPERATOR_NOT_FOUND', 'P0002'],
    ['OPERATOR_NOT_LINKED', '22023'],
    ['OPERATOR_NOT_ACTIVE', '22023'],
    ['OPERATOR_NOT_READY', '22023'],
    ['COURIER_NOT_FOUND', 'P0002'],
    ['COURIER_NOT_LINKED', '22023'],
    ['COURIER_NOT_ACTIVE', '22023'],
    ['COURIER_NOT_READY', '22023'],
  ];
  it('9. raises every frozen precondition error with its SQLSTATE', () => {
    for (const [code, sqlstate] of codes) {
      expect(START_RPC, code).toContain(`RAISE EXCEPTION '${code}' USING ERRCODE = '${sqlstate}'`);
    }
  });

  it('10. args validation (null store/courier → ARGUMENTS_INVALID) runs before any state read', () => {
    expect(START_RPC).toMatch(/IF p_store_id IS NULL OR p_courier_user_id IS NULL THEN[\s\S]*?ARGUMENTS_INVALID/);
  });

  it('11. derives the authoritative active operator (NOT the caller-provided one)', () => {
    expect(START_RPC).toMatch(/FROM public\.pilot_store_operators[\s\S]*?WHERE store_id = p_store_id AND status = 'active'/);
    expect(START_RPC).not.toMatch(/p_operator/);
  });

  it('12. enforces operator linkage (stores.operator_user_id = active membership operator)', () => {
    expect(START_RPC).toMatch(/v_store_op IS DISTINCT FROM v_operator/);
  });

  it('13. courier must be a member of the SAME store; foreign membership → COURIER_NOT_LINKED', () => {
    expect(START_RPC).toMatch(/FROM public\.pilot_couriers[\s\S]*?WHERE user_id = p_courier_user_id AND store_id = p_store_id/);
    expect(START_RPC).toMatch(/EXISTS \(SELECT 1 FROM public\.pilot_couriers WHERE user_id = p_courier_user_id\)/);
  });

  it('14. idempotency: pre-check + structural unique-violation mapping both yield ALREADY_STARTED', () => {
    const first = START_RPC.indexOf("RAISE EXCEPTION 'ALREADY_STARTED' USING ERRCODE = '23505'");
    const second = START_RPC.indexOf("RAISE EXCEPTION 'ALREADY_STARTED' USING ERRCODE = '23505'", first + 1);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(START_RPC).toMatch(/EXCEPTION WHEN unique_violation THEN/);
  });

  it('15. lock strategy is FOR SHARE on store + operator + courier rows (serializes vs FOR UPDATE writers)', () => {
    expect(START_RPC).toContain('FOR SHARE');
    expect(START_RPC.match(/FOR SHARE/g)).not.toBeNull();
  });

  it('16. run_index derivation is per-store and server-computed', () => {
    expect(START_RPC).toMatch(/COALESCE\(MAX\(run_index\), 0\) \+ 1/);
    expect(START_RPC).toMatch(/FROM public\.pilot_pilot_starts[\s\S]*?WHERE store_id = p_store_id/);
  });

  it('17. never uses GPS / presence / telemetry as a precondition', () => {
    for (const needle of ['is_online', 'latitude', 'record_telemetry_event', 'geolocation']) {
      expect(START_RPC.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
});

// ————————————————————— 18–24 AUDIT INTEGRITY —————————————————————
describe('00086 — run audit integrity', () => {
  it('18. successful START writes EXACTLY one immutable run row via the RPC', () => {
    expect(START_RPC.match(/INSERT INTO public\.pilot_pilot_starts/g)?.length).toBe(1);
    expect(START_RPC).toContain('INSERT INTO public.pilot_pilot_starts');
  });

  it('19. the run row captures a precondition snapshot of verified state', () => {
    expect(START_RPC).toContain('precondition_snapshot');
    expect(START_RPC).toMatch(/'operator',\s*jsonb_build_object/);
    expect(START_RPC).toMatch(/'courier',\s*jsonb_build_object/);
    expect(START_RPC).toContain("'verified_at'");
  });

  it('20. run identity + success payload matches the frozen contract', () => {
    for (const marker of ["'run_id'", "'run_index'", "'store_id'", "'operator_user_id'", "'courier_user_id'", "'actor_user_id'", "'actor_role'", "'status',", "'event_type',"]) {
      expect(START_RPC, marker).toContain(marker);
    }
    expect(START_RPC).toMatch(/'status',\s+'started'/);
    expect(START_RPC).toMatch(/'event_type',\s+'pilot_started'/);
    expect(START_RPC).toMatch(/RETURNING id, created_at INTO v_run_id, v_started_at/);
  });

  it('21. failures never land in the stream (no partial write before all preconditions pass)', () => {
    const insertAt = START_RPC.indexOf('INSERT INTO public.pilot_pilot_starts');
    const tail = START_RPC.slice(insertAt);
    expect(tail).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    // every precondition error is raised BEFORE the insert.
    const insertPrefix = START_RPC.slice(0, insertAt);
    for (const code of ['PERMISSION_DENIED', 'ARGUMENTS_INVALID', 'STORE_INACTIVE', 'OPERATOR_NOT_READY', 'COURIER_NOT_READY']) {
      expect(insertPrefix, code).toContain(code);
    }
  });

  it('22. store FK is ON DELETE RESTRICT; user FKs are retained-history SET NULL; never CASCADE', () => {
    expect(M86).toMatch(/store_id\s+uuid NOT NULL REFERENCES public\.stores\(id\) ON DELETE RESTRICT/);
    expect(M86.match(/REFERENCES public\.users\(id\) ON DELETE SET NULL/g)?.length).toBe(3);
    expect(M86).not.toContain('ON DELETE CASCADE');
  });

  it('23. the START table is NOT realtime-subscribed', () => {
    expect(M86).not.toMatch(/ALTER PUBLICATION/);
  });

  it('24. open-run uniqueness is structural (partial unique index on the open run)', () => {
    expect(M86).toMatch(/CREATE UNIQUE INDEX pilot_pilot_starts_one_open[\s\S]*?WHERE \(ended_at IS NULL\)/);
    expect(M86).toMatch(/CREATE UNIQUE INDEX pilot_pilot_starts_store_run\s+ON public\.pilot_pilot_starts \(store_id, run_index\)/);
  });
});

// ————————————————————— 25–31 REGRESSION —————————————————————
describe('00086 — regression: 00080-00085 invariants hold', () => {
  it('25. creates the START table and nothing else', () => {
    expect(M86.match(/CREATE TABLE/g)?.length).toBe(1);
    expect(M86).toContain('CREATE TABLE public.pilot_pilot_starts');
  });

  it('26. does not redefine the order / assignment / telemetry / admin / readiness / lifecycle surface', () => {
    for (const r of [
      'pilot_admin_assign_order',
      'pilot_order_set_status',
      'pilot_courier_set_status',
      'record_telemetry_event',
      'fn_admin_uid',
      'pilot_admin_upsert_store',
      'pilot_admin_set_operational_ready',
      'pilot_admin_set_operator_status',
      'pilot_admin_set_courier_status',
      'pilot_admin_set_courier',
    ]) {
      expect(M86).not.toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  it('27. does not alter any existing frozen table', () => {
    for (const tbl of ['stores', 'orders', 'order_status_history', 'pilot_store_operators', 'pilot_couriers', 'users', 'pilot_operational_readiness_history', 'pilot_membership_history']) {
      expect(M86).not.toMatch(new RegExp(`ALTER TABLE public\\.${tbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  it('28. adds no GPS / location / routing surface anywhere', () => {
    for (const needle of ['check_in', 'latitude', 'longitude', 'geolocation', 'PostGIS', 'routing']) {
      expect(M86.toLowerCase()).not.toContain(needle.toLowerCase());
    }
    expect(M86).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.\w*(gps|geo|location|distance|rout|eta)\w*\s*\(/i);
  });

  it('29. neither the status RPC nor the migration emit telemetry or touch RBAC', () => {
    expect(STATUS_RPC).not.toMatch(/record_telemetry_event/);
    // the i1 guard lists the existing telemetry RPC for drift-detection; the
    // migration must never INVOKE it.
    expect(M86).not.toMatch(/(PERFORM|SELECT)\s+\w*record_telemetry_event\w*\s*\(/i);
    expect(M86).not.toMatch(/record_telemetry_event\(/i);
    expect(M86).not.toMatch(/user_metadata/);
    expect(M86).not.toMatch(/UPDATE public\.users/);
  });

  it('30. there is no client-facing write path and no second START surface (cycle/stop)', () => {
    expect(M86).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(pilot_admin_stop|pilot_admin_end|pilot_stop_pilot)\w*/);
    expect(M86).not.toMatch(/ended_at\s*=\s*now\(\)/);
    expect(M86).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.(pilot_cycle|pilot_start_history)/);
  });

  it('31. post-apply integrity gate fails loudly on drift', () => {
    for (const marker of [
      '00086: start RPC missing',
      '00086: start RPC not SECURITY DEFINER',
      '00086: start RPC search_path not empty',
      '00086: start RPC admin guard missing',
      '00086: start RPC precondition locks missing',
      '00086: start RPC idempotency guard missing',
      '00086: start RPC run insert missing',
      '00086: start RPC snapshot missing',
      '00086: start RPC run_index derivation missing',
      '00086: start RPC authenticated EXECUTE missing',
      '00086: start RPC anon EXECUTE open',
      '00086: start RPC service_role EXECUTE open (no service-role browser path)',
      '00086: start status RPC missing',
      '00086: status RPC drift validity missing',
      '00086: open-run partial unique index missing',
      '00086: store-run unique index missing',
      '00086: store FK must be ON DELETE RESTRICT',
      '00086: pilot start FK cascades',
      '00086: start admin-read policy missing',
      '00086: start client DML open',
      '00086: pilot starts in realtime',
      '00086: gps/location surface must not exist',
      '00086: existing RPC surface drifted',
      '00086: operator exclusivity index missing',
      '00086: orders realtime tables missing',
      '00086: readiness client DML reopened',
      '00086: start history must be empty pre-E2E',
    ]) {
      expect(M86, marker).toContain(marker);
    }
  });
});

// ————————————————————— CONCURRENCY CONTRACT —————————————————————
describe('00086 — concurrency contract (races A-G §5)', () => {
  it('holds the store, operator and courier rows under FOR SHARE (blocks lifecycle FOR UPDATE writers)', () => {
    const storeLock = START_RPC.match(/FROM public\.stores[\s\S]*?FOR SHARE/);
    const opLock = START_RPC.match(/FROM public\.pilot_store_operators[\s\S]*?FOR SHARE/);
    const coLock = START_RPC.match(/FROM public\.pilot_couriers[\s\S]*?FOR SHARE/);
    expect(storeLock).not.toBeNull();
    expect(opLock).not.toBeNull();
    expect(coLock).not.toBeNull();
  });

  it('two concurrent STARTs cannot both commit (partial unique index + unique store_run)', () => {
    expect(M86).toMatch(/CREATE UNIQUE INDEX pilot_pilot_starts_one_open/);
    expect(M86).toMatch(/CREATE UNIQUE INDEX pilot_pilot_starts_store_run/);
    expect(START_RPC).toMatch(/EXCEPTION WHEN unique_violation THEN[\s\S]*?ALREADY_STARTED/);
  });

  it('re-validates readiness under the lock (race F: clear-during-insert serializes)', () => {
    expect(START_RPC).toMatch(/operational_ready[\s\S]*?FOR SHARE/);
    expect(START_RPC).toContain('OPERATOR_NOT_READY');
    expect(START_RPC).toContain('COURIER_NOT_READY');
  });
});

// ————————————————————— READ-ONLY VERIFIER —————————————————————
describe('verify/00086 — read-only contract checker', () => {
  it('is read-only: no DDL, no DML, no GRANT/REVOKE at statement level', () => {
    expect(V86).toMatch(/^-- verify\/00086_pilot_start\.sql$/m);
    expect(V86).not.toMatch(/^\s*(CREATE|ALTER|DROP|GRANT|REVOKE|COPY|INSERT|UPDATE|DELETE FROM)\b/gm);
  });

  it('checks the frozen security/service contract including empty search_path rendering', () => {
    expect(V86).toContain("'%search_path TO ''''%'");
    expect(V86).toContain('verify/00086: start RPC security contract broken');
    expect(V86).toContain('verify/00086: status RPC security contract broken');
    expect(V86).toContain('verify/00086: start authenticated EXECUTE missing');
    expect(V86).toContain('verify/00086: start anon EXECUTE open');
    expect(V86).toContain('verify/00086: store FK must be ON DELETE RESTRICT');
    expect(V86).toContain('verify/00086: open-run partial unique index missing');
    expect(V86).toContain('verify/00086: pilot starts must not be realtime');
    expect(V86).toContain('verify/00086: start client DML open');
  });
});

// ————————————————————— CLIENT SERVICE CONTRACT —————————————————————
describe('pilot-start-service — client contract', () => {
  it('fetchPilotStartStatus maps to the exact read RPC with the courier candidate', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { started: false, run: null, store: {}, operator: null, courier: null, preconditions: {}, ready: false, valid: null, validReasons: [] },
      error: null,
    });
    await fetchPilotStartStatus('s1', 'u9');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_pilot_start_status', {
      p_store_id: 's1',
      p_courier_user_id: 'u9',
    });
  });

  it('fetchPilotStartStatus without a courier passes null', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { started: false }, error: null });
    await fetchPilotStartStatus('s1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_pilot_start_status', {
      p_store_id: 's1',
      p_courier_user_id: null,
    });
  });

  it('startPilot maps to the exact START RPC with empty metadata', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { run_id: 'r1', run_index: 1, store_id: 's1', operator_user_id: 'u2', courier_user_id: 'u9', actor_user_id: 'a1', actor_role: 'admin', status: 'started', started_at: '2026-09-08T00:00:00Z', event_type: 'pilot_started' },
      error: null,
    });
    const res = await startPilot({ storeId: 's1', courierUserId: 'u9' });
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_start_pilot', {
      p_store_id: 's1',
      p_courier_user_id: 'u9',
      p_metadata: {},
    });
    expect(res.event_type).toBe('pilot_started');
    expect(res.run_index).toBe(1);
  });

  it('surfaces PERMISSION_DENIED substantively', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(startPilot({ storeId: 's1', courierUserId: 'u9' })).rejects.toThrow('PERMISSION_DENIED');
  });

  it('surfaces ALREADY_STARTED (structurally mapped 23505)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'ALREADY_STARTED', code: '23505' } });
    await expect(startPilot({ storeId: 's1', courierUserId: 'u9' })).rejects.toThrow('ALREADY_STARTED');
  });
});
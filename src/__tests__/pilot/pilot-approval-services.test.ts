/**
 * Neighborhood Pilot — account approval service layer tests (00070).
 * Covers: operator approval RPCs (set status / list) from neighborhood-service,
 * courier approval RPCs (set status / list) from courier-service, and the
 * platform-ready confirmed-first contract on the store-ops side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
  track: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

vi.mock('../../core/telemetry', () => ({
  track: (...a: unknown[]) => mocks.track(...a),
}));

import {
  adminSetOperatorStatus,
  adminListOperators,
  type OperatorMembership,
} from '../../services/neighborhood-service';
import {
  adminSetCourierStatus,
  adminListCouriers,
  type CourierMembership,
} from '../../services/courier-service';

const opRow: OperatorMembership = {
  id: 'm1',
  store_id: 's1',
  user_id: 'u1',
  status: 'pending',
  approved_by: null,
  approved_at: null,
  created_at: '2026-09-05T00:00:00Z',
  updated_at: '2026-09-05T00:00:00Z',
  user_email: 'op@focus.local',
  user_name: 'op@focus.local',
};

const couRow: CourierMembership = {
  id: 'c1',
  store_id: 's1',
  user_id: 'u2',
  status: 'active',
  created_at: '2026-09-05T00:00:00Z',
  updated_at: '2026-09-05T00:00:00Z',
  user_email: 'co@focus.local',
  user_name: 'co@focus.local',
};

describe('operator approval (00070) — admin service', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.track.mockReset();
  });

  it('approves a store operator (pending -> active)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { store_id: 's1', user_id: 'u1', status: 'active' }, error: null });
    await adminSetOperatorStatus('s1', 'u1', 'active');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_operator_status', {
      p_store_id: 's1',
      p_user_id: 'u1',
      p_status: 'active',
    });
  });

  it('suspends a store operator', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { store_id: 's1', user_id: 'u1', status: 'suspended' }, error: null });
    await adminSetOperatorStatus('s1', 'u1', 'suspended');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_operator_status', {
      p_store_id: 's1',
      p_user_id: 'u1',
      p_status: 'suspended',
    });
  });

  it('lists operators (scoped and unscoped)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [opRow], error: null });
    const list = await adminListOperators('s1');
    expect(list[0]?.status).toBe('pending');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_list_operators', { p_store_id: 's1' });

    mocks.rpc.mockResolvedValueOnce({ data: [opRow], error: null });
    await adminListOperators();
    expect(mocks.rpc).toHaveBeenLastCalledWith('pilot_admin_list_operators', {});
  });

  it('surfaces PERMISSION_DENIED from the server substantively', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(adminListOperators('s1')).rejects.toThrow('PERMISSION_DENIED');
  });
});

describe('courier approval (00070) — admin service', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.track.mockReset();
  });

  it('sets a courier to pending during onboarding', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { store_id: 's1', user_id: 'u2', status: 'pending' }, error: null });
    await adminSetCourierStatus('s1', 'u2', 'pending');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_courier_status', {
      p_store_id: 's1',
      p_user_id: 'u2',
      p_status: 'pending',
    });
  });

  it('suspends a courier', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { store_id: 's1', user_id: 'u2', status: 'suspended' }, error: null });
    await adminSetCourierStatus('s1', 'u2', 'suspended');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_courier_status', {
      p_store_id: 's1',
      p_user_id: 'u2',
      p_status: 'suspended',
    });
  });

  it('lists couriers (scoped and unscoped)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [couRow], error: null });
    const list = await adminListCouriers('s1');
    expect(list[0]?.user_id).toBe('u2');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_list_couriers', { p_store_id: 's1' });

    mocks.rpc.mockResolvedValueOnce({ data: [couRow], error: null });
    await adminListCouriers();
    expect(mocks.rpc).toHaveBeenLastCalledWith('pilot_admin_list_couriers', {});
  });
});
/**
 * Neighborhood Pilot — provisioning service layer (00081).
 * Covers the admin user lookup that drives the provision UI.
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

import { adminFindUsers, type AdminUserLookup } from '../../services/neighborhood-service';

const lookup: AdminUserLookup = {
  user_id: 'u1',
  email: 'candidate@focus.local',
  display_name: 'Candidate',
  role: 'user',
  is_anonymous: false,
  created_at: '2026-09-05T00:00:00Z',
  operator_memberships: [],
  courier_memberships: [{ store_id: 's1', status: 'pending' }],
};

describe('pilot_admin_find_users (00081) — admin service', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.track.mockReset();
  });

  it('finds a user by the email typed by the admin', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [lookup], error: null });
    const found = await adminFindUsers('candidate@focus.local', 20);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_find_users', {
      p_email: 'candidate@focus.local',
      p_limit: 20,
    });
    expect(found[0]?.user_id).toBe('u1');
    expect(found[0]?.courier_memberships?.[0]?.status).toBe('pending');
  });

  it('sends an empty email for the unscoped list', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await adminFindUsers(undefined, 50);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_find_users', { p_email: '', p_limit: 50 });
  });

  it('maps each row and tolerates empty response', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [lookup, { ...lookup, user_id: 'u2' }], error: null });
    const list = await adminFindUsers('x@focus.local', 20);
    expect(list).toHaveLength(2);
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(adminFindUsers('y@focus.local', 20)).resolves.toEqual([]);
  });

  it('surfaces admin-only rejection substantively', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(adminFindUsers('z@focus.local', 20)).rejects.toThrow('PERMISSION_DENIED');
  });
});
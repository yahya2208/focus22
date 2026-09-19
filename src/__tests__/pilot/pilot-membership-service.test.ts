import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = {
  rows: [] as Record<string, unknown>[],
  error: null as null | { message: string },
  lastEq: [] as unknown[],
};

function chainable() {
  return {
    select: vi.fn(() => chainable2()),
  };
}
function chainable2() {
  return {
    eq: vi.fn((...a: unknown[]) => {
      mocks.lastEq = a;
      return Promise.resolve({ data: mocks.rows, error: mocks.error });
    }),
  };
}

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ from: () => chainable() })),
}));

import {
  fetchMyCourierMemberships,
  fetchMyOperatorMemberships,
  resolvePilotEntryState,
} from '../../services/pilot-membership-service';

beforeEach(() => {
  mocks.rows = [];
  mocks.error = null;
  mocks.lastEq = [];
});

describe('resolvePilotEntryState precedence', () => {
  it('none when empty', () => {
    expect(resolvePilotEntryState([])).toBe('none');
  });
  it('pending beats suspended', () => {
    expect(
      resolvePilotEntryState([
        { storeId: 's', status: 'suspended', operationalReady: false },
        { storeId: 's', status: 'pending', operationalReady: false },
      ]),
    ).toBe('pending');
  });
  it('active without ready beats pending', () => {
    expect(
      resolvePilotEntryState([
        { storeId: 's', status: 'pending', operationalReady: false },
        { storeId: 's', status: 'active', operationalReady: false },
      ]),
    ).toBe('not-ready');
  });
  it('active+ready wins overall', () => {
    expect(
      resolvePilotEntryState([
        { storeId: 's', status: 'suspended', operationalReady: false },
        { storeId: 's', status: 'active', operationalReady: true },
      ]),
    ).toBe('operational');
  });
  it('suspended fallback', () => {
    expect(
      resolvePilotEntryState([{ storeId: 's', status: 'inactive', operationalReady: false }]),
    ).toBe('suspended');
  });
});

describe('membership self-reads (RLS-shaped, fail-closed)', () => {
  it('queries own operator rows by user_id and maps fields', async () => {
    mocks.rows = [{ store_id: 's1', status: 'active', operational_ready: true }];
    const rows = await fetchMyOperatorMemberships('u1');
    expect(mocks.lastEq).toEqual(['user_id', 'u1']);
    expect(rows).toEqual([{ storeId: 's1', status: 'active', operationalReady: true }]);
  });
  it('queries own courier rows by user_id', async () => {
    mocks.rows = [{ store_id: 's2', status: 'pending', operational_ready: false }];
    const rows = await fetchMyCourierMemberships('u2');
    expect(mocks.lastEq).toEqual(['user_id', 'u2']);
    expect(rows[0]?.storeId).toBe('s2');
  });
  it('returns [] on error (no implied membership)', async () => {
    mocks.error = { message: 'denied' };
    await expect(fetchMyOperatorMemberships('u1')).resolves.toEqual([]);
    await expect(fetchMyCourierMemberships('u1')).resolves.toEqual([]);
  });
});

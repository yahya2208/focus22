/**
 * GATE A — family account service tests (mocked supabase transport).
 *
 * Verifies that fetchMyFamily / fetchMyAccount map the server-authoritative
 * payloads verbatim and that the client performs NO balance math of its own —
 * the balance arrives as a single server-computed number; debts are display
 * metadata that must never be added to it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import {
  fetchMyFamily,
  fetchMyAccount,
  adminListFamilyMembers,
  adminDeposit,
  adminProvisionFamilyMember,
} from '../../services/pilot-account-service';

describe('pilot-account-service — pilot_my_family', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('maps the single-row family payload (server-derived membership)', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          member_id: 'm1',
          user_id: 'u1',
          family_id: 'f1',
          role: 'principal',
          status: 'active',
          family_name: 'Al Farouk',
          family_name_ar: 'آل فاروق',
          family_status: 'active',
          neighborhood: 'n1',
          store: 's1',
        },
      ],
      error: null,
    });
    const fam = await fetchMyFamily();
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_my_family');
    expect(fam?.family_id).toBe('f1');
    expect(fam?.family_name).toBe('Al Farouk');
    expect(fam?.role).toBe('principal');
  });

  it('returns null when the caller is not linked (empty result set)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchMyFamily()).toBeNull();
  });

  it('surfaces transport errors verbatim', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(fetchMyFamily()).rejects.toThrow('PERMISSION_DENIED');
  });
});

describe('pilot-account-service — pilot_my_account (balance is server-authoritative)', () => {
  beforeEach(() => mocks.rpc.mockReset());

  const linkedPayload = {
    linked: true,
    family_id: 'f1',
    balance: -500,
    debts: [
      { order_id: 'o1', order_number: 'FC-000042', original_total: 1500, covered: 1000, remaining: 500, status: 'open', created_at: '2026-01-01T00:00:00Z' },
    ],
  };

  it('returns the server-computed SUM(ledger) balance untouched', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: linkedPayload, error: null });
    const acct = await fetchMyAccount();
    expect(acct.linked).toBe(true);
    expect(acct.balance).toBe(-500);
    expect(acct.debts[0]?.remaining).toBe(500);
    // No client recomputation: balance is exactly what the server sent.
    expect(acct.balance).not.toBe(acct.debts[0]?.remaining);
  });

  it('keeps debts as separate display data (the service never folds debt into balance)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: linkedPayload, error: null });
    const acct = await fetchMyAccount();
    // The contract (inv-1) forbids a summed 'net' figure — balance and debts
    // ride as independent fields straight from the server payload.
    expect(Object.keys(acct).sort()).toEqual(['balance', 'debts', 'family_id', 'linked']);
    expect(acct).not.toHaveProperty('net_balance');
    expect(acct).not.toHaveProperty('balance_after_debt');
  });

  it('returns a safe default for unlinked users (no family leak)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { linked: false, balance: 0, debts: [] }, error: null });
    const acct = await fetchMyAccount();
    expect(acct.linked).toBe(false);
    expect(acct.balance).toBe(0);
    expect(acct.debts).toEqual([]);
  });

  it('falls back to the unlinked shape when the RPC returns null data', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const acct = await fetchMyAccount();
    expect(acct.linked).toBe(false);
    expect(acct.balance).toBe(0);
  });
});

describe('pilot-account-service — admin family management (Gate B, admin only)', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('lists family members with the server-computed balance untouched', async () => {
    const rows = [
      { member_id: 'm1', family_id: 'f1', family_name: 'Al Farouk', user_id: 'u1', user_email: 'a@x.com', role: 'principal', status: 'active', created_at: '2026-01-01T00:00:00Z', balance: -450 },
    ];
    mocks.rpc.mockResolvedValueOnce({ data: rows, error: null });
    const members = await adminListFamilyMembers();
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_list_family_members');
    expect(members[0]?.balance).toBe(-450);
    expect(members[0]?.user_email).toBe('a@x.com');
  });

  it('returns an empty list when the RPC returns null data', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await adminListFamilyMembers()).toEqual([]);
  });

  it('records a cash deposit through pilot_admin_deposit', async () => {
    const result = { family_id: 'f1', deposited: 1000, balance_after: 550 };
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null });
    const deposit = await adminDeposit('f1', 1000, 'cash');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_deposit', {
      p_family_id: 'f1',
      p_amount: 1000,
      p_note: 'cash',
    });
    expect(deposit).toEqual(result);
  });

  it('defaults the deposit note to an empty string', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { family_id: 'f1', deposited: 10, balance_after: 10 }, error: null });
    await adminDeposit('f1', 10);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_deposit', {
      p_family_id: 'f1',
      p_amount: 10,
      p_note: '',
    });
  });

  it('propagates PERMISSION_DENIED from a non-admin caller (server re-authorizes)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(adminDeposit('f1', 1000)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('binds a member to a family with an active default status', async () => {
    const result = { family_id: 'f1', user_id: 'u1', status: 'active' };
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null });
    const bound = await adminProvisionFamilyMember('u1', 'f1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_provision_family_member', {
      p_user_id: 'u1',
      p_family_id: 'f1',
      p_status: 'active',
    });
    expect(bound).toEqual(result);
  });

  it('propagates PERMISSION_DENIED when binding a member without admin rights', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(adminProvisionFamilyMember('u1', 'f1')).rejects.toThrow('PERMISSION_DENIED');
  });
});
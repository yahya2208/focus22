/**
 * GATE V1.3 — family contact service tests (mocked supabase transport).
 *
 * Verifies fetchMyFamilyContact / saveMyFamilyContact call exactly the
 * member-scoped RPCs with verbatim payloads — no family_id parameter may
 * ever leave the client (the server derives it from auth.uid()), and no
 * money/ledger math exists anywhere near this path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchMyFamilyContact, saveMyFamilyContact } from '../../services/pilot-account-service';

describe('pilot-account-service — family contact (V1.3)', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('fetches the own-family contact without sending any family identifier', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        family_id: 'fA',
        contact_name: 'Ahmed',
        contact_phone: '0555000000',
        contact_address: 'Rue 12',
        contact_notes: null,
      },
    });

    const contact = await fetchMyFamilyContact();

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_my_family_contact_get');
    expect(contact).toEqual({
      family_id: 'fA',
      contact_name: 'Ahmed',
      contact_phone: '0555000000',
      contact_address: 'Rue 12',
      contact_notes: null,
    });
  });

  it('returns null when the caller has no linked family', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null });
    expect(await fetchMyFamilyContact()).toBeNull();
  });

  it('saves with exact field mapping and no family identifier', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { family_id: 'fA' } });

    await saveMyFamilyContact({ name: 'Ahmed', phone: '0555000000', address: 'Rue 12', notes: '' });

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_my_family_contact_set', {
      p_name: 'Ahmed',
      p_phone: '0555000000',
      p_address: 'Rue 12',
      p_notes: '',
    });
  });

  it('propagates transport and permission errors to the caller', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('FAMILY_NOT_FOUND'));
    await expect(fetchMyFamilyContact()).rejects.toThrow('FAMILY_NOT_FOUND');
    mocks.rpc.mockRejectedValueOnce(new Error('RPC_ERROR'));
    await expect(
      saveMyFamilyContact({ name: 'x', phone: 'y', address: '', notes: '' }),
    ).rejects.toThrow('RPC_ERROR');
  });
});

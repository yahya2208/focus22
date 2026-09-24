/**
 * Family vegetable preferences service tests (mocked supabase transport).
 *
 * Verifies fetchMyFamilyPreferences / saveMyFamilyPreferences call exactly
 * the member-scoped RPCs with verbatim payloads — no family_id parameter may
 * ever leave the client, and no money/ledger math exists anywhere near this
 * optional display-only path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchMyFamilyPreferences, saveMyFamilyPreferences } from '../../services/pilot-account-service';

describe('pilot-account-service — family preferences', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('fetches the own-family preferences without sending any family identifier', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { family_id: 'fA', preferred_delivery_time: 'morning', veg_notes: null },
    });

    const prefs = await fetchMyFamilyPreferences();

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_my_family_preferences_get');
    expect(prefs).toEqual({
      family_id: 'fA',
      preferred_delivery_time: 'morning',
      veg_notes: null,
    });
  });

  it('returns null when the caller has no linked family', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null });
    expect(await fetchMyFamilyPreferences()).toBeNull();
  });

  it('saves with exact field mapping and no family identifier', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { family_id: 'fA' } });

    await saveMyFamilyPreferences({ preferredDeliveryTime: 'evening', vegNotes: 'no cilantro' });

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_my_family_preferences_set', {
      p_preferred_delivery_time: 'evening',
      p_veg_notes: 'no cilantro',
    });
  });

  it('throws without swallowing transport errors', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC_ERROR' } });
    await expect(fetchMyFamilyPreferences()).rejects.toThrow('RPC_ERROR');
  });
});

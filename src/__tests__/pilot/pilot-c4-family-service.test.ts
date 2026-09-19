/**
 * GATE C4 — pilot-family-service RPC contract (pure unit).
 *
 * Pins the exact RPC names and arguments the client uses and proves the
 * family is ALWAYS derived server-side: no call ever transmits a family_id
 * (p_family_id / family_id) and no call hits the user-scoped pilot_my_orders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

import {
  fetchFamilySavedItems,
  saveFamilyItem,
  updateFamilySavedItem,
  removeFamilySavedItem,
  clearFamilySavedItems,
  fetchFamilyOrders,
} from '../../services/pilot-family-service';

describe('GATE C4 — family-service RPC contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('fetchFamilySavedItems calls pilot_family_saved_list with no arguments', async () => {
    await fetchFamilySavedItems();
    expect(mockRpc).toHaveBeenCalledWith('pilot_family_saved_list', {});
  });

  it('saveFamilyItem calls pilot_family_saved_add with catalog ref + quantity only (no family id)', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
    await saveFamilyItem('9a34c948-8cf8-4deb-991e-086fe7740af5', 1.5);
    expect(mockRpc).toHaveBeenCalledWith('pilot_family_saved_add', {
      p_catalog_ref: '9a34c948-8cf8-4deb-991e-086fe7740af5',
      p_quantity: 1.5,
    });
    const args = mockRpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('family_id');
    expect(args).not.toHaveProperty('p_family_id');
  });

  it('updateFamilySavedItem calls pilot_family_saved_update with the new quantity', async () => {
    await updateFamilySavedItem('a', 2.5);
    expect(mockRpc).toHaveBeenCalledWith('pilot_family_saved_update', {
      p_catalog_ref: 'a',
      p_quantity: 2.5,
    });
  });

  it('removeFamilySavedItem / clearFamilySavedItems call the matching RPCs', async () => {
    await removeFamilySavedItem('a');
    expect(mockRpc).toHaveBeenCalledWith('pilot_family_saved_remove', { p_catalog_ref: 'a' });
    await clearFamilySavedItems();
    expect(mockRpc).toHaveBeenCalledWith('pilot_family_saved_clear', {});
  });

  it('fetchFamilyOrders calls pilot_family_orders (family-scoped, never user-scoped pilot_my_orders)', async () => {
    await fetchFamilyOrders();
    expect(mockRpc).toHaveBeenCalledWith('pilot_family_orders', {});
    expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain('pilot_my_orders');
  });

  it('propagates server errors instead of returning partial data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'QUANTITY_INVALID' } });
    await expect(fetchFamilySavedItems()).rejects.toThrow('QUANTITY_INVALID');
  });
});
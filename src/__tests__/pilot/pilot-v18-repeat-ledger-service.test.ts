/**
 * GATE V1.8 — repeat + admin-ledger service tests (mocked transport).
 * Pins exact RPC names/args, verbatim payload mapping, and error surfacing.
 * No money math anywhere near these paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { fetchFamilyOrderItems } from '../../services/order-tracking-service';
import { adminFamilyLedger } from '../../services/pilot-account-service';

describe('fetchFamilyOrderItems', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('calls the family RPC with the order id and maps lines verbatim', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        order_id: 'o1',
        items: [
          { catalog_ref: 'v1', name: 'Tomato', name_ar: 'طماطم', quantity: 1.5, unit: 'kg', unit_price: 120 },
        ],
      },
    });

    const lines = await fetchFamilyOrderItems('o1');

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_family_order_items', { p_order_id: 'o1' });
    expect(lines).toEqual([
      { catalog_ref: 'v1', name: 'Tomato', name_ar: 'طماطم', quantity: 1.5, unit: 'kg', unit_price: 120 },
    ]);
  });

  it('returns [] when the payload has no items and propagates denials', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {} });
    expect(await fetchFamilyOrderItems('o1')).toEqual([]);
    mocks.rpc.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(fetchFamilyOrderItems('o2')).rejects.toThrow('PERMISSION_DENIED');
    mocks.rpc.mockRejectedValueOnce(new Error('ORDER_CANCELLED'));
    await expect(fetchFamilyOrderItems('o3')).rejects.toThrow('ORDER_CANCELLED');
  });
});

describe('adminFamilyLedger', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('calls the admin RPC with family id and maps entries verbatim', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        family_id: 'f1',
        entries: [
          {
            id: 'l1', created_at: '2026-01-01', transaction_type: 'PURCHASE', amount: -770,
            related_order_id: 'o1', order_number: 'FC-29', reference: 'FC-29', note: '',
            balance_after: 9230,
          },
        ],
      },
    });

    const entries = await adminFamilyLedger('f1');

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_family_ledger', { p_family_id: 'f1', p_limit: 100 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({ transaction_type: 'PURCHASE', amount: -770, order_number: 'FC-29' }),
    );
  });

  it('returns [] on empty payload and propagates denial', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {} });
    expect(await adminFamilyLedger('f1')).toEqual([]);
    mocks.rpc.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(adminFamilyLedger('f1')).rejects.toThrow('PERMISSION_DENIED');
  });
});

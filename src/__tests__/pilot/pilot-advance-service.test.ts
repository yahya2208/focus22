/**
 * GATE V1.4 — advanceStoreOrder service tests (mocked supabase transport).
 * Pins the exact RPC name/args and error propagation. No courier, pricing,
 * or ledger involvement at this layer by construction (single RPC call).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { advanceStoreOrder } from '../../services/order-service';

describe('order-service — advanceStoreOrder (V1.4)', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('calls pilot_admin_advance_order with exact args and maps the result', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { order_id: 'o1', order_number: 'FC-29', previous_status: 'confirmed', status: 'preparing' },
    });

    const result = await advanceStoreOrder('o1', 'preparing');

    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_advance_order', {
      p_order_id: 'o1',
      p_to_status: 'preparing',
    });
    expect(result.status).toBe('preparing');
    expect(result.previous_status).toBe('confirmed');
  });

  it('propagates server rejections (whitelist / permission) verbatim', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('TRANSITION_NOT_ALLOWED'));
    await expect(advanceStoreOrder('o1', 'delivered')).rejects.toThrow('TRANSITION_NOT_ALLOWED');
    mocks.rpc.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(advanceStoreOrder('o1', 'confirmed')).rejects.toThrow('PERMISSION_DENIED');
  });
});

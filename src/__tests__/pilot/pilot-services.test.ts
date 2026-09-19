/**
 * Neighborhood Pilot — service layer tests (mocked supabase transport).
 * Covers: storefront reads, admin writes + permission error surfacing,
 * submission gating / error classification, telemetry wiring for the new
 * events, store-operator order flows, and reset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = {
  rpc: vi.fn(),
  auth: { getSession: vi.fn() },
  createDeliveryOrder: vi.fn(),
  estimateDelivery: vi.fn(),
  track: vi.fn(),
};

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc, auth: mocks.auth })),
}));

vi.mock('../../services/delivery-service', () => ({
  createDeliveryOrder: (...a: unknown[]) => mocks.createDeliveryOrder(...a),
  estimateDelivery: (...a: unknown[]) => mocks.estimateDelivery(...a),
}));

vi.mock('../../core/telemetry', () => ({
  track: (...a: unknown[]) => mocks.track(...a),
}));

import {
  fetchActiveNeighborhoods,
  fetchActiveStores,
  fetchStoreProducts,
  adminListNeighborhoods,
  adminUpsertNeighborhood,
  adminUpsertStore,
  adminSetStoreInventory,
  adminLinkFamily,
  isPilotMarked,
} from '../../services/neighborhood-service';
import {
  submitPilotOrder,
  classifySubmissionError,
  updateStoreOrderStatus,
  fetchStoreOrders,
  setDeliveredActuals,
  settleFamilyOrder,
  resetPilot,
  fetchEstimate,
  ensureOrderSession,
  isPilotOrderStatus,
  PILOT_ORDER_STATUSES,
} from '../../services/order-service';

const row = { id: 'n1', name: 'N', name_ar: '', slug: 'pilot-n', status: 'active', description: '' };

describe('neighborhood-service — storefront reads', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('fetches and maps active neighborhoods', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [row], error: null });
    const list = await fetchActiveNeighborhoods();
    expect(list[0]?.id).toBe('n1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_active_neighborhoods', {});
  });

  it('passes the neighborhood id to active stores', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await fetchActiveStores('n1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_active_stores', { p_neighborhood_id: 'n1' });
  });

  it('surfaces PERMISSION_DENIED from the transport as a normalized code', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(fetchActiveNeighborhoods()).rejects.toThrow('PERMISSION_DENIED');
  });

  it('treats a null payload as an unexpected response', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchStoreProducts('s1')).rejects.toThrow('UNEXPECTED_RESPONSE');
  });
});

describe('neighborhood-service — admin writes', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('upserts a neighborhood with defaults', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: 'n9', slug: 'pilot-n9' }, error: null });
    const out = await adminUpsertNeighborhood({ name: 'Nine', slug: 'pilot-n9' });
    expect(out).toEqual({ id: 'n9', slug: 'pilot-n9' });
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_upsert_neighborhood', {
      p_name: 'Nine', p_name_ar: '', p_slug: 'pilot-n9', p_status: 'active',
    });
  });

  it('upserts a store with the neighborhood scope', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: 's1', slug: 'pilot-s1' }, error: null });
    await adminUpsertStore({ neighborhood_id: 'n1', name: 'S1', slug: 'pilot-s1' });
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_upsert_store', {
      p_neighborhood_id: 'n1', p_name: 'S1', p_name_ar: '', p_slug: 'pilot-s1',
      p_status: 'active', p_operator_user_id: null,
    });
  });

  it('assigns inventory by id list', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await adminSetStoreInventory('s1', ['i1', 'i2']);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_set_store_inventory', {
      p_store_id: 's1', p_inventory_ids: ['i1', 'i2'],
    });
  });

  it('links and unlinks families', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await adminLinkFamily('n1', 'f1', true);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_link_family', {
      p_neighborhood_id: 'n1', p_family_id: 'f1', p_linked: true,
    });
  });

  it('propagates denial on admin list', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(adminListNeighborhoods()).rejects.toThrow('PERMISSION_DENIED');
  });
});

describe('order-service — submission path (Phase 6)', () => {
  beforeEach(() => {
    mocks.createDeliveryOrder.mockReset();
    mocks.track.mockReset();
  });

  it('rejects an empty basket before calling the transport', async () => {
    await expect(
      submitPilotOrder({ name: 'X', phone: '5', zoneId: 'z', address: 'a', items: [{ catalogRef: '  ', quantity: 0 }] }),
    ).rejects.toThrow('ITEMS_REQUIRED');
    expect(mocks.createDeliveryOrder).not.toHaveBeenCalled();
  });

  it('delegates to the canonical createDeliveryOrder and tracks order_created', async () => {
    mocks.createDeliveryOrder.mockResolvedValueOnce({ orderId: 'o1', orderNumber: 'ORD-1', total: 45 });
    const out = await submitPilotOrder({
      name: 'A', phone: '5', zoneId: 'z', address: 'a',
      items: [{ catalogRef: 'pilot:item-1', quantity: 2, name: 'Item', unitPrice: 999 }],
      storeId: 's1', neighborhoodId: 'n1',
    });
    expect(out.orderId).toBe('o1');
    expect(mocks.createDeliveryOrder).toHaveBeenCalledWith(
      { name: 'A', phone: '5', zoneId: 'z', address: 'a', notes: '' },
      [{ catalogRef: 'pilot:item-1', quantity: 2, name: 'Item', unitPrice: 999 }],
      false, // intent marker is OFF unless the customer explicitly confirmed a new order
    );
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ event: 'checkout_submit' }));
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ event: 'order_created', entityId: 'o1' }));
  });

  it('passes the intent marker ONLY on an explicit new-order confirmation (OQ4=B)', async () => {
    mocks.createDeliveryOrder
      .mockRejectedValueOnce(new Error('DUPLICATE_ORDER'))
      .mockResolvedValueOnce({ orderId: 'o2', orderNumber: 'ORD-2', total: 45 });
    const first = submitPilotOrder({
      name: 'A', phone: '5', zoneId: 'z', address: 'a',
      items: [{ catalogRef: 'pilot:item-1', quantity: 1 }],
    });
    await expect(first).rejects.toThrow('DUPLICATE_ORDER');
    expect(mocks.createDeliveryOrder).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), false);
    const second = await submitPilotOrder({
      name: 'A', phone: '5', zoneId: 'z', address: 'a',
      items: [{ catalogRef: 'pilot:item-1', quantity: 1 }],
      intentional: true,
    });
    expect(second.orderId).toBe('o2');
    expect(mocks.createDeliveryOrder).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), true);
  });

  it('is single-flight: a second submit while one is in flight reuses the first request', async () => {
    mocks.createDeliveryOrder.mockResolvedValue({ orderId: 'o3', orderNumber: 'ORD-3', total: 45 });
    const p1 = submitPilotOrder({
      name: 'A', phone: '5', zoneId: 'z', address: 'a',
      items: [{ catalogRef: 'pilot:item-1', quantity: 1 }],
    });
    const p2 = submitPilotOrder({
      name: 'A', phone: '5', zoneId: 'z', address: 'a',
      items: [{ catalogRef: 'pilot:item-1', quantity: 1 }],
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.orderId).toBe('o3');
    expect(r2.orderId).toBe('o3');
    expect(mocks.createDeliveryOrder).toHaveBeenCalledTimes(1);
  });

  it('classifies the Gate A server responses DUPLICATE_ORDER and FAMILY_ACCOUNT_REQUIRED', async () => {
    expect(classifySubmissionError(new Error('DUPLICATE_ORDER'))).toBe('DUPLICATE_ORDER');
    expect(classifySubmissionError(new Error('FAMILY_ACCOUNT_REQUIRED'))).toBe('FAMILY_ACCOUNT_REQUIRED');
  });

  it('classifies server-authoritative failures and tracks order_failed', async () => {
    mocks.createDeliveryOrder.mockRejectedValueOnce(new Error('ITEM_NOT_FOUND'));
    await expect(
      submitPilotOrder({
        name: 'A', phone: '5', zoneId: 'z', address: 'a',
        items: [{ catalogRef: 'pilot:ghost', quantity: 1 }],
      }),
    ).rejects.toThrow('ITEM_NOT_FOUND');
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'order_failed', properties: { error_code: 'ITEMS_NOT_FOUND' } }),
    );
  });
});

describe('order-service — error classification', () => {
  it('maps server codes to client-facing codes', () => {
    expect(classifySubmissionError(new Error('UNAUTHENTICATED'))).toBe('NEEDS_AUTHENTICATION');
    expect(classifySubmissionError(new Error('MULTI_STORE_ORDER'))).toBe('MULTI_STORE_ORDER');
    expect(classifySubmissionError(new Error('ZONE_NOT_ACTIVE'))).toBe('ZONE_NOT_ACTIVE');
    expect(classifySubmissionError(new Error('ITEM_NOT_ORDERABLE'))).toBe('ITEMS_NOT_ORDERABLE');
  });

  it('falls back to SERVER_ERROR for unknown codes', () => {
    expect(classifySubmissionError(new Error('network down'))).toBe('SERVER_ERROR');
  });
});

describe('order-service — store operations + reset', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.track.mockReset();
  });

  it('lists store orders through the operator RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'o1', order_number: 'ORD-1' }], error: null });
    const orders = await fetchStoreOrders('s1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_orders_for_store', { p_store_id: 's1' });
    expect(orders[0]?.id).toBe('o1');
  });

  it('throws the transport message when the store operator RPC fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(fetchStoreOrders('s1')).rejects.toThrow('PERMISSION_DENIED');
  });

  it('tracks order_status_changed for intermediate statuses', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await updateStoreOrderStatus('o1', 'confirmed');
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'order_status_changed', entityId: 'o1' }),
    );
  });

  it('tracks order_completed only at delivered', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await updateStoreOrderStatus('o1', 'delivered');
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ event: 'order_completed' }));
    expect(mocks.track).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'order_status_changed' }));
  });

  it('runs the guarded pilot_reset via RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await resetPilot();
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_reset');
  });

  it('recognizes the closed status vocabulary', () => {
    for (const s of PILOT_ORDER_STATUSES) expect(isPilotOrderStatus(s)).toBe(true);
    expect(isPilotOrderStatus('shipped')).toBe(false);
  });
});

describe('order-service — family settlement (Gate B)', () => {
  beforeEach(() => mocks.rpc.mockReset());

  const items = [
    { id: 'i1', delivered_quantity: 5.3 },
    { id: 'i2', delivered_quantity: 2 },
  ];

  it('records delivered actuals through the canonical RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { updated_items: 2 }, error: null });
    const updated = await setDeliveredActuals('o1', items);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_set_delivered_actuals', {
      p_order_id: 'o1',
      p_items: items,
    });
    expect(updated).toBe(2);
  });

  it('surfaces the transport message when recording actuals fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } });
    await expect(setDeliveredActuals('o1', items)).rejects.toThrow('PERMISSION_DENIED');
  });

  it('settles through pilot_family_settle_and_deliver with a default empty reason', async () => {
    const result = {
      order_id: 'o1',
      status: 'delivered',
      final_subtotal: 530,
      delivery_fee: 20,
      final_total: 550,
      balance_after: 100,
      debt_remaining: 450,
    };
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null });
    const settled = await settleFamilyOrder('o1', items);
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_family_settle_and_deliver', {
      p_order_id: 'o1',
      p_items: items,
      p_reason: '',
    });
    expect(settled).toEqual(result);
  });

  it('returns server totals untouched (no client balance/ledger math)', async () => {
    const result = {
      order_id: 'o1',
      status: 'delivered',
      final_subtotal: 530,
      delivery_fee: 20,
      final_total: 550,
      balance_after: -200,
      debt_remaining: 450,
    };
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null });
    const settled = await settleFamilyOrder('o1', items, 'cash on delivery');
    expect(settled.final_total).toBe(550);
    expect(settled.balance_after).toBe(-200);
    expect(settled.debt_remaining).toBe(450);
    // The client must never derive one figure from another.
    expect(Object.keys(settled).sort()).toEqual([
      'balance_after',
      'debt_remaining',
      'delivery_fee',
      'final_subtotal',
      'final_total',
      'order_id',
      'status',
    ]);
  });

  it('surfaces ORDER_ALREADY_SETTLED so the UI can block a duplicate', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'ORDER_ALREADY_SETTLED' } });
    await expect(settleFamilyOrder('o1', items)).rejects.toThrow('ORDER_ALREADY_SETTLED');
  });
});

describe('order-service — guest gate (P3)', () => {
  beforeEach(() => mocks.auth.getSession.mockReset());

  it('requires a session at submission time', async () => {
    mocks.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(ensureOrderSession()).rejects.toThrow('NEEDS_AUTHENTICATION');
  });

  it('flags anonymous sessions as guests', async () => {
    mocks.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { app_metadata: { provider: 'anonymous' }, email: null } } },
    });
    const { isGuest } = await ensureOrderSession();
    expect(isGuest).toBe(true);
  });

  it('does NOT create a guest while merely fetching (no auth call besides getSession)', async () => {
    mocks.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { app_metadata: {}, email: 'x@y.z' } } },
    });
    await ensureOrderSession();
    expect(mocks.auth.getSession).toHaveBeenCalledTimes(1);
  });
});

describe('neighborhood-service — pilot markers', () => {
  it('recognizes pilot slugs and source keys', () => {
    expect(isPilotMarked({ slug: 'pilot-store-1' })).toBe(true);
    expect(isPilotMarked({ source_key: 'pilot:item1' })).toBe(true);
    expect(isPilotMarked({ slug: 'iphone-15' })).toBe(false);
    expect(isPilotMarked(null)).toBe(false);
  });
});

describe('order-service — estimate delegation', () => {
  it('proxies delivery estimates to the canonical service', async () => {
    mocks.estimateDelivery.mockResolvedValueOnce({ fee: 5 });
    await fetchEstimate('z1', 100);
    expect(mocks.estimateDelivery).toHaveBeenCalledWith('z1', 100);
  });
});
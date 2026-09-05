/**
 * Neighborhood Pilot — courier / store-ops service layer tests (mocked transport).
 * Covers: 00068 courier RPCs (lists, accept, strict status transitions),
 * order detail (phone withheld for courier scope), family tracking, admin health,
 * and the frontend transition helpers.
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
  fetchAvailableOrders,
  fetchMyDeliveries,
  acceptOrder,
  courierSetStatus,
  courierActionsFor,
  fetchOrderDetail,
  isPilotOrderStatus,
} from '../../services/courier-service';
import {
  fetchTrackedOrderStatus,
  fetchPilotHealth,
  storeActionsFor,
  PILOT_ORDER_STATUSES,
} from '../../services/order-service';
import { fetchMyStores } from '../../services/neighborhood-service';

const availableRow = {
  order_id: 'o1', order_number: 'FC-000001', status: 'confirmed',
  store_id: 's1', store_name: 'S', store_name_ar: '', neighborhood_name: 'N',
  customer_name: 'Ali', zone_name: 'Zone', address: 'X', notes: '',
  item_count: 2, total: 100, created_at: '2026-09-05T00:00:00Z',
};

describe('courier-service — streams & actions', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.track.mockReset();
  });

  it('maps available orders and calls the right RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [availableRow], error: null });
    const list = await fetchAvailableOrders();
    expect(list[0]?.order_id).toBe('o1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_orders_available', {});
    expect(Object.prototype.hasOwnProperty.call(list[0], 'customer_phone')).toBe(false);
  });

  it('fetches my assigned deliveries', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [availableRow], error: null });
    await fetchMyDeliveries();
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_orders_for_courier', {});
  });

  it('accepts an order by id', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { order_id: 'o1', status: 'confirmed', courier_user_id: 'u1' }, error: null });
    const out = await acceptOrder('o1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_order_accept', { p_order_id: 'o1' });
    expect(out.courier_user_id).toBe('u1');
  });

  it('surfaces RPC errors verbatim for the UI classifier', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'ORDER_UNASSIGNABLE' } });
    await expect(acceptOrder('o1')).rejects.toThrow('ORDER_UNASSIGNABLE');
  });

  it('courier pickup fires order_status_changed telemetry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { order_id: 'o1', status: 'out_for_delivery' }, error: null });
    await courierSetStatus('o1', 'out_for_delivery');
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ event: 'order_status_changed', entityId: 'o1' }));
  });

  it('courier delivery fires order_completed telemetry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { order_id: 'o1', status: 'delivered' }, error: null });
    await courierSetStatus('o1', 'delivered');
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ event: 'order_completed', entityId: 'o1' }));
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_courier_set_status', { p_order_id: 'o1', p_status: 'delivered' });
  });

  it('order detail RPC carries the order id', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { order: { id: 'o1', order_number: 'FC-000001' }, items: [] as { id: string }[] },
      error: null,
    });
    const d = await fetchOrderDetail('o1');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_order_detail', { p_order_id: 'o1' });
    expect(d.order.order_number).toBe('FC-000001');
  });
});

describe('courier-service — transition matrix helpers', () => {
  it('exposes pickup only from confirmed/preparing', () => {
    expect(courierActionsFor('confirmed')).toEqual([{ status: 'out_for_delivery', labelKey: 'pilot.pickup' }]);
    expect(courierActionsFor('preparing')).toEqual([{ status: 'out_for_delivery', labelKey: 'pilot.pickup' }]);
    expect(courierActionsFor('pending')).toEqual([]);
    expect(courierActionsFor('cancelled')).toEqual([]);
  });

  it('exposes delivered only from out_for_delivery', () => {
    expect(courierActionsFor('out_for_delivery')).toEqual([{ status: 'delivered', labelKey: 'pilot.markDelivered' }]);
  });
});

describe('order-service — 00068 additions', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('store actions follow the canonical lifecycle', () => {
    expect(storeActionsFor('pending').map((a) => a.status)).toContain('confirmed');
    expect(storeActionsFor('confirmed').map((a) => a.status)).toContain('preparing');
    expect(storeActionsFor('preparing').map((a) => a.status)).toContain('out_for_delivery');
    expect(storeActionsFor('out_for_delivery')).toEqual([]);
    expect(storeActionsFor('delivered')).toEqual([]);
    expect(storeActionsFor('cancelled')).toEqual([]);
  });

  it('family tracking calls the status-for-user RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { order_id: 'o1', order_number: 'FC-000001', status: 'preparing', created_at: 'x', updated_at: 'x' }, error: null });
    const s = await fetchTrackedOrderStatus('o1');
    expect(s.status).toBe('preparing');
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_order_status_for_user', { p_order_id: 'o1' });
  });

  it('admin health RPC returns the counts object', async () => {
    const health = { families: 5, stores: 1, orders: { total: 3 } };
    mocks.rpc.mockResolvedValueOnce({ data: health, error: null });
    const h = await fetchPilotHealth();
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_admin_pilot_health');
    expect(h.families).toBe(5);
  });

  it('my-stores helper returns store rows', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 's1', slug: 'pilot-s1', status: 'active' }], error: null });
    const ss = await fetchMyStores();
    expect(mocks.rpc).toHaveBeenCalledWith('pilot_my_stores', {});
    expect(ss[0]?.id).toBe('s1');
  });

  it('canonical status names are unchanged (six, no inventions)', () => {
    expect(PILOT_ORDER_STATUSES).toEqual([
      'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled',
    ]);
  });

  it('isPilotOrderStatus is a strict guard', () => {
    expect(isPilotOrderStatus('delivered')).toBe(true);
    expect(isPilotOrderStatus('ready_for_pickup')).toBe(false);
  });
});

describe('courier-service — RPC error surfacing', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('propagates TRANSITION_NOT_ALLOWED', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TRANSITION_NOT_ALLOWED' } });
    await expect(courierSetStatus('o1', 'delivered')).rejects.toThrow('TRANSITION_NOT_ALLOWED');
  });
});
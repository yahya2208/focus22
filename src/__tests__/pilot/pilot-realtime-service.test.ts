/**
 * Neighborhood Pilot — realtime feed reliability layer (GATE 6).
 * Channel lifecycle, payload dedupe, degraded->fallback polling, reconnect to
 * live, stale detection and teardown; plus the order-list merge helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRpc, mockChannel, getSubscribeCbs, getPayloadHandlers, getChannelConfigs, getUnsubscribed, resetRT } = vi.hoisted(() => {
  const subscribeCbs: Array<(status: string) => void> = [];
  const payloadHandlers: Array<(payload: Record<string, unknown>) => void> = [];
  const channelConfigs: Array<{ name: string; config: Record<string, unknown> }> = [];
  const unsubscribed: string[] = [];

  const mockChannel = vi.fn((name: string) => {
    const ch = {
      on: (_evt: string, config: Record<string, unknown>, cb: (payload: Record<string, unknown>) => void) => {
        channelConfigs.push({ name, config });
        payloadHandlers.push(cb);
        return ch;
      },
      subscribe: (cb: (status: string) => void) => {
        subscribeCbs.push(cb);
        return ch;
      },
      unsubscribe: () => {
        unsubscribed.push(name);
      },
    };
    return ch;
  });
  const mockRpc = vi.fn(async () => ({ data: [], error: null }));

  return {
    mockRpc,
    mockChannel,
    getSubscribeCbs: () => subscribeCbs,
    getPayloadHandlers: () => payloadHandlers,
    getChannelConfigs: () => channelConfigs,
    getUnsubscribed: () => unsubscribed,
    resetRT: () => {
      subscribeCbs.length = 0;
      payloadHandlers.length = 0;
      channelConfigs.length = 0;
      unsubscribed.length = 0;
      mockChannel.mockClear();
      mockRpc.mockClear();
    },
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ channel: mockChannel, rpc: mockRpc }),
}));

import { createPilotOrderRealtime } from '../../services/pilot-realtime-service';
import {
  mergeRealtimeOrderPayload,
  summaryFromRealtimeRow,
  type CustomerOrderSummary,
} from '../../services/order-tracking-service';

const ORDER_ROW = {
  id: 'o1',
  order_number: 'FC-000001',
  status: 'confirmed',
  subtotal: 50,
  delivery_fee: 5,
  total: 55,
  store_id: 's1',
  user_id: 'u1',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
};

const payload = (table = 'orders', eventType: 'INSERT' | 'UPDATE' | 'DELETE' = 'UPDATE', newRow: Record<string, unknown> | null = ORDER_ROW, oldRow: Record<string, unknown> | null = null) => ({
  schema: 'public',
  table,
  eventType,
  new: newRow,
  old: oldRow,
});

/** Mapped PilotRealtimePayload as delivered by the controller after dedupe. */
const mapped = (table = 'orders', eventType: 'INSERT' | 'UPDATE' | 'DELETE' = 'UPDATE', newRow: Record<string, unknown> | null = ORDER_ROW, oldRow: Record<string, unknown> | null = null) => ({
  schema: 'public',
  table,
  eventType,
  newRecord: newRow,
  oldRecord: oldRow,
});

describe('createPilotOrderRealtime — channel lifecycle', () => {
  beforeEach(() => resetRT());
  afterEach(() => vi.useRealTimers());

  it('opens a scoped postgres_changes channel and reaches live on SUBSCRIBED', () => {
    const onPayload = vi.fn();
    const onStatus = vi.fn();
    const feed = createPilotOrderRealtime({
      table: 'orders',
      filter: 'user_id=eq.u1',
      onPayload,
      onStatus,
    });
    feed.start();

    expect(mockChannel).toHaveBeenCalledTimes(1);
    const cfg = getChannelConfigs()[0]!;
    expect(cfg.name).toContain('orders');
    expect(cfg.config).toMatchObject({
      event: '*',
      schema: 'public',
      table: 'orders',
      filter: 'user_id=eq.u1',
    });
    expect(feed.getStatus()).toBe('connecting');

    getSubscribeCbs()[0]!('SUBSCRIBED');
    expect(feed.getStatus()).toBe('live');
    expect(onStatus).toHaveBeenCalledWith('live');
  });

  it('forwards a postgres_changes payload as the mapped PilotRealtimePayload', () => {
    const onPayload = vi.fn();
    const feed = createPilotOrderRealtime({ table: 'orders', onPayload });
    feed.start();
    getPayloadHandlers()[0]!(payload('orders', 'UPDATE', ORDER_ROW));
    expect(onPayload).toHaveBeenCalledTimes(1);
    const got = onPayload.mock.calls[0]![0];
    expect(got).toMatchObject({
      eventType: 'UPDATE',
      schema: 'public',
      table: 'orders',
      newRecord: ORDER_ROW,
    });
  });

  it('stop() unsubscribes, stops polling and enters stopped', () => {
    const onPayload = vi.fn();
    const feed = createPilotOrderRealtime({
      table: 'orders',
      onPayload,
      onPollFetch: vi.fn(async () => undefined),
      maxDegradedBeforeFallback: 1,
    });
    feed.start();
    feed.stop();
    expect(getUnsubscribed()).toHaveLength(1);
    expect(feed.getStatus()).toBe('stopped');
    // Late events after stop are ignored.
    expect(getSubscribeCbs()).toHaveLength(1);
    expect(feed.isStale()).toBe(false);
  });
});

describe('createPilotOrderRealtime — dedupe', () => {
  beforeEach(() => resetRT());

  it('drops duplicate deliveries of the same row version', () => {
    const onPayload = vi.fn();
    const feed = createPilotOrderRealtime({ table: 'orders', onPayload });
    feed.start();
    const p = payload('orders', 'UPDATE', ORDER_ROW);
    getPayloadHandlers()[0]!(p);
    getPayloadHandlers()[0]!(p);
    expect(onPayload).toHaveBeenCalledTimes(1);
  });

  it('passes a genuinely new row version (updated_at changed)', () => {
    const onPayload = vi.fn();
    const feed = createPilotOrderRealtime({ table: 'orders', onPayload });
    feed.start();
    getPayloadHandlers()[0]!(payload('orders', 'UPDATE', ORDER_ROW));
    getPayloadHandlers()[0]!(
      payload('orders', 'UPDATE', { ...ORDER_ROW, status: 'preparing', updated_at: '2026-01-01T10:05:00Z' }),
    );
    expect(onPayload).toHaveBeenCalledTimes(2);
  });

  it('clears the dedupe key on DELETE and still forwards it', () => {
    const onPayload = vi.fn();
    const feed = createPilotOrderRealtime({ table: 'orders', onPayload });
    feed.start();
    getPayloadHandlers()[0]!(payload('orders', 'UPDATE', ORDER_ROW));
    getPayloadHandlers()[0]!(payload('orders', 'DELETE', null, ORDER_ROW));
    // Same version after DELETE is a legitimately new delivery.
    getPayloadHandlers()[0]!(payload('orders', 'UPDATE', ORDER_ROW));
    expect(onPayload).toHaveBeenCalledTimes(3);
  });
});

describe('createPilotOrderRealtime — degraded fallback & recovery', () => {
  beforeEach(() => {
    resetRT();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('enters fallback after maxDegraded observations and polls on interval', async () => {
    const onStatus = vi.fn();
    const poll = vi.fn(async () => undefined);
    const feed = createPilotOrderRealtime({
      table: 'orders',
      onStatus,
      onPollFetch: poll,
      maxDegradedBeforeFallback: 2,
      pollIntervalMs: 30_000,
    });
    feed.start();
    const statusCb = getSubscribeCbs()[0]!;
    statusCb('CHANNEL_ERROR');
    expect(feed.getStatus()).toBe('connecting');
    statusCb('CHANNEL_ERROR');
    expect(feed.getStatus()).toBe('fallback');
    expect(onStatus).toHaveBeenCalledWith('fallback');

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('recovers to live on SUBSCRIBED and stops the fallback poller', async () => {
    const poll = vi.fn(async () => undefined);
    const feed = createPilotOrderRealtime({
      table: 'orders',
      onStatus: vi.fn(),
      onPollFetch: poll,
      maxDegradedBeforeFallback: 1,
    });
    feed.start();
    getSubscribeCbs()[0]!('CLOSED');
    expect(feed.getStatus()).toBe('fallback');

    getSubscribeCbs()[0]!('SUBSCRIBED');
    expect(feed.getStatus()).toBe('live');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(poll).not.toHaveBeenCalled();
  });
});

describe('createPilotOrderRealtime — stale detection & manual refresh', () => {
  beforeEach(() => {
    resetRT();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('isStale() reflects time since the last successful sync while not live', () => {
    const feed = createPilotOrderRealtime({ table: 'orders', onPayload: vi.fn() });
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    feed.start();
    getSubscribeCbs()[0]!('SUBSCRIBED'); // lastSyncAt = 12:00:00
    getSubscribeCbs()[0]!('CHANNEL_ERROR');
    getSubscribeCbs()[0]!('CHANNEL_ERROR');
    getSubscribeCbs()[0]!('CHANNEL_ERROR');
    expect(feed.getStatus()).toBe('fallback');
    expect(feed.isStale()).toBe(false); // now - lastSync < staleAfterMs (45s)

    vi.setSystemTime(new Date(2026, 0, 1, 12, 1, 30));
    expect(feed.isStale()).toBe(true);
  });

  it('refreshNow() invokes the fallback fetcher and marks a successful sync', async () => {
    const poll = vi.fn(async () => undefined);
    const feed = createPilotOrderRealtime({
      table: 'orders',
      onPayload: vi.fn(),
      onPollFetch: poll,
    });
    feed.start();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    feed.refreshNow();
    await Promise.resolve();
    expect(poll).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 5));
    expect(feed.isStale()).toBe(false);
  });
});

describe('order-tracking realtime merge helpers', () => {
  const existing: CustomerOrderSummary = {
    order_id: 'o1',
    order_number: 'FC-000001',
    status: 'confirmed',
    subtotal: 50,
    delivery_fee: 5,
    total: 55,
    store_id: 's1',
    store_name: 'Pilot Store',
    store_name_ar: '',
    zone_name: 'Zone 1',
    zone_name_ar: '',
    neighborhood_id: 'n1',
    neighborhood_name: 'North',
    item_count: 2,
    courier_user_id: null,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  };

  it('UPSERTs an existing order preserving RPC-only fields (item_count, names)', () => {
    const list = mergeRealtimeOrderPayload([existing], mapped('orders', 'UPDATE', {
      ...ORDER_ROW,
      status: 'out_for_delivery',
      updated_at: '2026-01-01T10:10:00Z',
    }));
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe('out_for_delivery');
    expect(list[0]!.updated_at).toBe('2026-01-01T10:10:00Z');
    // RPC-only fields survive the merge untouched.
    expect(list[0]!.item_count).toBe(2);
    expect(list[0]!.store_name).toBe('Pilot Store');
  });

  it('prepends a brand-new order (newest-first assumption)', () => {
    const list = mergeRealtimeOrderPayload([existing], mapped('orders', 'INSERT', {
      ...ORDER_ROW,
      id: 'o2',
      order_number: 'FC-000002',
      created_at: '2026-01-01T11:00:00Z',
      updated_at: '2026-01-01T11:00:00Z',
    }));
    expect(list.map((o) => o.order_id)).toEqual(['o2', 'o1']);
  });

  it('removes an order on DELETE', () => {
    const list = mergeRealtimeOrderPayload([existing], mapped('orders', 'DELETE', null, ORDER_ROW));
    expect(list).toHaveLength(0);
  });

  it('ignores non-orders tables (timeline events do not re-shape the list)', () => {
    const list = mergeRealtimeOrderPayload([existing], mapped('order_status_history', 'INSERT', {
      id: 'e1',
      order_id: 'o1',
      new_status: 'preparing',
    }));
    expect(list).toHaveLength(1);
  });

  it('summaryFromRealtimeRow maps the raw orders row shape', () => {
    const s = summaryFromRealtimeRow(ORDER_ROW);
    expect(s?.order_id).toBe('o1');
    expect(s?.status).toBe('confirmed');
    expect(s?.courier_user_id).toBeNull();
    expect(summaryFromRealtimeRow({})).toBeNull();
  });
});
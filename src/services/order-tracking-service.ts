/**
 * Neighborhood Pilot — customer order visibility (GATE 6).
 *
 * Server-authoritative: the My Orders list comes from pilot_my_orders (00082),
 * the timeline from pilot_order_timeline (00079) and order detail from
 * pilot_order_detail (00082 owner-visible). Realtime payloads (raw orders
 * rows) are DEDUPED and merged into the last-fetched list here — the merge is
 * cosmetic; the authoritative state remains the DB row.
 */
import { getSupabaseClient } from '../core/supabase/client';
import type { PilotRealtimePayload } from './pilot-realtime-service';

export interface CustomerOrderSummary {
  readonly order_id: string;
  readonly order_number: string;
  readonly status: string;
  readonly subtotal: number;
  readonly delivery_fee: number;
  readonly total: number;
  readonly store_id: string | null;
  readonly store_name: string | null;
  readonly store_name_ar: string | null;
  readonly zone_name: string | null;
  readonly zone_name_ar: string | null;
  readonly neighborhood_id: string | null;
  readonly neighborhood_name: string | null;
  readonly item_count: number;
  readonly courier_user_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface OrderTimelineEvent {
  readonly id: string;
  readonly order_id: string;
  readonly previous_status: string;
  readonly new_status: string;
  readonly event_type: string;
  readonly actor_user_id: string | null;
  readonly actor_role: string | null;
  readonly reason: string;
  readonly metadata?: Record<string, unknown>;
  readonly created_at: string;
}

export interface OrderTimeline {
  readonly order_id: string;
  readonly events: readonly OrderTimelineEvent[];
}

type JsonRow = Record<string, unknown>;
const toSummary = (row: JsonRow): CustomerOrderSummary => row as unknown as CustomerOrderSummary;

async function callRpc<R>(rpcName: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await getSupabaseClient().rpc(rpcName, args ?? {});
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as R;
}

/** The caller's own orders (or every order for an admin), newest first. */
export async function fetchMyOrders(): Promise<CustomerOrderSummary[]> {
  const data = await callRpc<unknown[]>('pilot_my_orders');
  return (data ?? []).map((row) => toSummary(row as JsonRow));
}

/** Immutable server-side timeline for an order the caller may read. */
export async function fetchOrderTimeline(orderId: string): Promise<OrderTimeline> {
  return callRpc<OrderTimeline>('pilot_order_timeline', { p_order_id: orderId });
}

/* ————————————————— realtime merge helpers ————————————————— */

/** Map a raw 'orders' realtime row into the CustomerOrderSummary shape. */
export function summaryFromRealtimeRow(row: Record<string, unknown>): CustomerOrderSummary | null {
  const id = String(row.id ?? '');
  if (!id) return null;
  return {
    order_id: id,
    order_number: String(row.order_number ?? ''),
    status: String(row.status ?? ''),
    subtotal: Number(row.subtotal ?? 0),
    delivery_fee: Number(row.delivery_fee ?? 0),
    total: Number(row.total ?? 0),
    store_id: row.store_id ? String(row.store_id) : null,
    store_name: null,
    store_name_ar: null,
    zone_name: null,
    zone_name_ar: null,
    neighborhood_id: row.neighborhood_id ? String(row.neighborhood_id) : null,
    neighborhood_name: null,
    item_count: Number(row.item_count ?? 0),
    courier_user_id: row.courier_user_id ? String(row.courier_user_id) : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

/**
 * Merge an 'orders' realtime payload into a fetched list.
 * UPSERT by order_id (DELETE removes; INSERT/UPDATE replace-or-prepend).
 * Returns a NEW array; input never mutated.
 */
export function mergeRealtimeOrderPayload(
  list: readonly CustomerOrderSummary[],
  payload: PilotRealtimePayload,
): CustomerOrderSummary[] {
  const target =
    (payload.table === 'orders' ? payload.newRecord ?? payload.oldRecord : null) ?? null;
  if (payload.table !== 'orders' || !target) return [...list];

  const orderId = String(target.id ?? '');
  if (!orderId) return [...list];

  if (payload.eventType === 'DELETE') {
    return list.filter((o) => o.order_id !== orderId);
  }

  const next = summaryFromRealtimeRow(target);
  if (!next) return [...list];

  const idx = list.findIndex((o) => o.order_id === orderId);
  if (idx === -1) {
    // Newest-first assumption: a newly created order belongs at the front.
    return [next, ...list];
  }
  // Realtime 'orders' rows only carry live column values (see
  // summaryFromRealtimeRow): item_count/store names come from the RPC list and
  // must be preserved, not zeroed, by a live status/delivery update.
  const live = {
    order_number: next.order_number,
    status: next.status,
    subtotal: next.subtotal,
    delivery_fee: next.delivery_fee,
    total: next.total,
    courier_user_id: next.courier_user_id,
    created_at: next.created_at,
    updated_at: next.updated_at,
  };
  return list.map((o, i) => (i === idx ? { ...o, ...live } : o));
}
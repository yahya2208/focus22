/**
 * Neighborhood Pilot — courier domain service (Phases 3, 10; Gate C Courier).
 *
 * Every call goes through the 00068 courier RPCs (SECURITY DEFINER); the server
 * re-authorizes the caller (active `pilot_couriers` membership for the order's
 * store, its operator, or an admin). Least privilege: the list + detail payloads
 * never carry the customer phone to a courier.
 */
import { getSupabaseClient } from '../core/supabase/client';
import { track } from '../core/telemetry';
import { PILOT_ORDER_STATUSES, type PilotOrderStatus } from './order-service';

export function isPilotOrderStatus(v: string): v is PilotOrderStatus {
  return (PILOT_ORDER_STATUSES as readonly string[]).includes(v);
}

export interface CourierOrderItem {
  readonly id: string;
  readonly category_id: string | null;
  readonly catalog_ref: string | null;
  readonly name: string | null;
  readonly unit_price: number;
  readonly quantity: number;
  readonly line_total: number;
}

export interface OrderDetailPayload {
  readonly order: {
    readonly id: string;
    readonly order_number: string;
    readonly customer_name: string;
    readonly customer_phone?: string;
    readonly status: string;
    readonly subtotal: number;
    readonly delivery_fee: number;
    readonly total: number;
    readonly notes: string | null;
    readonly address: string | null;
    readonly zone_name: string | null;
    readonly zone_name_ar: string | null;
    readonly store_name: string | null;
    readonly store_name_ar: string | null;
    readonly neighborhood_name: string | null;
    readonly courier_user_id: string | null;
    readonly courier_assigned_at: string | null;
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly items: CourierOrderItem[];
}

export interface CourierOrderSummary {
  readonly order_id: string;
  readonly order_number: string;
  readonly status: string;
  readonly store_id: string | null;
  readonly store_name: string | null;
  readonly store_name_ar: string | null;
  readonly neighborhood_id: string | null;
  readonly neighborhood_name: string | null;
  readonly customer_name: string | null;
  readonly zone_name: string | null;
  readonly zone_name_ar: string | null;
  readonly address: string | null;
  readonly notes: string | null;
  readonly item_count: number;
  readonly total: number;
  readonly created_at: string;
  readonly courier_assigned_at?: string | null;
}

export interface CourierAction {
  readonly status: PilotOrderStatus;
  readonly labelKey: string;
}

/** Courier transitions (canonical statuses only — mirrors 00068 enforcement). */
export function courierActionsFor(status: string): CourierAction[] {
  switch (status) {
    case 'confirmed':
    case 'preparing':
      return [{ status: 'out_for_delivery', labelKey: 'pilot.pickup' }];
    case 'out_for_delivery':
      return [{ status: 'delivered', labelKey: 'pilot.markDelivered' }];
    default:
      return [];
  }
}

export interface AcceptResult {
  readonly order_id: string;
  readonly status: string;
  readonly courier_user_id: string;
}

type JsonRow = Record<string, unknown>;
const toSummary = (row: JsonRow): CourierOrderSummary => row as unknown as CourierOrderSummary;

async function callRpc<R>(rpcName: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await getSupabaseClient().rpc(rpcName, args ?? {});
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as R;
}

export async function fetchAvailableOrders(): Promise<CourierOrderSummary[]> {
  const data = await callRpc<unknown[]>('pilot_orders_available');
  return (data ?? []).map((row) => toSummary(row as JsonRow));
}

export async function fetchMyDeliveries(): Promise<CourierOrderSummary[]> {
  const data = await callRpc<unknown[]>('pilot_orders_for_courier');
  return (data ?? []).map((row) => toSummary(row as JsonRow));
}

export async function acceptOrder(orderId: string): Promise<AcceptResult> {
  return callRpc<AcceptResult>('pilot_order_accept', { p_order_id: orderId });
}

export async function courierSetStatus(orderId: string, status: PilotOrderStatus): Promise<{ order_id: string; status: string }> {
  const result = await callRpc<{ order_id: string; status: string }>('pilot_courier_set_status', {
    p_order_id: orderId,
    p_status: status,
  });
  void track({
    event: status === 'delivered' ? 'order_completed' : 'order_status_changed',
    entityType: 'order',
    entityId: orderId,
    properties: status === 'delivered' ? {} : { status },
  });
  return result;
}

/** Fetch full order + items (courier-safe: no phone). Store-ops uses the same RPC for items. */
export async function fetchOrderDetail(orderId: string): Promise<OrderDetailPayload> {
  return callRpc<OrderDetailPayload>('pilot_order_detail', { p_order_id: orderId });
}

/* ————————————————————— courier approval (00070) ————————————————————— */

export type CourierStatus = 'pending' | 'active' | 'inactive' | 'suspended';

export interface CourierMembership {
  readonly id: string;
  readonly store_id: string;
  readonly user_id: string;
  readonly status: CourierStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly user_email?: string | null;
  readonly user_name?: string | null;
}

function toMembership(row: Record<string, unknown>): CourierMembership {
  return row as unknown as CourierMembership;
}

/** Admin approve / pending / suspend a courier (00070). */
export async function adminSetCourierStatus(
  storeId: string,
  userId: string,
  status: CourierStatus,
): Promise<void> {
  await callRpc('pilot_admin_set_courier_status', {
    p_store_id: storeId,
    p_user_id: userId,
    p_status: status,
  });
}

/** Admin list couriers for a store (or all when omitted) — 00070. */
export async function adminListCouriers(storeId?: string): Promise<CourierMembership[]> {
  const data = await callRpc<unknown[]>(
    'pilot_admin_list_couriers',
    storeId ? { p_store_id: storeId } : {},
  );
  return (data ?? []).map((row) => toMembership(row as Record<string, unknown>));
}
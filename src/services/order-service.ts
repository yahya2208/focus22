/**
 * Neighborhood Pilot — order domain service (Phases 5-7, 12).
 *
 * Phase 6 (Gate D): the real checkout path. `submitPilotOrder` calls the
 * canonical server-authoritative `delivery_create_order` (00052/00065) and
 * never accepts client-authoritative prices. Guests are NOT created while
 * browsing (P3): the submit path requires an authenticated/anonymous session
 * and the UI shows the sign-in/guest gate first.
 */
import { getSupabaseClient } from '../core/supabase/client';
import {
  createDeliveryOrder,
  estimateDelivery,
  type DeliveryOrderResult,
  type DeliveryOrderItem,
} from './delivery-service';
import { track } from '../core/telemetry';
import type { Neighborhood, Store, PilotProduct } from './neighborhood-service';

export const PILOT_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export type PilotOrderStatus = (typeof PILOT_ORDER_STATUSES)[number];

export const isPilotOrderStatus = (v: string): v is PilotOrderStatus =>
  (PILOT_ORDER_STATUSES as readonly string[]).includes(v);

export interface PilotOrder {
  readonly id: string;
  readonly order_number: string;
  readonly customer_name: string;
  readonly status: string;
  readonly subtotal: number;
  readonly delivery_fee: number;
  readonly total: number;
  readonly created_at: string;
  readonly store_id: string | null;
  readonly neighborhood_id: string | null;
  readonly user_id: string | null;
  /** Present at runtime (pilot_orders_for_store returns SETOF orders); used read-only by admin triage. */
  readonly courier_user_id?: string | null;
  /**
   * Server-authored family binding (00102). Present at runtime (SETOF orders);
   * used read-only to decide whether an order settles through the family path.
   * Never sent from the client as a trust value.
   */
  readonly family_id?: string | null;
}

export interface PilotSubmitInput {
  readonly name: string;
  readonly phone: string;
  readonly zoneId: string;
  readonly address: string;
  readonly notes?: string;
  readonly items: ReadonlyArray<{
    catalogRef: string;
    quantity: number;
    /** Display label only — the server ignores it for catalog items. */
    name?: string;
    /** Display price only — never used to compute totals (server-authoritative). */
    unitPrice?: number;
  }>;
  /** Store for telemetry only — not a security control (server resolves the real store). */
  readonly storeId?: string;
  readonly neighborhoodId?: string;
  /**
   * Intent marker (Gate A): the server derives the family from auth.uid();
   * familyId is display/telemetry metadata only and is never a security actor.
   */
  readonly familyId?: string;
  /**
   * TRUE only after the customer explicitly chose "create a new order" in the
   * duplicate-order dialog. It is NOT an idempotency key or a privilege — the
   * server still validates everything and only skips the 60s retry window.
   */
  readonly intentional?: boolean;
}

export type SubmissionErrorCode =
  | 'NEEDS_AUTHENTICATION'
  | 'ITEMS_REQUIRED'
  | 'ITEMS_NOT_FOUND'
  | 'ITEMS_NOT_ORDERABLE'
  | 'MULTI_STORE_ORDER'
  | 'ZONE_NOT_ACTIVE'
  | 'FAMILY_ACCOUNT_REQUIRED'
  | 'DUPLICATE_ORDER'
  | 'INVALID_ARGUMENTS'
  | 'SERVER_ERROR';

const ERROR_CODE_MAP: Record<string, SubmissionErrorCode> = {
  UNAUTHENTICATED: 'NEEDS_AUTHENTICATION',
  CUSTOMER_INFO_REQUIRED: 'INVALID_ARGUMENTS',
  ITEMS_REQUIRED: 'ITEMS_REQUIRED',
  ITEM_NOT_FOUND: 'ITEMS_NOT_FOUND',
  ITEM_NOT_ORDERABLE: 'ITEMS_NOT_ORDERABLE',
  MULTI_STORE_ORDER: 'MULTI_STORE_ORDER',
  ZONE_NOT_ACTIVE: 'ZONE_NOT_ACTIVE',
  FAMILY_ACCOUNT_REQUIRED: 'FAMILY_ACCOUNT_REQUIRED',
  DUPLICATE_ORDER: 'DUPLICATE_ORDER',
  QUANTITY_INVALID: 'INVALID_ARGUMENTS',
  PERMISSION_DENIED: 'INVALID_ARGUMENTS',
  ARGUMENTS_INVALID: 'INVALID_ARGUMENTS',
};

export function classifySubmissionError(err: unknown): SubmissionErrorCode {
  const code = err instanceof Error ? err.message : String(err);
  return ERROR_CODE_MAP[code] ?? 'SERVER_ERROR';
}

/** P3 gate: guests/auth required at submission. Guests are created here, not while browsing. */
export async function ensureOrderSession(): Promise<{
  user: unknown;
  isGuest: boolean;
}> {
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();
  if (!session?.user) throw new Error('NEEDS_AUTHENTICATION');
  const isGuest = session.user.app_metadata?.provider === 'anonymous' || !session.user.email;
  return { user: session.user, isGuest };
}

/** Phase 6 submit — real DB order through the canonical authoritative RPC. */
export function submitPilotOrder(input: PilotSubmitInput): Promise<DeliveryOrderResult> {
  // OQ4=B client half: single-flight — a double tap must not fire a second
  // request while one is already in flight (the server retry-window is the
  // second line of defence).
  if (orderInFlight) return orderInFlight;
  orderInFlight = runOrderSubmission(input).finally(() => {
    orderInFlight = null;
  });
  return orderInFlight;
}

let orderInFlight: Promise<DeliveryOrderResult> | null = null;

async function runOrderSubmission(input: PilotSubmitInput): Promise<DeliveryOrderResult> {
  const items: DeliveryOrderItem[] = input.items
    .filter((i) => i.catalogRef.trim() !== '' && i.quantity > 0)
    .map((i) => ({
      catalogRef: i.catalogRef,
      quantity: i.quantity,
      name: i.name ?? '',
      unitPrice: i.unitPrice ?? 0,
    }));

  if (items.length === 0) throw new Error('ITEMS_REQUIRED');

  void track({
    event: 'checkout_submit',
    entityType: 'order',
    properties: input.familyId
      ? { items_count: items.length, family_id: input.familyId }
      : { items_count: items.length },
  });

  try {
    const result = await createDeliveryOrder(
      {
        name: input.name.trim(),
        phone: input.phone.trim(),
        zoneId: input.zoneId,
        address: input.address.trim(),
        notes: input.notes?.trim() || '',
      },
      items,
      input.intentional === true,
    );
    void track({
      event: 'order_created',
      entityType: 'order',
      entityId: result.orderId,
      properties: input.familyId
        ? { channel: 'pilot_order', family_id: input.familyId }
        : { channel: 'pilot_order' },
    });
    return result;
  } catch (err) {
    void track({
      event: 'order_failed',
      entityType: 'order',
      properties: { error_code: classifySubmissionError(err) },
    });
    throw err;
  }
}

export async function fetchEstimate(zoneId: string, subtotal: number) {
  return estimateDelivery(zoneId, subtotal);
}

/* ————————————————————— store operations (Phase 7) ————————————————————— */

type OrderRow = Record<string, unknown>;
const toOrder = (row: OrderRow): PilotOrder => row as unknown as PilotOrder;

export async function fetchStoreOrders(storeId: string): Promise<PilotOrder[]> {
  const { data, error } = await getSupabaseClient().rpc('pilot_orders_for_store', {
    p_store_id: storeId,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return (data ?? []).map(toOrder);
}

export async function updateStoreOrderStatus(orderId: string, status: PilotOrderStatus): Promise<void> {
  const { error } = await getSupabaseClient().rpc('pilot_order_set_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  void track({
    event: status === 'delivered' ? 'order_completed' : 'order_status_changed',
    entityType: 'order',
    entityId: orderId,
    properties: status === 'delivered' ? {} : { status },
  });
}

/* ————————————————— family settlement (Gate B) ————————————————— */

/**
 * One delivered line: the order_item id + the ACTUAL quantity fulfilled.
 * Weight produce may be fractional (e.g. 5.3 kg); unit items are whole numbers.
 * The client never derives money from these — the server computes the value.
 */
export interface DeliveredActual {
  readonly id: string;
  readonly delivered_quantity: number;
}

/** Result of the canonical settlement RPC (00102). Every figure is server-computed. */
export interface SettlementResult {
  readonly order_id: string;
  readonly status: string;
  readonly final_subtotal: number;
  readonly delivery_fee: number;
  readonly final_total: number;
  /** NULL for legacy/guest orders that carry no family money model. */
  readonly balance_after: number | null;
  readonly debt_remaining: number | null;
}

/** Record delivered actuals only (order must be preparing/out_for_delivery). */
export async function setDeliveredActuals(
  orderId: string,
  items: ReadonlyArray<DeliveredActual>,
): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('pilot_set_delivered_actuals', {
    p_order_id: orderId,
    p_items: items,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return Number((data as { updated_items?: number } | null)?.updated_items ?? 0);
}

/**
 * The ONE canonical financial settlement: records actuals, transitions the
 * order to delivered, posts the single PURCHASE movement and tracks the
 * uncovered remainder. There is NO client-side balance or ledger math here.
 */
export async function settleFamilyOrder(
  orderId: string,
  items: ReadonlyArray<DeliveredActual>,
  reason = '',
): Promise<SettlementResult> {
  const { data, error } = await getSupabaseClient().rpc('pilot_family_settle_and_deliver', {
    p_order_id: orderId,
    p_items: items,
    p_reason: reason,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as SettlementResult;
}

export async function resetPilot(): Promise<void> {
  const { error } = await getSupabaseClient().rpc('pilot_reset');
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
}

export type StorefrontBundle = {
  readonly neighborhood: Neighborhood;
  readonly stores: readonly Store[];
  readonly products: readonly PilotProduct[];
};

/* ————————————————————— family tracking + admin health (00068) ————————————————————— */

export interface TrackedOrderStatus {
  readonly order_id: string;
  readonly order_number: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export async function fetchTrackedOrderStatus(orderId: string): Promise<TrackedOrderStatus> {
  const { data, error } = await getSupabaseClient().rpc('pilot_order_status_for_user', { p_order_id: orderId });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as TrackedOrderStatus;
}

export interface PilotHealth {
  readonly neighborhoods: number;
  readonly stores: number;
  readonly families: number;
  readonly couriers: number;
  readonly orders: {
    readonly total: number;
    readonly pending: number;
    readonly confirmed: number;
    readonly preparing: number;
    readonly out_for_delivery: number;
    readonly delivered: number;
    readonly cancelled: number;
  };
  readonly telemetry: {
    readonly order_created: number;
    readonly order_completed: number;
    readonly order_failed: number;
  };
}

export async function fetchPilotHealth(): Promise<PilotHealth> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_pilot_health');
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as PilotHealth;
}

export interface StoreAction {
  readonly status: PilotOrderStatus;
  readonly labelKey: string;
}

/** Store transitions shown in the store-ops UI (canonical statuses only — same as 00068). */
export function storeActionsFor(status: string): StoreAction[] {
  switch (status) {
    case 'pending':
      return [
        { status: 'confirmed', labelKey: 'pilot.confirmOrder' },
        { status: 'cancelled', labelKey: 'pilot.cancelOrder' },
      ];
    case 'confirmed':
      return [
        { status: 'preparing', labelKey: 'pilot.startPreparing' },
        { status: 'cancelled', labelKey: 'pilot.cancelOrder' },
      ];
    case 'preparing':
      return [{ status: 'out_for_delivery', labelKey: 'pilot.handoffToCourier' }];
    case 'out_for_delivery':
    case 'delivered':
    case 'cancelled':
    default:
      return [];
  }
}
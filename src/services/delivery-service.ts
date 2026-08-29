/**
 * Delivery foundation service (00050). Public read-only zones/fees feed the
 * "Delivery available · Estimated N–M min" pill and the order preview; order
 * creation flows through the SECURITY DEFINER RPC `delivery_create_order`.
 * This is the foundation the future order-management surface builds on.
 */

import { getSupabaseClient } from '../core/supabase/client';

export interface DeliveryZone {
  id: string;
  name: string;
  name_ar: string;
  is_active: boolean;
}

export interface DeliveryEstimate {
  available: boolean;
  fee: number;
  minutesMin: number;
  minutesMax: number;
}

export interface DeliveryCustomer {
  name: string;
  phone: string;
  zoneId: string;
  address?: string;
  notes?: string;
}

export interface DeliveryOrderItem {
  categoryId?: string | null;
  catalogRef?: string;
  name: string;
  nameAr?: string;
  unitPrice: number;
  quantity: number;
}

export interface DeliveryOrderResult {
  orderId: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  etaMinutesMin: number;
  etaMinutesMax: number;
}

type Listener = () => void;

let cache: DeliveryZone[] = [];
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();
let realtimeStarted = false;

async function fetchZones(): Promise<DeliveryZone[]> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('delivery_zones')
      .select('id, name, name_ar, is_active')
      .order('name', { ascending: true });
    if (error || !data) return [];
    return (data as DeliveryZone[]).filter((z) => z.is_active);
  } catch {
    return []; // table not created yet — no delivery UI
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export async function refreshDeliveryZones(): Promise<void> {
  try {
    cache = await fetchZones();
  } catch {
    cache = [];
  }
  notify();
}

function startRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  try {
    getSupabaseClient()
      .channel('delivery-zones-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_zones' }, () => {
        loadPromise = null;
        refreshDeliveryZones().catch(() => {});
      })
      .subscribe();
  } catch {
    // realtime unavailable — static refresh still works
  }
}

export function ensureDeliveryLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = refreshDeliveryZones().then(() => {
      startRealtime();
    });
  }
  return loadPromise;
}

export function resetDeliveryService(): void {
  cache = [];
  loadPromise = null;
  listeners.clear();
  realtimeStarted = false;
}

export function getDeliveryZones(): DeliveryZone[] {
  return cache;
}

export function getDeliveryZone(id: string): DeliveryZone | undefined {
  return cache.find((zone) => zone.id === id);
}

export function subscribeDeliveryZones(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function parseEstimate(data: unknown): DeliveryEstimate {
  const payload = (typeof data === 'string' ? safeParse(data) : data ?? {}) as Record<string, unknown>;
  return {
    available: Boolean(payload.available),
    fee: Number(payload.fee ?? 0),
    minutesMin: Number(payload.minutes_min ?? payload.minutesMin ?? 30),
    minutesMax: Number(payload.minutes_max ?? payload.minutesMax ?? 45),
  };
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Public estimate for a given zone + subtotal (RPC `delivery_estimate`). */
export async function estimateDelivery(zoneId: string, subtotal: number): Promise<DeliveryEstimate> {
  try {
    const { data, error } = await getSupabaseClient().rpc('delivery_estimate', {
      p_zone_id: zoneId,
      p_subtotal: subtotal,
    });
    if (error) return { available: false, fee: 0, minutesMin: 30, minutesMax: 45 };
    return parseEstimate(data);
  } catch {
    return { available: false, fee: 0, minutesMin: 30, minutesMax: 45 };
  }
}

/** Creates a pending order (RPC `delivery_create_order`, authenticated only). */
export async function createDeliveryOrder(
  customer: DeliveryCustomer,
  items: DeliveryOrderItem[],
): Promise<DeliveryOrderResult> {
  const { data, error } = await getSupabaseClient().rpc('delivery_create_order', {
    p_customer: {
      name: customer.name,
      phone: customer.phone,
      zone_id: customer.zoneId,
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    },
    p_items: items.map((item) => ({
      category_id: item.categoryId ?? null,
      catalog_ref: item.catalogRef ?? '',
      name: item.name,
      name_ar: item.nameAr ?? '',
      unit_price: item.unitPrice,
      quantity: item.quantity,
    })),
  });
  if (error) throw new Error(`فشل إنشاء الطلب: ${error.message}`);
  const payload = (typeof data === 'string' ? safeParse(data) : data ?? {}) as Record<string, unknown>;
  return {
    orderId: String(payload.order_id ?? payload.orderId ?? ''),
    orderNumber: String(payload.order_number ?? payload.orderNumber ?? ''),
    status: String(payload.status ?? 'pending'),
    subtotal: Number(payload.subtotal ?? 0),
    deliveryFee: Number(payload.delivery_fee ?? payload.deliveryFee ?? 0),
    total: Number(payload.total ?? 0),
    etaMinutesMin: Number(payload.eta_minutes_min ?? payload.etaMinutesMin ?? 30),
    etaMinutesMax: Number(payload.eta_minutes_max ?? payload.etaMinutesMax ?? 45),
  };
}
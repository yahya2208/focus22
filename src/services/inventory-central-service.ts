/**
 * Inventory Central Service — SUPA BASE-BACKED BOUNDED CONTEXT (Phase 2C cutover)
 *
 * This module is the ONLY runtime owner of the central inventory tables:
 *   - `v_public_inventory`  (customer-facing projection, RLS-free view)
 *   - `inventory_management_list()` RPC (admin full read — the ONLY admin read path)
 *   - `inventory_movements` (append-only audit trail, staff read only)
 *   - 12 SECURITY DEFINER write RPCs (inventory_add_item / add_stock /
 *     remove_stock / adjust_stock / update_prices / update_details /
 *     set_status / restore / set_published / add_image / remove_image /
 *     set_status('deleted'))
 *
 * Policy (approved 2026-08-11, central cutover directive):
 *   - Reads are NOT fire-and-forget like ads: the storefront, admin page and
 *     research hooks all read from in-memory caches hydrated by one bootstrap.
 *   - Writes go through RPCs ONLY (never `.from(...).insert/update/delete`).
 *   - Every successful write refreshes the caches (invalidation strategy).
 *   - Public visibility is the DB's own gate (is_published + quantity + status);
 *     `v_public_inventory` already applies it, so the client never re-filters.
 *
 * NOTE: localStorage is fully retired from the inventory context.
 */

import { getSupabaseClient } from '../core/supabase/client';
import type { PhoneVariant } from '../data/phone-variants';
import type {
  InventoryMovement,
  InventoryRecord,
  InventoryStatus,
  InventoryTransaction,
  MovementReason,
  TimelineEvent,
  TimelineEventType,
} from './inventory-service';

/** Raw row of `v_public_inventory` (customer-facing projection). */
interface PublicRow {
  id: string;
  model_id: string;
  brand: string;
  model: string;
  variant: string;
  ram: string | null;
  storage: string;
  condition: string;
  color: string | null;
  quantity: number;
  status: string;
  sell_price: number | null;
  code: string | null;
  battery_health: number | null;
  warranty: string | null;
  city: string | null;
  description: string | null;
  updated_at: string;
}

/** Raw row of `inventory_management_list()` RPC (admin full read). */
interface FullRow {
  id: string;
  model_id: string;
  brand: string;
  model: string;
  variant: string;
  ram: string | null;
  storage: string;
  condition: string;
  color: string | null;
  quantity: number;
  status: string;
  buy_price: number | null;
  sell_price: number | null;
  created_at: string;
  updated_at: string;
  total_purchased: number;
  total_sold: number;
  code: string | null;
  battery_health: number | null;
  warranty: string | null;
  city: string | null;
  description: string | null;
  is_published: boolean;
  source_label: string | null;
}

/** Raw row of `inventory_movements`. */
interface MovementRow {
  id: string;
  inventory_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  delta: number | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isActiveStatus(status: string): boolean {
  return status !== 'archived' && status !== 'discontinued' && status !== 'deleted';
}

function toStatus(status: string | null | undefined): InventoryStatus {
  if (status === 'archived' || status === 'discontinued') return status;
  if (status === 'deleted') return 'archived';
  if (status === 'low_stock') return 'low_stock';
  if (status === 'out_of_stock') return 'out_of_stock';
  return 'in_stock';
}

function mapPublic(row: PublicRow): InventoryRecord {
  return {
    id: row.id,
    modelId: row.model_id,
    brand: row.brand,
    model: row.model,
    variant: row.variant,
    ram: row.ram ?? '',
    storage: row.storage,
    condition: row.condition,
    quantity: row.quantity,
    status: toStatus(row.status),
    sellPrice: row.sell_price ?? undefined,
    code: row.code ?? undefined,
    batteryHealth: row.battery_health ?? undefined,
    warranty: row.warranty ?? undefined,
    city: row.city ?? undefined,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.updated_at,
    updatedAt: row.updated_at,
    totalPurchased: 0,
    totalSold: 0,
  };
}

function mapFull(row: FullRow): InventoryRecord {
  return {
    id: row.id,
    modelId: row.model_id,
    brand: row.brand,
    model: row.model,
    variant: row.variant,
    ram: row.ram ?? '',
    storage: row.storage,
    condition: row.condition,
    quantity: row.quantity,
    status: toStatus(row.status),
    buyPrice: row.buy_price ?? undefined,
    sellPrice: row.sell_price ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalPurchased: row.total_purchased,
    totalSold: row.total_sold,
    color: row.color ?? undefined,
    batteryHealth: row.battery_health ?? undefined,
    warranty: row.warranty ?? undefined,
    city: row.city ?? undefined,
    description: row.description ?? undefined,
    code: row.code ?? undefined,
    sourceLabel: row.source_label ?? undefined,
  };
}

let publicCache: InventoryRecord[] = [];
let adminCache: InventoryRecord[] | null = null;
let movementsCache: MovementRow[] = [];
let ready = false;
let bootstrapPromise: Promise<void> | null = null;
let focusAttached = false;
let pendingRefetch = false;
const publishedIds = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function getInventoryReady(): boolean {
  return ready;
}

export function subscribeCentralInventory(fn: () => void): () => void {
  listeners.add(fn);
  // Close the "settled before subscribe" race: when a consumer subscribes
  // AFTER the cache is already hydrated, replay the current state once so a
  // late mount (e.g. HomeScreen finishing its lazy chunk while bootstrap is
  // already done) can never miss the readiness transition. The ads path
  // already re-reads after `ensureAdsLoaded()`; this makes the central cache
  // equally race-free for every consumer (Home / Showroom / product details).
  if (ready) {
    queueMicrotask(() => {
      if (listeners.has(fn)) fn();
    });
  }
  return () => { listeners.delete(fn); };
}

export function getCachedPublic(): InventoryRecord[] {
  return publicCache;
}

export function getCachedAdmin(): InventoryRecord[] {
  return adminCache ?? publicCache;
}

export function isRecordPublished(id: string): boolean {
  return publishedIds.has(id);
}

/**
 * Hydrate the public cache (customer-facing projection). Returns success so
 * the bootstrap can distinguish "transient failure" from "legitimately empty"
 * and retry only the former.
 */
async function fetchPublic(): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('v_public_inventory')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error || !Array.isArray(data)) {
      publicCache = [];
      return false;
    }
    publicCache = data.map(mapPublic);
    return true;
  } catch {
    publicCache = [];
    return false;
  }
}

async function fetchAdmin(): Promise<void> {
  try {
    const { data, error } = await getSupabaseClient().rpc('inventory_management_list');
    if (error || !Array.isArray(data)) {
      adminCache = null;
      return;
    }
    publishedIds.clear();
    adminCache = data
      .filter((r: FullRow) => r.status !== 'deleted')
      .map((r: FullRow) => {
        if (r.is_published) publishedIds.add(r.id);
        return mapFull(r);
      });
  } catch {
    adminCache = null;
  }
}

async function fetchMovements(): Promise<void> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('inventory_movements')
      .select('*')
      .order('created_at', { ascending: false });
    movementsCache = error || !Array.isArray(data) ? [] : data as MovementRow[];
  } catch {
    movementsCache = [];
  }
}

async function refetchCentralInventory(): Promise<void> {
  await Promise.all([fetchPublic(), fetchAdmin(), fetchMovements()]);
  notify();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded retry budget (ms) for the FIRST public-cache hydration only. A cold
 * mobile start (radio wake / cold Supabase connection) can fail the very first
 * request transiently; without a retry the app would settle `ready=true` with
 * an empty public cache and Home would show "no devices" until a manual
 * refresh. This is a bounded network-resilience retry, NOT auto-refresh: the
 * admin/movements fetches (which legitimately error for anon visitors via
 * RLS) are never retried, and after the budget is exhausted the bootstrap
 * settles normally and focus/visibility refreshes remain the recovery path.
 */
const PUBLIC_BOOTSTRAP_RETRIES_MS = [500, 1500];

async function bootstrapHydrate(): Promise<void> {
  // Admin + movements are best-effort and start immediately (RLS errors are
  // expected for public visitors); only the public projection is retried.
  const adminPromise = fetchAdmin();
  const movementsPromise = fetchMovements();
  let attempt = 0;
  for (;;) {
    const publicOk = await fetchPublic();
    if (publicOk) {
      await Promise.all([adminPromise, movementsPromise]);
      return;
    }
    if (attempt >= PUBLIC_BOOTSTRAP_RETRIES_MS.length) {
      await Promise.all([adminPromise, movementsPromise]);
      return;
    }
    await delay(PUBLIC_BOOTSTRAP_RETRIES_MS[attempt]!);
    attempt += 1;
  }
}

export function bootstrapCentralInventory(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      await bootstrapHydrate();
    } finally {
      ready = true;
      notify();
      attachFocusRefresh();
    }
  })();
  return bootstrapPromise;
}

/**
 * Test/observability hook — clears ALL module-level state so a fresh
 * bootstrap can run in isolation (used by the central-inventory test suite,
 * which mocks the Supabase client per file). No-op in production flows.
 */
export function resetCentralInventoryState(): void {
  publicCache = [];
  adminCache = null;
  movementsCache = [];
  ready = false;
  bootstrapPromise = null;
  focusAttached = false;
  pendingRefetch = false;
  publishedIds.clear();
  listeners.clear();
}

function attachFocusRefresh() {
  if (focusAttached || typeof window === 'undefined') return;
  focusAttached = true;
  window.addEventListener('focus', () => { void refetchCentralInventory(); });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refetchCentralInventory();
  });
}

async function rpcRow<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(fn, args);
  if (error) throw new Error(`inventory RPC ${fn} failed: ${error.message}`);
  return data as T;
}

function scheduleRefetch() {
  if (pendingRefetch) return;
  pendingRefetch = true;
  void (async () => {
    await Promise.resolve();
    pendingRefetch = false;
    await refetchCentralInventory();
  })();
}

function upsertAdminRow(row: FullRow): InventoryRecord {
  const record = mapFull(row);
  if (row.status === 'deleted') {
    if (adminCache) adminCache = adminCache.filter((r) => r.id !== record.id);
    publicCache = publicCache.filter((r) => r.id !== record.id);
    publishedIds.delete(record.id);
    scheduleRefetch();
    return record;
  }
  const idx = adminCache ? adminCache.findIndex((r) => r.id === record.id) : -1;
  if (adminCache) {
    if (idx === -1) adminCache.unshift(record);
    else adminCache[idx] = record;
  }
  if (row.is_published) publishedIds.add(record.id);
  else publishedIds.delete(record.id);
  const idxPub = publicCache.findIndex((r) => r.id === record.id);
  const visible = row.is_published && isActiveStatus(row.status) && record.quantity > 0;
  if (visible) {
    if (idxPub === -1) publicCache.unshift(record);
    else publicCache[idxPub] = record;
  } else if (idxPub !== -1) {
    publicCache.splice(idxPub, 1);
  }
  scheduleRefetch();
  return record;
}

export async function centralAddItem(params: {
  modelId: string;
  brand: string;
  model: string;
  variant: string;
  ram: string | null;
  storage: string;
  condition: string;
  quantity: number;
  buyPrice?: number;
  sellPrice?: number;
  batteryHealth?: number;
  sourceLabel?: string;
}): Promise<InventoryRecord> {
  const row = await rpcRow<FullRow>('inventory_add_item', {
    p_model_id: params.modelId,
    p_brand: params.brand,
    p_model: params.model,
    p_variant: params.variant,
    p_ram: params.ram,
    p_storage: params.storage,
    p_condition: params.condition,
    p_color: '',
    p_quantity: params.quantity,
    p_buy_price: params.buyPrice ?? null,
    p_sell_price: params.sellPrice ?? null,
    p_code: null,
    p_battery_health: params.batteryHealth ?? null,
    p_warranty: null,
    p_city: null,
    p_description: null,
    p_is_published: false,
    p_source_key: null,
    p_source_label: params.sourceLabel ?? null,
  });
  return upsertAdminRow(row);
}

export async function centralAddStock(
  recordId: string,
  quantity: number,
  reason: MovementReason | null,
  note: string | null,
  reference: string | null,
  _createdBy: string | null,
): Promise<InventoryRecord | null> {
  const before = getCachedAdmin().find((r) => r.id === recordId);
  if (!before) return null;
  const row = await rpcRow<FullRow>('inventory_add_stock', {
    p_inventory_id: recordId,
    p_quantity: quantity,
    p_reason: reason,
    p_metadata: reference ? { reference } : null,
    p_note: note,
  });
  return upsertAdminRow(row);
}

export async function centralRemoveStock(
  recordId: string,
  quantity: number,
  reason: MovementReason | null,
  note: string | null,
  reference: string | null,
  _createdBy: string | null,
): Promise<InventoryRecord | null> {
  const before = getCachedAdmin().find((r) => r.id === recordId);
  if (!before) return null;
  if (before.quantity < quantity) return null;
  const row = await rpcRow<FullRow>('inventory_remove_stock', {
    p_inventory_id: recordId,
    p_quantity: quantity,
    p_reason: reason,
    p_metadata: reference ? { reference } : null,
    p_note: note,
  });
  return upsertAdminRow(row);
}

export async function centralAdjustStock(
  recordId: string,
  newQuantity: number,
  reason: MovementReason | null,
  note: string | null,
): Promise<InventoryRecord | null> {
  if (!getCachedAdmin().some((r) => r.id === recordId)) return null;
  const row = await rpcRow<FullRow>('inventory_adjust_stock', {
    p_inventory_id: recordId,
    p_quantity: newQuantity,
    p_reason: reason,
    p_metadata: null,
    p_note: note,
  });
  return upsertAdminRow(row);
}

export async function centralUpdatePrices(
  recordId: string,
  buyPrice?: number,
  sellPrice?: number,
): Promise<InventoryRecord | null> {
  if (!getCachedAdmin().some((r) => r.id === recordId)) return null;
  const row = await rpcRow<FullRow>('inventory_update_prices', {
    p_inventory_id: recordId,
    p_buy_price: buyPrice ?? null,
    p_sell_price: sellPrice ?? null,
    p_reason: null,
    p_note: null,
  });
  return upsertAdminRow(row);
}

export async function centralUpdateDetails(
  recordId: string,
  details: Partial<Pick<InventoryRecord, 'modelId' | 'brand' | 'model' | 'variant' | 'ram' | 'storage' | 'condition' | 'color' | 'code' | 'batteryHealth' | 'warranty' | 'city' | 'description' | 'sourceLabel'>>,
): Promise<InventoryRecord | null> {
  if (!getCachedAdmin().some((r) => r.id === recordId)) return null;
  const row = await rpcRow<FullRow>('inventory_update_details', {
    p_inventory_id: recordId,
    p_model_id: details.modelId ?? null,
    p_brand: details.brand ?? null,
    p_model: details.model ?? null,
    p_variant: details.variant ?? null,
    p_ram: details.ram ?? null,
    p_storage: details.storage ?? null,
    p_condition: details.condition ?? null,
    p_color: details.color ?? null,
    p_code: details.code ?? null,
    p_battery_health: details.batteryHealth ?? null,
    p_warranty: details.warranty ?? null,
    p_city: details.city ?? null,
    p_description: details.description ?? null,
    p_extra: null,
    p_source_label: details.sourceLabel ?? null,
  });
  return upsertAdminRow(row);
}

export async function centralSetStatus(
  recordId: string,
  status: 'archived' | 'discontinued' | 'deleted',
  reason: string | null,
  note: string | null,
): Promise<InventoryRecord | null> {
  const row = await rpcRow<FullRow>('inventory_set_status', {
    p_inventory_id: recordId,
    p_status: status,
    p_reason: reason,
    p_note: note,
  });
  return upsertAdminRow(row);
}

export async function centralRestore(
  recordId: string,
  reason: string | null,
  note: string | null,
): Promise<InventoryRecord | null> {
  const row = await rpcRow<FullRow>('inventory_restore', {
    p_inventory_id: recordId,
    p_reason: reason,
    p_note: note,
  });
  return upsertAdminRow(row);
}

export async function centralSetPublished(
  recordId: string,
  published: boolean,
  reason: string | null,
  note: string | null,
): Promise<InventoryRecord | null> {
  const row = await rpcRow<FullRow>('inventory_set_published', {
    p_inventory_id: recordId,
    p_is_published: published,
    p_reason: reason,
    p_note: note,
  });
  if (published) publishedIds.add(recordId);
  else publishedIds.delete(recordId);
  return upsertAdminRow(row);
}

export async function centralDeleteRecord(recordId: string): Promise<void> {
  await rpcRow<unknown>('inventory_set_status', {
    p_inventory_id: recordId,
    p_status: 'deleted',
    p_reason: 'deleted',
    p_note: null,
  });
  if (adminCache) adminCache = adminCache.filter((r) => r.id !== recordId);
  publicCache = publicCache.filter((r) => r.id !== recordId);
  publishedIds.delete(recordId);
  scheduleRefetch();
}

export async function centralAddImage(
  recordId: string,
  path: string,
  position: number | null,
  isCover: boolean,
): Promise<void> {
  await rpcRow<unknown>('inventory_add_image', {
    p_inventory_id: recordId,
    p_path: path,
    p_position: position,
    p_is_cover: isCover,
  });
}

export async function centralRemoveImage(imageId: string): Promise<void> {
  await rpcRow<boolean>('inventory_remove_image', { p_image_id: imageId });
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadRecordImage(
  recordId: string,
  blob: Blob,
): Promise<{ path: string; url: string }> {
  const supabase = getSupabaseClient();
  const path = `${recordId}/${randomToken()}.jpg`;
  const { error } = await supabase.storage.from('inventory-images').upload(path, blob, {
    contentType: 'image/jpeg',
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  await centralAddImage(recordId, path, null, false);
  imageCache.delete(recordId);
  const url = supabase.storage.from('inventory-images').getPublicUrl(path).data.publicUrl;
  return { path, url };
}

export async function getCentralImages(recordId: string): Promise<string[]> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('inventory_images')
      .select('path')
      .eq('inventory_id', recordId)
      .order('position');
    if (error || !Array.isArray(data)) return [];
    return data.map((r: { path: string }) =>
      getSupabaseClient().storage.from('inventory-images').getPublicUrl(r.path).data.publicUrl,
    );
  } catch {
    return [];
  }
}

const imageCache = new Map<string, string[]>();

/**
 * Resolve the display image URLs for a record by listing the record's folder
 * inside the `inventory-images` bucket (object names are relative to the
 * bucket). Direct SELECT on `inventory_images` is blocked at runtime by RLS
 * (the SELECT policy subquery reads the locked `inventory_items`), so the
 * bucket listing is the read path that works for anon + authenticated.
 * Results are cached per record; ordering approximates insertion order via
 * created_at (the DB position/is_cover are not exposed on this read path).
 */
export async function centralListImages(recordId: string): Promise<string[]> {
  const cached = imageCache.get(recordId);
  if (cached) return cached;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from('inventory-images').list(recordId, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error || !Array.isArray(data)) return [];
    const urls = data
      .filter((o) => /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(o.name ?? ''))
      .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
      .map((o) => supabase.storage.from('inventory-images').getPublicUrl(`${recordId}/${o.name}`).data.publicUrl);
    imageCache.set(recordId, urls);
    return urls;
  } catch {
    return [];
  }
}

const MOVEMENT_REASON: Record<string, MovementReason> = {
  purchase: 'purchase',
  created: 'purchase',
  stock_added: 'purchase',
  sale: 'sale',
  stock_removed: 'sale',
  exchanged: 'exchange',
  returned: 'return',
  damage: 'damage',
  adjusted: 'adjustment',
  details_updated: 'adjustment',
  status_changed: 'other',
  published: 'other',
  hidden: 'other',
  archived: 'other',
  restored: 'other',
  discontinued: 'other',
  deleted: 'other',
};

function movementQuantity(m: MovementRow): number {
  const b = typeof m.before?.quantity === 'number' ? m.before.quantity : null;
  const a = typeof m.after?.quantity === 'number' ? m.after.quantity : null;
  if (a != null && b != null) return Math.abs(a - b);
  if (m.delta != null) return Math.abs(m.delta);
  if (a != null) return a;
  return 0;
}

function beforeQty(m: MovementRow): number {
  return typeof m.before?.quantity === 'number' ? m.before.quantity : 0;
}

function afterQty(m: MovementRow): number {
  return typeof m.after?.quantity === 'number' ? m.after.quantity : 0;
}

function mapMovement(m: MovementRow): InventoryMovement {
  return {
    id: m.id,
    recordId: m.inventory_id,
    type: m.delta != null && m.delta < 0 ? 'remove' : 'add',
    reason: MOVEMENT_REASON[m.action] ?? 'other',
    quantity: movementQuantity(m),
    quantityBefore: beforeQty(m),
    quantityAfter: afterQty(m),
    note: m.note ?? undefined,
    reference: typeof m.metadata?.reference === 'string' ? m.metadata.reference : undefined,
    createdBy: m.actor_user_id ?? undefined,
    createdAt: m.created_at,
  };
}

function mapTransaction(m: MovementRow): InventoryTransaction {
  return {
    id: m.id,
    recordId: m.inventory_id,
    type: m.action === 'adjusted' ? 'adjust' : m.delta != null && m.delta < 0 ? 'remove' : 'add',
    delta: m.delta ?? afterQty(m) - beforeQty(m),
    quantityBefore: beforeQty(m),
    quantityAfter: afterQty(m),
    note: m.note ?? undefined,
    createdAt: m.created_at,
  };
}

function toTimelineType(action: string): TimelineEventType {
  switch (action) {
    case 'created': return 'created';
    case 'stock_added':
    case 'purchase': return 'stock_added';
    case 'stock_removed': return 'stock_removed';
    case 'sale': return 'sold';
    case 'exchanged': return 'exchanged';
    case 'returned': return 'restocked';
    case 'adjusted': return 'adjusted';
    case 'price_updated': return 'price_updated';
    default: return 'status_changed';
  }
}

const TIMELINE_DETAIL: Record<string, string> = {
  created: 'تم إنشاء السجل',
  stock_added: 'تمت إضافة قطع',
  purchase: 'تمت إضافة قطع',
  stock_removed: 'تم خصم قطع',
  sale: 'تم البيع',
  exchanged: 'تم الاستبدال',
  returned: 'تمت إعادة الإرجاع',
  adjusted: 'تسوية المخزون',
  price_updated: 'تحديث السعر',
  status_changed: 'تغيرت الحالة',
  published: 'تم النشر',
  hidden: 'تم الإخفاء',
  archived: 'تمت الأرشفة',
  restored: 'تمت الاستعادة',
  discontinued: 'تم إيقاف الموديل',
  deleted: 'تم الحذف',
  updated: 'تم التحديث',
  details_updated: 'تم تحديث التفاصيل',
};

function mapTimeline(m: MovementRow): TimelineEvent {
  const qty = movementQuantity(m);
  const priceBefore = typeof m.before?.sell_price === 'number' ? m.before.sell_price : undefined;
  const priceAfter = typeof m.after?.sell_price === 'number' ? m.after.sell_price : undefined;
  const statusBefore = typeof m.before?.status === 'string' ? toStatus(m.before.status) : undefined;
  const statusAfter = typeof m.after?.status === 'string' ? toStatus(m.after.status) : undefined;
  return {
    id: m.id,
    recordId: m.inventory_id,
    type: toTimelineType(m.action),
    detail: `${TIMELINE_DETAIL[m.action] ?? 'تحديث'}${qty > 0 ? ` (${qty})` : ''}`,
    quantity: qty > 0 ? qty : undefined,
    quantityBefore: beforeQty(m) || undefined,
    quantityAfter: afterQty(m) || undefined,
    priceBefore,
    priceAfter,
    statusBefore,
    statusAfter,
    createdBy: m.actor_user_id ?? undefined,
    createdAt: m.created_at,
  };
}

export function getCentralMovements(recordId?: string, limit = 50): InventoryMovement[] {
  const filtered = recordId
    ? movementsCache.filter((m) => m.inventory_id === recordId)
    : movementsCache;
  return filtered.slice(0, limit).map(mapMovement);
}

export function getCentralTransactions(limit = 20): InventoryTransaction[] {
  return movementsCache.slice(0, limit).map(mapTransaction);
}

export function getCentralTimeline(recordId: string, limit = 50): TimelineEvent[] {
  return movementsCache
    .filter((m) => m.inventory_id === recordId)
    .slice(0, limit)
    .map(mapTimeline);
}

export function getCentralGlobalTimeline(limit = 50): TimelineEvent[] {
  return movementsCache.slice(0, limit).map(mapTimeline);
}

export function getCentralRecordSummary(
  recordId: string,
): {
  exists: boolean;
  events: number;
  firstEvent: string | null;
  lastEvent: string | null;
  totalAdded: number;
  totalRemoved: number;
} | null {
  const record = getCachedAdmin().find((r) => r.id === recordId);
  if (!record) return null;
  const events = movementsCache.filter((m) => m.inventory_id === recordId);
  let totalAdded = 0;
  let totalRemoved = 0;
  for (const e of events) {
    const q = movementQuantity(e);
    if (e.action === 'created' || e.action === 'stock_added' || e.action === 'purchase') totalAdded += q;
    if (e.action === 'stock_removed' || e.action === 'sale' || e.action === 'exchanged') totalRemoved += q;
  }
  return {
    exists: true,
    events: events.length,
    firstEvent: events.length > 0 ? events[events.length - 1]!.created_at : null,
    lastEvent: events.length > 0 ? events[0]!.created_at : null,
    totalAdded,
    totalRemoved,
  };
}

export function resolveVariantParams(variant: string | PhoneVariant): {
  variantLabel: string;
  ram: string | null;
  storage: string;
} {
  const variantLabel = typeof variant === 'string' ? variant : variant.label;
  if (typeof variant === 'string') {
    // Empty label = "no variant". Schema contract (inventory-central/01-inventory-apply.sql):
    // inventory_items.variant and .storage are TEXT NOT NULL DEFAULT '' → they keep
    // their native ''; ram is the ONLY nullable field → real NULL, never ''.
    if (variantLabel.trim() === '') {
      return { variantLabel: '', ram: null, storage: '' };
    }
    // Apple storage-only label (iPhone/iPad projection): no '/' → the whole
    // label IS the storage ('128GB' / '1TB'). ram must resolve to real NULL,
    // never a mangled part ('128GBGB' from a naive split).
    if (!variantLabel.includes('/')) {
      return { variantLabel, ram: null, storage: variantLabel.trim() };
    }
    const [r, s] = variantLabel.split('/');
    return {
      variantLabel,
      ram: r ? `${r.trim()}GB` : null,
      storage: s ? `${s.trim()}${variantLabel.includes('T') ? '' : 'GB'}` : '',
    };
  }
  return { variantLabel, ram: variant.ram, storage: variant.storage };
}

export { refetchCentralInventory };
export type { PublicRow, FullRow, MovementRow };

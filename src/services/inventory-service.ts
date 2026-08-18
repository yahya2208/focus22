/**
 * Inventory Service — OPERATIONAL STOCK (WAREHOUSE BOUNDED CONTEXT)
 *
 * ── CUTOVER NOTE 2026-08-11 ─────────────────────────────────────────────
 *  This file is now a thin FACADE over `inventory-central-service` (the
 *  Supabase-backed central inventory). The 22-method contract below is
 *  preserved verbatim so every consumer (screens, hooks, modals, BI, tests)
 *  keeps compiling unchanged:
 *
 *    - Reads  (getAll / getExchangeableDevices / search / timeline / …) are
 *              SYNC and serve from the central in-memory cache hydrated by
 *              `bootstrapCentralInventory()` (called once at app boot).
 *    - Writes (addStock / removeStock / adjustStock / setStatus / …) are
 *              ASYNC and go through the central SECURITY DEFINER RPCs only —
 *              never via localStorage, never via direct table writes.
 *
 *  localStorage is fully retired from the inventory context. The legacy key
 *  names are kept as constants below for migration/audit reference only.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as inventoryCentral from './inventory-central-service';
import { normalizeModelName } from './catalog-service';
import type { PhoneVariant } from '../data/phone-variants';

export type MovementReason =
  | 'purchase'
  | 'sale'
  | 'exchange'
  | 'return'
  | 'damage'
  | 'adjustment'
  | 'transfer'
  | 'other';

export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'archived' | 'discontinued';

export interface InventoryRecord {
  id: string;
  modelId: string;
  brand: string;
  model: string;
  variant: string;
  ram: string;
  storage: string;
  condition: string;
  quantity: number;
  status?: InventoryStatus;
  buyPrice?: number;
  sellPrice?: number;
  createdAt: string;
  updatedAt: string;
  totalPurchased: number;
  totalSold: number;
  /**
   * Optional compressed data-URL images for the phone (used-phones showroom).
   * Not part of the stock contract — purely presentational.
   * No fixed cap (v5.1 §16.1): the gallery renders any count dynamically.
   */
  images?: string[];
  /**
   * Optional presentational fields for the Product Details sales page
   * (v5.1 §10.1). None of these are part of the stock contract; existing
   * records simply lack them and the UI hides empty sections/lines.
   */
  color?: string;
  batteryHealth?: number;
  warranty?: string;
  city?: string;
  description?: string;
  /** Short ad code used in WhatsApp {code}; fallback = short form of record.id. */
  code?: string;
  /**
   * Private operational label — phone source / owner tracking (Workstream A).
   * Admin-only: NEVER exposed via v_public_inventory (customer-facing view).
   */
  sourceLabel?: string;
}

export type TimelineEventType =
  | 'created' | 'stock_added' | 'stock_removed' | 'price_updated'
  | 'status_changed' | 'sold' | 'restocked' | 'exchanged' | 'adjusted';

export interface TimelineEvent {
  id: string;
  recordId: string;
  type: TimelineEventType;
  detail: string;
  quantity?: number;
  quantityBefore?: number;
  quantityAfter?: number;
  priceBefore?: number;
  priceAfter?: number;
  statusBefore?: InventoryStatus;
  statusAfter?: InventoryStatus;
  createdBy?: string;
  createdAt: string;
}

export interface InventoryMovement {
  id: string;
  recordId: string;
  type: 'add' | 'remove';
  reason: MovementReason;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  note?: string;
  reference?: string;
  createdBy?: string;
  createdAt: string;
}

/** @deprecated Use InventoryMovement instead. Kept for backward compatibility. */
export interface InventoryTransaction {
  id: string;
  recordId: string;
  type: 'add' | 'remove' | 'adjust';
  delta: number;
  quantityBefore: number;
  quantityAfter: number;
  note?: string;
  createdAt: string;
}

// Legacy localStorage key names — kept as pure static config for
// migration/audit reference only (Rev 4: no reads, no writes). The central
// cutover (2026-08-11) retired them; they remain exported so the audit
// surface stays visible to the p3 gate and future migration tooling.
export const INVENTORY_KEY = 'catalog_inventory';
export const TRANSACTIONS_KEY = 'catalog_inventory_transactions';
export const MOVEMENTS_KEY = 'catalog_inventory_movements_v2';

export const InventoryService = {
  /**
   * Add stock for a phone. If a record already exists for the same
   * modelId + variant + condition the stock is incremented centrally;
   * otherwise a new central item is created (unpublished by default —
   * publishing is an explicit admin action).
   */
  async addStock(
    brand: string,
    model: string,
    variant: string | PhoneVariant,
    quantity: number,
    buyPrice?: number,
    sellPrice?: number,
    reason: MovementReason = 'purchase',
    note?: string,
    reference?: string,
    createdBy?: string,
    condition: string = 'New',
    batteryHealth?: number,
    sourceLabel?: string,
  ): Promise<InventoryRecord> {
    const { variantLabel, ram, storage } = inventoryCentral.resolveVariantParams(variant);
    const normalizedModel = normalizeModelName(model);
    const modelId = `${brand} ${normalizedModel}`;

    const existing = inventoryCentral.getCachedAdmin().find(r =>
      r.modelId.toLowerCase() === modelId.toLowerCase() &&
      r.variant === variantLabel &&
      r.condition === condition
    );

    if (existing) {
      const updated = await inventoryCentral.centralAddStock(
        existing.id,
        quantity,
        reason,
        note ?? null,
        reference ?? null,
        createdBy ?? null,
      );
      if (!updated) throw new Error(`record ${existing.id} is not available for stock changes`);
      return updated;
    }

    return inventoryCentral.centralAddItem({
      modelId,
      brand,
      model: normalizedModel,
      variant: variantLabel,
      ram,
      storage,
      condition,
      quantity,
      buyPrice,
      sellPrice,
      batteryHealth,
      sourceLabel,
    });
  },

  async removeStock(recordId: string, quantity: number, note?: string): Promise<InventoryRecord | null> {
    return this.removeStockWithReason(recordId, quantity, 'sale', note);
  },

  async removeStockWithReason(
    recordId: string,
    quantity: number,
    reason: MovementReason,
    note?: string,
    reference?: string,
    createdBy?: string,
  ): Promise<InventoryRecord | null> {
    return inventoryCentral.centralRemoveStock(
      recordId,
      quantity,
      reason,
      note ?? null,
      reference ?? null,
      createdBy ?? null,
    );
  },

  async adjustStock(
    recordId: string,
    newQuantity: number,
    reason: MovementReason,
    note?: string,
  ): Promise<InventoryRecord | null> {
    return inventoryCentral.centralAdjustStock(recordId, newQuantity, reason, note ?? null);
  },

  /** Admin full list from the central cache (admin rows when available). */
  getAll(): InventoryRecord[] {
    return inventoryCentral.getCachedAdmin();
  },

  /**
   * Single official source for devices that can actually be delivered
   * (buy / exchange lists). The central `v_public_inventory` view is the only
   * gate: published AND in stock AND not archived/discontinued/deleted.
   */
  getExchangeableDevices(): InventoryRecord[] {
    return inventoryCentral.getCachedPublic();
  },

  getLowStock(threshold = 3): InventoryRecord[] {
    return inventoryCentral.getCachedAdmin().filter(r => r.quantity > 0 && r.quantity <= threshold);
  },

  getOutOfStock(): InventoryRecord[] {
    return inventoryCentral.getCachedAdmin().filter(r => r.status === 'out_of_stock' || r.quantity <= 0);
  },

  search(query: string): InventoryRecord[] {
    if (!query.trim()) return this.getAll();
    const lower = query.toLowerCase();
    return inventoryCentral.getCachedAdmin().filter(r =>
      r.brand.toLowerCase().includes(lower) ||
      r.model.toLowerCase().includes(lower) ||
      r.variant.includes(lower) ||
      r.modelId.toLowerCase().includes(lower)
    );
  },

  /**
   * Set an admin state. `archived` / `discontinued` are applied centrally
   * (and automatically unpublish the item). The derived stock statuses
   * (in_stock / low_stock / out_of_stock) cannot be set directly — calling
   * with one restores a previously archived/discontinued/deleted item.
   */
  async setStatus(recordId: string, status: InventoryStatus): Promise<InventoryRecord | null> {
    if (status === 'archived' || status === 'discontinued') {
      return inventoryCentral.centralSetStatus(recordId, status, null, null);
    }
    const record = inventoryCentral.getCachedAdmin().find(r => r.id === recordId);
    if (!record) return null;
    if (record.status === 'archived' || record.status === 'discontinued') {
      return inventoryCentral.centralRestore(recordId, null, null);
    }
    return record;
  },

  getTimeline(recordId: string, limit = 50): TimelineEvent[] {
    return inventoryCentral.getCentralTimeline(recordId, limit);
  },

  getGlobalTimeline(limit = 50): TimelineEvent[] {
    return inventoryCentral.getCentralGlobalTimeline(limit);
  },

  getRecordSummary(recordId: string): {
    exists: boolean;
    events: number;
    firstEvent: string | null;
    lastEvent: string | null;
    totalAdded: number;
    totalRemoved: number;
  } | null {
    return inventoryCentral.getCentralRecordSummary(recordId);
  },

  getRecentTransactions(limit = 20): InventoryTransaction[] {
    return inventoryCentral.getCentralTransactions(limit);
  },

  getMovements(recordId?: string, limit = 50): InventoryMovement[] {
    return inventoryCentral.getCentralMovements(recordId, limit);
  },

  /** Soft-delete centrally (status = 'deleted'); the row stays for audit. */
  async deleteRecord(recordId: string): Promise<void> {
    await inventoryCentral.centralDeleteRecord(recordId);
  },

  /**
   * Attach optional showroom images for a record. Under the central cutover
   * each data-URL is uploaded to the `inventory-images` bucket and attached
   * via `inventory_add_image`. Removal/reordering needs readable image ids
   * (blocked by RLS) and is deferred to a later phase.
   */
  async updateImages(recordId: string, images: string[]): Promise<InventoryRecord | null> {
    const record = inventoryCentral.getCachedAdmin().find(r => r.id === recordId);
    if (!record) return null;
    for (const img of images) {
      if (typeof img !== 'string' || !img.startsWith('data:')) continue;
      try {
        const blob = await (await fetch(img)).blob();
        await inventoryCentral.uploadRecordImage(recordId, blob);
      } catch {
        // Best-effort: image upload failures must not block the record save.
      }
    }
    return inventoryCentral.getCachedAdmin().find(r => r.id === recordId) ?? null;
  },

  /**
   * Update the optional presentational fields used by the Product Details
   * sales page (color / batteryHealth / warranty / city / description / code).
   * Stock contract untouched — purely presentational.
   */
  async updateDetails(
    recordId: string,
    details: Partial<Pick<InventoryRecord, 'color' | 'batteryHealth' | 'warranty' | 'city' | 'description' | 'code' | 'sourceLabel'>>,
  ): Promise<InventoryRecord | null> {
    return inventoryCentral.centralUpdateDetails(recordId, details);
  },

  /**
   * Public image URLs are not readable by the anon storefront (RLS) and are
   * deferred to a later phase. The central record carries no image list yet.
   */
  getImages(recordId: string): string[] {
    void recordId;
    return [];
  },

  /**
   * Update buy/sell prices for a record. Central `inventory_update_prices`
   * keeps any omitted value unchanged (COALESCE), matching the local contract.
   */
  async updatePrices(recordId: string, buyPrice?: number, sellPrice?: number): Promise<InventoryRecord | null> {
    return inventoryCentral.centralUpdatePrices(recordId, buyPrice, sellPrice);
  },

  /**
   * Hide a record from the customer-facing showroom/exchange lists
   * (central: status = 'archived', which also unpublishes it).
   */
  async hideRecord(recordId: string): Promise<InventoryRecord | null> {
    return inventoryCentral.centralSetStatus(recordId, 'archived', null, null);
  },

  /**
   * Un-hide a previously archived/discontinued/deleted record: central
   * `inventory_restore` re-derives the stock status and unpublishes it
   * (publishing is an explicit admin action).
   */
  async unhideRecord(recordId: string): Promise<InventoryRecord | null> {
    return inventoryCentral.centralRestore(recordId, null, null);
  },

  /**
   * Publish / unpublish a record for the customer-facing showroom and
   * exchange lists (central `inventory_set_published`). Publishing is an
   * explicit admin action — stock additions never auto-publish.
   */
  async publishRecord(recordId: string, published: boolean): Promise<InventoryRecord | null> {
    return inventoryCentral.centralSetPublished(recordId, published, null, null);
  },

  /** Whether a record is currently published to the customer-facing lists. */
  isRecordPublished(recordId: string): boolean {
    return inventoryCentral.isRecordPublished(recordId);
  },
};

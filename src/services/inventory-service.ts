/**
 * Inventory Service — OPERATIONAL STOCK (WAREHOUSE BOUNDED CONTEXT)
 *
 * ── AUDIT ARCHITECTURE NOTE 2026-08-01 ─────────────────────────────────
 *  This service manages SKU-level stock: each inventory record is
 *  ModelID + Variant + Quantity. It is the SINGLE SOURCE OF TRUTH for
 *  *quantities in stock*. It does NOT track individual IMEIs, profit
 *  per-unit, or per-device lifecycle events.
 *
 *  This module is intentionally SEPARATE from two sibling modules that
 *  handle DIFFERENT Bounded Contexts:
 *
 *    1. DeviceLedger    (IMEI-level individual asset register + events)
 *                        → see src/services/device-ledger.ts
 *    2. InventoryIntelligence (BI ANALYSIS SANDBOX — a copy/importable
 *                        workspace used for "what-if" scenarios).
 *                        → see src/business-intelligence/actions/InventoryIntelligence.tsx
 *
 *  DO NOT merge these three contexts without a Product/Architecture
 *  decision — they solve three distinct business problems today.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Each inventory item is: ModelID + Variant + Quantity.
 * No free-text fields for model info.
 */

import { normalizeModelName } from './catalog-service';
import type { PhoneVariant } from '../data/phone-variants';
import { generateId } from '../business-intelligence/data-source';

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

const INVENTORY_KEY = 'catalog_inventory';
const TRANSACTIONS_KEY = 'catalog_inventory_transactions';
const MOVEMENTS_KEY = 'catalog_inventory_movements_v2';
const TIMELINE_KEY = 'inventory_timeline_v3';

function calcStatus(quantity: number): InventoryStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= 3) return 'low_stock';
  return 'in_stock';
}

function loadTimeline(): TimelineEvent[] {
  try {
    const stored = localStorage.getItem(TIMELINE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveTimelineEvent(event: TimelineEvent) {
  const all = loadTimeline();
  all.unshift(event);
  localStorage.setItem(TIMELINE_KEY, JSON.stringify(all.slice(0, 5000)));
}

function loadAll(): InventoryRecord[] {
  try {
    const stored = localStorage.getItem(INVENTORY_KEY);
    const records: InventoryRecord[] = stored ? JSON.parse(stored) : [];
    for (const r of records) {
      if (!r.status) r.status = calcStatus(r.quantity);
      if (!r.condition) r.condition = 'New';
      const rec = r as unknown as Record<string, unknown>;
      if (typeof rec.totalPurchased !== 'number') rec.totalPurchased = 0;
      if (typeof rec.totalSold !== 'number') rec.totalSold = 0;
    }
    return records;
  } catch { return []; }
}

function saveAll(records: InventoryRecord[]) {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(records));
}

function loadTransactions(): InventoryTransaction[] {
  try {
    const stored = localStorage.getItem(TRANSACTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveTransaction(tx: InventoryTransaction) {
  const all = loadTransactions();
  all.unshift(tx);
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(all.slice(0, 500)));
}

function loadMovements(): InventoryMovement[] {
  try {
    const stored = localStorage.getItem(MOVEMENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveMovement(movement: InventoryMovement) {
  const all = loadMovements();
  all.unshift(movement);
  localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(all.slice(0, 2000)));
}

export const InventoryService = {
  addStock(
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
  ): InventoryRecord {
    const records = loadAll();
    const variantLabel = typeof variant === 'string' ? variant : variant.label;
    const ram = typeof variant === 'string' ? `${variantLabel.split('/')[0]}GB` : variant.ram;
    const storage = typeof variant === 'string' ? `${variantLabel.split('/')[1]}${variantLabel.includes('T') ? '' : 'GB'}` : variant.storage;
    const normalizedModel = normalizeModelName(model);
    const modelId = `${brand} ${normalizedModel}`;

    const existing = records.find(r =>
      r.modelId.toLowerCase() === modelId.toLowerCase() &&
      r.variant === variantLabel &&
      r.condition === condition
    );

    if (existing) {
      const before = existing.quantity;
      existing.quantity += quantity;
      existing.updatedAt = new Date().toISOString();
      existing.totalPurchased = (existing.totalPurchased || 0) + quantity;
      existing.status = calcStatus(existing.quantity);
      if (buyPrice) existing.buyPrice = buyPrice;
      if (sellPrice) existing.sellPrice = sellPrice;
      saveAll(records);

      saveTransaction({
        id: generateId(),
        recordId: existing.id,
        type: 'add',
        delta: quantity,
        quantityBefore: before,
        quantityAfter: existing.quantity,
        createdAt: new Date().toISOString(),
      });

      saveMovement({
        id: generateId(),
        recordId: existing.id,
        type: 'add',
        reason,
        quantity,
        quantityBefore: before,
        quantityAfter: existing.quantity,
        note,
        reference,
        createdBy,
        createdAt: new Date().toISOString(),
      });

      saveTimelineEvent({
        id: generateId(),
        recordId: existing.id,
        type: 'stock_added',
        detail: `تمت إضافة ${quantity} قطعة. المخزون: ${before} ← ${existing.quantity}`,
        quantity,
        quantityBefore: before,
        quantityAfter: existing.quantity,
        createdBy,
        createdAt: new Date().toISOString(),
      });

      return existing;
    }

    const record: InventoryRecord = {
      id: generateId(),
      modelId,
      brand,
      model: normalizedModel,
      variant: variantLabel,
      ram,
      storage,
      condition,
      quantity,
      status: calcStatus(quantity),
      buyPrice,
      sellPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalPurchased: quantity,
      totalSold: 0,
    };

    records.push(record);
    saveAll(records);

    saveTransaction({
      id: generateId(),
      recordId: record.id,
      type: 'add',
      delta: quantity,
      quantityBefore: 0,
      quantityAfter: quantity,
      createdAt: new Date().toISOString(),
    });

    saveMovement({
      id: generateId(),
      recordId: record.id,
      type: 'add',
      reason,
      quantity,
      quantityBefore: 0,
      quantityAfter: quantity,
      note,
      reference,
      createdBy,
      createdAt: new Date().toISOString(),
    });

    saveTimelineEvent({
      id: generateId(),
      recordId: record.id,
      type: 'created',
      detail: `تم إنشاء سجل لـ ${brand} ${normalizedModel} (${variantLabel}, ${condition}) بكمية ${quantity}`,
      quantity,
      quantityBefore: 0,
      quantityAfter: quantity,
      createdBy,
      createdAt: new Date().toISOString(),
    });

    return record;
  },

  removeStock(recordId: string, quantity: number, note?: string): InventoryRecord | null {
    return this.removeStockWithReason(recordId, quantity, 'sale', note);
  },

  removeStockWithReason(
    recordId: string,
    quantity: number,
    reason: MovementReason,
    note?: string,
    reference?: string,
    createdBy?: string,
  ): InventoryRecord | null {
    const records = loadAll();
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return null;

    const record = records[idx]!;
    if (record.quantity < quantity) return null;

    const before = record.quantity;
    record.quantity -= quantity;
    record.updatedAt = new Date().toISOString();
    record.totalSold = (record.totalSold || 0) + quantity;
    record.status = calcStatus(record.quantity);
    saveAll(records);

    saveTransaction({
      id: generateId(),
      recordId,
      type: 'remove',
      delta: -quantity,
      quantityBefore: before,
      quantityAfter: record.quantity,
      note,
      createdAt: new Date().toISOString(),
    });

    saveMovement({
      id: generateId(),
      recordId,
      type: 'remove',
      reason,
      quantity,
      quantityBefore: before,
      quantityAfter: record.quantity,
      note,
      reference,
      createdBy,
      createdAt: new Date().toISOString(),
    });

    const timelineType: TimelineEventType = reason === 'sale' ? 'sold' : reason === 'exchange' ? 'exchanged' : reason === 'return' ? 'restocked' : 'stock_removed';
    const reasonLabels: Record<MovementReason, string> = {
      purchase: 'شراء', sale: 'بيع', exchange: 'استبدال', return: 'مرتجع',
      damage: 'تالف', adjustment: 'تسوية', transfer: 'تحويل', other: 'أخرى',
    };
    saveTimelineEvent({
      id: generateId(),
      recordId,
      type: timelineType,
      detail: `${reasonLabels[reason]} ${quantity} قطع. المخزون: ${before} ← ${record.quantity}`,
      quantity,
      quantityBefore: before,
      quantityAfter: record.quantity,
      createdBy,
      createdAt: new Date().toISOString(),
    });

    return record;
  },

  adjustStock(
    recordId: string,
    newQuantity: number,
    reason: MovementReason,
    note?: string,
  ): InventoryRecord | null {
    const records = loadAll();
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return null;

    const record = records[idx]!;
    const before = record.quantity;
    const diff = newQuantity - before;
    record.quantity = newQuantity;
    record.updatedAt = new Date().toISOString();
    record.status = calcStatus(newQuantity);
    saveAll(records);

    saveTransaction({
      id: generateId(),
      recordId,
      type: 'adjust',
      delta: diff,
      quantityBefore: before,
      quantityAfter: newQuantity,
      note,
      createdAt: new Date().toISOString(),
    });

    saveMovement({
      id: generateId(),
      recordId,
      type: diff >= 0 ? 'add' : 'remove',
      reason,
      quantity: Math.abs(diff),
      quantityBefore: before,
      quantityAfter: newQuantity,
      note,
      createdAt: new Date().toISOString(),
    });

    saveTimelineEvent({
      id: generateId(),
      recordId,
      type: 'adjusted',
      detail: `تسوية المخزون: ${before} ← ${newQuantity} (${diff >= 0 ? '+' : ''}${diff})`,
      quantity: Math.abs(diff),
      quantityBefore: before,
      quantityAfter: newQuantity,
      createdAt: new Date().toISOString(),
    });

    return record;
  },

  getAll(): InventoryRecord[] {
    return loadAll();
  },

  /**
   * Single official source for devices that can actually be delivered
   * (buy / exchange lists). Contract: in stock AND not archived AND not
   * discontinued. Archived/discontinued/qty=0 records stay visible ONLY on the
   * admin Inventory management page (via getAll()).
   */
  getExchangeableDevices(): InventoryRecord[] {
    return loadAll().filter(r =>
      r.quantity > 0 &&
      r.status !== 'archived' &&
      r.status !== 'discontinued'
    );
  },

  getLowStock(threshold = 3): InventoryRecord[] {
    return loadAll().filter(r => r.quantity > 0 && r.quantity <= threshold);
  },

  getOutOfStock(): InventoryRecord[] {
    return loadAll().filter(r => r.status === 'out_of_stock' || r.quantity <= 0);
  },

  search(query: string): InventoryRecord[] {
    if (!query.trim()) return this.getAll();
    const lower = query.toLowerCase();
    return loadAll().filter(r =>
      r.brand.toLowerCase().includes(lower) ||
      r.model.toLowerCase().includes(lower) ||
      r.variant.includes(lower) ||
      r.modelId.toLowerCase().includes(lower)
    );
  },

  setStatus(recordId: string, status: InventoryStatus): InventoryRecord | null {
    const records = loadAll();
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) return null;
    const record = records[idx]!;
    const statusBefore = record.status || calcStatus(record.quantity);
    record.status = status;
    record.updatedAt = new Date().toISOString();
    saveAll(records);
    const statusLabels: Record<InventoryStatus, string> = {
      in_stock: 'متوفر', low_stock: 'منخفض', out_of_stock: 'نفد',
      archived: 'مؤرشف', discontinued: 'متوقف',
    };
    saveTimelineEvent({
      id: generateId(),
      recordId,
      type: 'status_changed',
      detail: `تغيرت الحالة من ${statusLabels[statusBefore]} إلى ${statusLabels[status]}`,
      statusBefore,
      statusAfter: status,
      createdAt: new Date().toISOString(),
    });
    return record;
  },

  getTimeline(recordId: string, limit = 50): TimelineEvent[] {
    return loadTimeline().filter(e => e.recordId === recordId).slice(0, limit);
  },

  getGlobalTimeline(limit = 50): TimelineEvent[] {
    return loadTimeline().slice(0, limit);
  },

  getRecordSummary(recordId: string): {
    exists: boolean;
    events: number;
    firstEvent: string | null;
    lastEvent: string | null;
    totalAdded: number;
    totalRemoved: number;
  } | null {
    const record = loadAll().find(r => r.id === recordId);
    if (!record) return null;
    const events = loadTimeline().filter(e => e.recordId === recordId);
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const e of events) {
      if (e.type === 'stock_added' || e.type === 'created') totalAdded += e.quantity || 0;
      if (e.type === 'sold' || e.type === 'exchanged' || e.type === 'stock_removed') totalRemoved += e.quantity || 0;
    }
    return {
      exists: true,
      events: events.length,
      firstEvent: events.length > 0 ? events[events.length - 1]!.createdAt : null,
      lastEvent: events.length > 0 ? events[0]!.createdAt : null,
      totalAdded,
      totalRemoved,
    };
  },

  getRecentTransactions(limit = 20): InventoryTransaction[] {
    return loadTransactions().slice(0, limit);
  },

  getMovements(recordId?: string, limit = 50): InventoryMovement[] {
    const all = loadMovements();
    const filtered = recordId ? all.filter(m => m.recordId === recordId) : all;
    return filtered.slice(0, limit);
  },

  deleteRecord(recordId: string) {
    const records = loadAll().filter(r => r.id !== recordId);
    saveAll(records);
  },
};

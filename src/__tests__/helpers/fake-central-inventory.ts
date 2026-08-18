/**
 * Fake Supabase client for the central-inventory test suite.
 *
 * The real `inventory-central-service` talks to Supabase through
 * `getSupabaseClient()` only. These tests mock `../../core/supabase/client`
 * (per file, restored by vitest) and point it at this in-memory database that
 * faithfully mirrors the SECURITY DEFINER RPCs from
 * `supabase/inventory-central/01-inventory-apply.sql`:
 *
 *   - writes COALESCE omitted fields, derive stock status, record a movement
 *   - `inventory_management_list` returns all non-deleted rows (admin)
 *   - `v_public_inventory` returns only PUBLISHED + active + quantity>0 rows
 *   - archiving/discontinuing/deleting automatically unpublishes
 *   - restore re-derives status and UNPUBLISHES (publishing stays explicit)
 *
 * This lets the REAL service logic (cache upsert, public/admin split, timeline
 * mapping) run under test while the module state is fully isolated per file
 * (`resetCentralInventoryState()` + fresh DB in `beforeEach`).
 */

import { DEFAULT_INVENTORY_SEED } from '../../services/inventory-seed';

export interface FakeInventoryRow {
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

export interface FakeMovementRow {
  id: string;
  inventory_id: string;
  action: string;
  before: { quantity: number; sell_price: number | null; status: string } | null;
  after: { quantity: number; sell_price: number | null; status: string } | null;
  delta: number | null;
  reason: string | null;
  metadata: { reference?: string } | null;
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
}

const ACTIVE = ['in_stock', 'low_stock', 'out_of_stock'];
const INACTIVE = ['archived', 'discontinued', 'deleted'];

function uuid(): string {
  return crypto.randomUUID();
}

function deriveStatus(quantity: number): string {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= 3) return 'low_stock';
  return 'in_stock';
}

function nowIso(): string {
  return new Date().toISOString();
}

class FakeCentralDb {
  rows: FakeInventoryRow[] = [];
  movements: FakeMovementRow[] = [];

  private find(id: string): FakeInventoryRow | undefined {
    return this.rows.find((r) => r.id === id);
  }

  private snap(row: FakeInventoryRow): { quantity: number; sell_price: number | null; status: string } {
    return { quantity: row.quantity, sell_price: row.sell_price, status: row.status };
  }

  private movement(row: FakeInventoryRow, action: string, delta: number | null, opts: {
    before?: { quantity: number; sell_price: number | null; status: string } | null;
    reason?: string | null;
    metadata?: { reference?: string } | null;
    note?: string | null;
  } = {}): void {
    this.movements.unshift({
      id: uuid(),
      inventory_id: row.id,
      action,
      before: opts.before !== undefined ? opts.before : this.snap(row),
      after: this.snap(row),
      delta,
      reason: opts.reason ?? null,
      metadata: opts.metadata ?? null,
      note: opts.note ?? null,
      actor_user_id: null,
      created_at: nowIso(),
    });
  }

  addItem(args: Record<string, unknown>): FakeInventoryRow {
    const quantity = Number(args.p_quantity ?? 0);
    const row: FakeInventoryRow = {
      id: uuid(),
      model_id: String(args.p_model_id ?? ''),
      brand: String(args.p_brand ?? ''),
      model: String(args.p_model ?? ''),
      variant: String(args.p_variant ?? ''),
      ram: args.p_ram != null ? String(args.p_ram) : null,
      storage: String(args.p_storage ?? ''),
      condition: String(args.p_condition ?? 'New'),
      color: args.p_color != null && args.p_color !== '' ? String(args.p_color) : null,
      quantity,
      status: deriveStatus(quantity),
      buy_price: args.p_buy_price != null ? Number(args.p_buy_price) : null,
      sell_price: args.p_sell_price != null ? Number(args.p_sell_price) : null,
      created_at: nowIso(),
      updated_at: nowIso(),
      total_purchased: quantity,
      total_sold: 0,
      code: args.p_code != null ? String(args.p_code) : null,
      battery_health: args.p_battery_health != null ? Number(args.p_battery_health) : null,
      warranty: args.p_warranty != null ? String(args.p_warranty) : null,
      city: args.p_city != null ? String(args.p_city) : null,
      description: args.p_description != null ? String(args.p_description) : null,
      is_published: Boolean(args.p_is_published),
      source_label: args.p_source_label != null && String(args.p_source_label).trim() !== '' ? String(args.p_source_label).trim() : null,
    };
    this.rows.push(row);
    this.movement(row, 'created', quantity);
    return row;
  }

  addStock(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    const qty = Number(args.p_quantity ?? 0);
    row.quantity += qty;
    row.total_purchased += qty;
    row.status = deriveStatus(row.quantity);
    row.updated_at = nowIso();
    this.movement(row, 'stock_added', qty, {
      before: undefined,
      reason: args.p_reason != null ? String(args.p_reason) : null,
      metadata: args.p_metadata as { reference?: string } | null | undefined,
      note: args.p_note != null ? String(args.p_note) : null,
    });
    return row;
  }

  removeStock(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    const qty = Number(args.p_quantity ?? 0);
    row.quantity -= qty;
    row.total_sold += qty;
    row.status = deriveStatus(row.quantity);
    row.updated_at = nowIso();
    this.movement(row, 'stock_removed', -qty, {
      before: undefined,
      reason: args.p_reason != null ? String(args.p_reason) : null,
      metadata: args.p_metadata as { reference?: string } | null | undefined,
      note: args.p_note != null ? String(args.p_note) : null,
    });
    return row;
  }

  adjustStock(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    const qty = Number(args.p_quantity ?? 0);
    const delta = qty - row.quantity;
    row.quantity = qty;
    row.status = deriveStatus(row.quantity);
    row.updated_at = nowIso();
    this.movement(row, 'adjusted', delta, {
      before: undefined,
      reason: args.p_reason != null ? String(args.p_reason) : null,
      metadata: args.p_metadata as { reference?: string } | null | undefined,
      note: args.p_note != null ? String(args.p_note) : null,
    });
    return row;
  }

  updatePrices(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    const before = this.snap(row);
    if (args.p_buy_price != null) row.buy_price = Number(args.p_buy_price);
    if (args.p_sell_price != null) row.sell_price = Number(args.p_sell_price);
    row.updated_at = nowIso();
    this.movement(row, 'price_updated', null, {
      before,
      reason: args.p_reason != null ? String(args.p_reason) : null,
      note: args.p_note != null ? String(args.p_note) : null,
    });
    return row;
  }

  updateDetails(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    const patch: Array<[keyof FakeInventoryRow, unknown]> = [
      ['model_id', args.p_model_id],
      ['brand', args.p_brand],
      ['model', args.p_model],
      ['variant', args.p_variant],
      ['ram', args.p_ram],
      ['storage', args.p_storage],
      ['condition', args.p_condition],
      ['color', args.p_color],
      ['code', args.p_code],
      ['battery_health', args.p_battery_health],
      ['warranty', args.p_warranty],
      ['city', args.p_city],
      ['description', args.p_description],
    ];
    for (const [key, value] of patch) {
      if (value != null) row[key] = value as never;
    }
    if (args.p_source_label != null) {
      const trimmed = String(args.p_source_label).trim();
      row.source_label = trimmed === '' ? null : trimmed;
    }
    row.updated_at = nowIso();
    this.movement(row, 'details_updated', null, { before: undefined });
    return row;
  }

  setStatus(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    const status = String(args.p_status ?? '');
    row.status = status;
    if (INACTIVE.includes(status)) row.is_published = false;
    row.updated_at = nowIso();
    this.movement(row, status, null, {
      before: undefined,
      reason: args.p_reason != null ? String(args.p_reason) : null,
      note: args.p_note != null ? String(args.p_note) : null,
    });
    return row;
  }

  restore(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    row.status = deriveStatus(row.quantity);
    row.is_published = false;
    row.updated_at = nowIso();
    this.movement(row, 'restored', null, { before: undefined });
    return row;
  }

  setPublished(args: Record<string, unknown>): FakeInventoryRow | null {
    const row = this.find(String(args.p_inventory_id ?? ''));
    if (!row) return null;
    row.is_published = Boolean(args.p_is_published);
    row.updated_at = nowIso();
    this.movement(row, row.is_published ? 'published' : 'hidden', null, { before: undefined });
    return row;
  }

  managementList(): FakeInventoryRow[] {
    return this.rows.filter((r) => r.status !== 'deleted');
  }

  publicList(): FakeInventoryRow[] {
    return this.rows
      .filter((r) => r.is_published && ACTIVE.includes(r.status) && r.quantity > 0)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  movementsList(): FakeMovementRow[] {
    return [...this.movements].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

let instance: FakeCentralDb | null = null;

export function getFakeCentralDb(): FakeCentralDb {
  if (!instance) instance = new FakeCentralDb();
  return instance;
}

export function resetFakeCentralDb(): void {
  instance = new FakeCentralDb();
}

export function seedFakeCentralDb(): void {
  const db = getFakeCentralDb();
  for (const phone of DEFAULT_INVENTORY_SEED) {
    const [ramPart, storagePart] = phone.variant.split('/');
    db.rows.push({
      id: uuid(),
      model_id: `${phone.brand} ${phone.model}`,
      brand: phone.brand,
      model: phone.model,
      variant: phone.variant,
      ram: ramPart ? `${ramPart.trim()}GB` : null,
      storage: storagePart ? `${storagePart.trim()}GB` : '',
      condition: phone.condition,
      color: null,
      quantity: phone.quantity,
      status: deriveStatus(phone.quantity),
      buy_price: phone.buyPrice,
      sell_price: phone.sellPrice,
      created_at: nowIso(),
      updated_at: nowIso(),
      total_purchased: phone.quantity,
      total_sold: 0,
      code: null,
      battery_health: null,
      warranty: null,
      city: null,
      description: null,
      is_published: true,
      source_label: null,
    });
  }
}

function queryResult(db: FakeCentralDb, table: string): { data: unknown[]; error: null } {
  if (table === 'v_public_inventory') return { data: db.publicList(), error: null };
  if (table === 'inventory_movements') return { data: db.movementsList(), error: null };
  if (table === 'inventory_images') return { data: [], error: null };
  return { data: [], error: null };
}

function rpcResult(db: FakeCentralDb, fn: string, args: Record<string, unknown>): { data: unknown; error: null } {
  switch (fn) {
    case 'inventory_add_item':
      return { data: db.addItem(args), error: null };
    case 'inventory_add_stock':
      return { data: db.addStock(args), error: null };
    case 'inventory_remove_stock':
      return { data: db.removeStock(args), error: null };
    case 'inventory_adjust_stock':
      return { data: db.adjustStock(args), error: null };
    case 'inventory_update_prices':
      return { data: db.updatePrices(args), error: null };
    case 'inventory_update_details':
      return { data: db.updateDetails(args), error: null };
    case 'inventory_set_status':
      return { data: db.setStatus(args), error: null };
    case 'inventory_restore':
      return { data: db.restore(args), error: null };
    case 'inventory_set_published':
      return { data: db.setPublished(args), error: null };
    case 'inventory_management_list':
      return { data: db.managementList(), error: null };
    case 'inventory_add_image':
    case 'inventory_remove_image':
      return { data: null, error: null };
    default:
      return { data: null, error: null };
  }
}

export function getFakeSupabaseClient(): {
  from: (table: string) => {
    select: () => { eq: () => unknown; order: () => Promise<{ data: unknown[]; error: null }> };
    order: () => Promise<{ data: unknown[]; error: null }>;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>;
  storage: {
    from: (bucket: string) => {
      upload: () => Promise<{ error: null; data: { path: string } }>;
      getPublicUrl: () => { data: { publicUrl: string } };
    };
  };
} {
  const db = getFakeCentralDb();
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve(queryResult(db, table)),
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown> = {}) => Promise.resolve(rpcResult(db, fn, args)),
    storage: {
      from: () => ({
        upload: async () => ({ error: null, data: { path: 'inventory-images/fake.jpg' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
  };
}

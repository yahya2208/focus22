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
import {
  CAR_BODY_TYPE_VALUES,
  CAR_CONDITION_STATES,
  CAR_FUEL_VALUES,
  CAR_TRANSMISSION_VALUES,
  PROPERTY_CONDITION_STATES,
  PROPERTY_TRANSACTION_TYPES,
  PROPERTY_TYPE_VALUES,
} from '../../domains/listings/types';

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
  /** Listing category (P8.3). Absent ⇒ legacy phone rows behave unchanged. */
  category?: string;
  /** Neutral pricing unit ('sale' | 'monthly'); phones implicitly 'sale'. */
  price_period?: string;
  /** Normalized snake-key car details (mirrors public.car_details). */
  car_details?: Record<string, unknown> | null;
  /** Normalized snake-key property details (mirrors public.property_details). */
  property_details?: Record<string, unknown> | null;
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

/**
 * Mirror of public.inventory_images (00019). Paths are bucket-relative
 * (`<inventory_id>/<token>.jpg`) — exactly what uploadRecordImage produces
 * and what v_public_listings aggregates as `images` (ORDER BY position,
 * created_at). P8.6/D4: the fake must match the real projection.
 */
export interface FakeImageRow {
  id: string;
  inventory_id: string;
  path: string;
  position: number | null;
  is_cover: boolean;
  created_at: string;
}

const ACTIVE = ['in_stock', 'low_stock', 'out_of_stock'];
const INACTIVE = ['archived', 'discontinued', 'deleted'];

/**
 * Compatibility projection for the legacy phone-grade `condition` CHECK
 * (inventory_items_condition_enum, migration 00019). Mirrors the CASE maps
 * in migration 00038 byte-for-value; pinned by listing-service tests.
 * The AUTHORITATIVE condition always lives in car/property details.
 */
export const FAKE_LISTING_CONDITION_PROJECTION: Record<string, string> = {
  new: 'New',
  used: 'Good',
  good: 'Good',
  damaged: 'For Parts',
  needs_renovation: 'Fair',
};

// ── Listing fixtures (P8.3): exactly ONE car + ONE property ────────────────

export interface FakeListingFixture {
  brand: string;
  model: string;
  price: number;
  period: 'sale' | 'monthly';
  city: string;
  color?: string;
  description?: string;
  car?: Record<string, unknown>;
  propertyDetails?: Record<string, unknown>;
}

export const FAKE_CAR_LISTING_SEED: FakeListingFixture = {
  brand: 'Toyota',
  model: 'Corolla GLX',
  price: 18500,
  period: 'sale',
  city: 'Damascus',
  color: 'White',
  description: 'One owner, full service history.',
  car: {
    trim: 'GLX',
    year: 2020,
    mileage_km: 54000,
    fuel: 'benzin',
    transmission: 'automatic',
    body_type: 'sedan',
    engine_cc: 1800,
    condition_state: 'used',
  },
};

export const FAKE_PROPERTY_LISTING_SEED: FakeListingFixture = {
  brand: '',
  model: 'Apartment Mazzeh 3 rooms',
  price: 450,
  period: 'monthly',
  city: 'Damascus',
  description: 'Furnished-ready apartment near the park.',
  propertyDetails: {
    property_type: 'apartment',
    transaction_type: 'rent',
    district: 'Mazzeh',
    area_m2: 120,
    bedrooms: 3,
    bathrooms: 2,
    floor: 4,
    furnished: false,
    condition_state: 'good',
  },
};

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

// ── Listing RPC emulation (mirrors migration 00038 rules) ──────────────────

const CAR_DETAIL_KEYS = ['trim', 'year', 'mileageKm', 'mileage_km', 'fuel', 'transmission', 'bodyType', 'body_type', 'engineCc', 'engine_cc', 'conditionState', 'condition_state'];
const PROPERTY_DETAIL_KEYS = ['propertyType', 'property_type', 'transactionType', 'transaction_type', 'district', 'areaM2', 'area_m2', 'bedrooms', 'bathrooms', 'floor', 'furnished', 'conditionState', 'condition_state'];

function reject(msg: string): never {
  throw new Error(msg);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) reject(`invalid numeric value: ${String(v)}`);
  return n;
}

export function normalizeCarPayload(raw: Record<string, unknown>): Record<string, unknown> {
  for (const k of Object.keys(raw)) {
    if (!CAR_DETAIL_KEYS.includes(k)) reject(`listing details: unknown car key "${k}"`);
  }
  const conditionState = String(raw.conditionState ?? raw.condition_state ?? 'used');
  if (!(CAR_CONDITION_STATES as readonly string[]).includes(conditionState)) {
    reject(`listing details: invalid car conditionState "${conditionState}"`);
  }
  const fuel = raw.fuel != null ? String(raw.fuel) : '';
  if (fuel !== '' && !(CAR_FUEL_VALUES as readonly string[]).includes(fuel)) {
    reject(`listing details: invalid fuel "${fuel}"`);
  }
  const transmission = raw.transmission != null ? String(raw.transmission) : '';
  if (transmission !== '' && !(CAR_TRANSMISSION_VALUES as readonly string[]).includes(transmission)) {
    reject(`listing details: invalid transmission "${transmission}"`);
  }
  const bodyType = String(raw.bodyType ?? raw.body_type ?? '');
  if (bodyType !== '' && !(CAR_BODY_TYPE_VALUES as readonly string[]).includes(bodyType)) {
    reject(`listing details: invalid bodyType "${bodyType}"`);
  }
  const year = num(raw.year);
  if (year !== null && (year < 1900 || year > 2100)) reject('listing details: year out of range');
  const mileage = num(raw.mileageKm ?? raw.mileage_km);
  if (mileage !== null && mileage < 0) reject('listing details: mileageKm must be >= 0');
  const engineCc = num(raw.engineCc ?? raw.engine_cc);
  if (engineCc !== null && engineCc <= 0) reject('listing details: engineCc must be > 0');

  // An "empty" car payload (all defaults) is rejected — mirrors 00038.
  const trim = String(raw.trim ?? '');
  const fuelRaw = raw.fuel != null ? String(raw.fuel) : '';
  const transmissionRaw = raw.transmission != null ? String(raw.transmission) : '';
  const bodyTypeRaw = bodyType;
  if (trim === '' && year === null && mileage === null && fuelRaw === ''
      && transmissionRaw === '' && bodyTypeRaw === '' && engineCc === null) {
    reject('listing details: car payload is empty');
  }

  return {
    trim,
    year,
    mileage_km: mileage,
    fuel: fuel !== '' ? fuel : null,
    transmission: transmission !== '' ? transmission : null,
    body_type: bodyType !== '' ? bodyType : null,
    engine_cc: engineCc,
    condition_state: conditionState,
  };
}

export function normalizePropertyPayload(raw: Record<string, unknown>): Record<string, unknown> {
  for (const k of Object.keys(raw)) {
    if (!PROPERTY_DETAIL_KEYS.includes(k)) reject(`listing details: unknown property key "${k}"`);
  }
  const propertyType = String(raw.propertyType ?? raw.property_type ?? '');
  if (!(PROPERTY_TYPE_VALUES as readonly string[]).includes(propertyType)) {
    reject('listing details: propertyType is required and must be one of apartment|villa|house|land|shop|office');
  }
  const transactionType = String(raw.transactionType ?? raw.transaction_type ?? '');
  if (!(PROPERTY_TRANSACTION_TYPES as readonly string[]).includes(transactionType)) {
    reject('listing details: transactionType is required and must be sale|rent');
  }
  const conditionState = String(raw.conditionState ?? raw.condition_state ?? 'good');
  if (!(PROPERTY_CONDITION_STATES as readonly string[]).includes(conditionState)) {
    reject(`listing details: invalid property conditionState "${conditionState}"`);
  }
  const areaM2 = num(raw.areaM2 ?? raw.area_m2);
  if (areaM2 !== null && areaM2 <= 0) reject('listing details: areaM2 must be > 0');
  const bedrooms = num(raw.bedrooms);
  if (bedrooms !== null && bedrooms < 0) reject('listing details: bedrooms must be >= 0');
  const bathrooms = num(raw.bathrooms);
  if (bathrooms !== null && bathrooms < 0) reject('listing details: bathrooms must be >= 0');
  const floor = num(raw.floor);
  if (floor !== null && (floor < -5 || floor > 200)) reject('listing details: floor out of range');

  return {
    property_type: propertyType,
    transaction_type: transactionType,
    district: String(raw.district ?? ''),
    area_m2: areaM2,
    bedrooms,
    bathrooms,
    floor,
    furnished: raw.furnished === true || raw.furnished === false ? raw.furnished : null,
    condition_state: conditionState,
  };
}

export function assertPublishable(
  category: string,
  price: number | null | undefined,
  city: string | null | undefined,
  payload: Record<string, unknown>,
): void {
  if (price == null) reject('cannot publish incomplete listing: sell_price is required');
  if (String(city ?? '').trim() === '') reject('cannot publish incomplete listing: city is required');
  if (category === 'car') {
    if (payload.year == null) reject('cannot publish incomplete listing: car year is required');
    if (payload.mileage_km == null) reject('cannot publish incomplete listing: car mileageKm is required');
    if (payload.fuel == null) reject('cannot publish incomplete listing: car fuel is required');
    if (payload.transmission == null) reject('cannot publish incomplete listing: car transmission is required');
  } else if (category === 'property') {
    if (payload.area_m2 == null) reject('cannot publish incomplete listing: property areaM2 is required');
    if (payload.bedrooms == null && payload.property_type !== 'land') {
      reject('cannot publish incomplete listing: property bedrooms is required');
    }
  }
}

/** Flat row shape of `v_public_listings` (migration 00037 projection). */
export interface FakePublicListingRow {
  id: string;
  category: string;
  brand: string;
  model: string;
  color: string | null;
  quantity: number;
  status: string;
  price: number | null;
  price_period: string;
  code: string | null;
  warranty: string | null;
  city: string | null;
  description: string | null;
  phone_variant: string;
  phone_ram: string | null;
  phone_storage: string;
  phone_condition: string;
  phone_battery_health: number | null;
  car_trim: string | null;
  car_year: number | null;
  car_mileage_km: number | null;
  car_fuel: string | null;
  car_transmission: string | null;
  car_body_type: string | null;
  car_engine_cc: number | null;
  car_condition_state: string | null;
  property_type: string | null;
  transaction_type: string | null;
  property_district: string | null;
  property_area_m2: number | null;
  property_bedrooms: number | null;
  property_bathrooms: number | null;
  property_floor: number | null;
  property_furnished: boolean | null;
  property_condition_state: string | null;
  images: string[];
  created_at: string;
  updated_at: string;
}

/** listing_my_listings row = same projection + the real is_published bit. */
export type FakeAdminListingRow = FakePublicListingRow & { is_published: boolean };

/**
 * Shared flattening of a stored row into the PUBLIC projection. Byte-faithful
 * to v_public_listings (00037): NO is_published / model_id / buy_price /
 * totals / source_label — those exist only on the base row or the admin
 * surface (myListings adds the flag back explicitly).
 */
function projectListingRow(r: FakeInventoryRow, imagePaths: string[]): FakePublicListingRow {
  const cd = (r.car_details ?? {}) as Record<string, unknown>;
  const pd = (r.property_details ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    category: r.category ?? 'phone',
    brand: r.brand,
    model: r.model,
    color: r.color,
    quantity: r.quantity,
    status: r.status,
    price: r.sell_price,
    price_period: r.price_period ?? 'sale',
    code: r.code,
    warranty: r.warranty,
    city: r.city,
    description: r.description,
    phone_variant: r.variant,
    phone_ram: r.ram,
    phone_storage: r.storage,
    phone_condition: r.condition,
    phone_battery_health: r.battery_health,
    car_trim: (cd.trim as string) ?? null,
    car_year: (cd.year as number) ?? null,
    car_mileage_km: (cd.mileage_km as number) ?? null,
    car_fuel: (cd.fuel as string) ?? null,
    car_transmission: (cd.transmission as string) ?? null,
    car_body_type: (cd.body_type as string) ?? null,
    car_engine_cc: (cd.engine_cc as number) ?? null,
    car_condition_state: (cd.condition_state as string) ?? null,
    property_type: (pd.property_type as string) ?? null,
    transaction_type: (pd.transaction_type as string) ?? null,
    property_district: (pd.district as string) ?? null,
    property_area_m2: (pd.area_m2 as number) ?? null,
    property_bedrooms: (pd.bedrooms as number) ?? null,
    property_bathrooms: (pd.bathrooms as number) ?? null,
    property_floor: (pd.floor as number) ?? null,
    property_furnished: (pd.furnished as boolean) ?? null,
    property_condition_state: (pd.condition_state as string) ?? null,
    images: imagePaths,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

class FakeCentralDb {
  rows: FakeInventoryRow[] = [];
  movements: FakeMovementRow[] = [];
  images: FakeImageRow[] = [];

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
      // Phone-only scope (mirrors migration 00040): car/property rows live in
      // the same table but are excluded from the legacy phone view.
      .filter((r) => (r.category ?? 'phone') === 'phone')
      .filter((r) => r.is_published && ACTIVE.includes(r.status) && r.quantity > 0)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  movementsList(): FakeMovementRow[] {
    return [...this.movements].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /**
   * Mirror of public.inventory_add_image (00019): bucket-relative path,
   * optional explicit position (defaults to append-last), admin-gated.
   */
  addImage(args: Record<string, unknown>): { path: string; position: number } {
    if (!this.adminMode) reject('admin role required');
    const inventoryId = String(args.p_inventory_id ?? '');
    const path = String(args.p_path ?? '').trim();
    if (!this.find(inventoryId)) reject(`inventory item not found: ${inventoryId}`);
    if (path === '') reject('image path is required');
    const position =
      typeof args.p_position === 'number' ? args.p_position : this.images.filter((im) => im.inventory_id === inventoryId).length + 1;
    const row: FakeImageRow = {
      id: uuid(),
      inventory_id: inventoryId,
      path,
      position,
      is_cover: position === 1,
      created_at: new Date().toISOString(),
    };
    this.images.push(row);
    return { path: row.path, position };
  }

  removeImage(imageId: string): boolean {
    if (!this.adminMode) reject('admin role required');
    const before = this.images.length;
    this.images = this.images.filter((im) => im.id !== imageId);
    return this.images.length < before;
  }

  /**
   * Aggregated public paths for one record — byte-faithful mirror of the
   * v_public_listings subquery: `ORDER BY im.position ASC NULLS LAST,
   * im.created_at ASC`.
   */
  imagePathsFor(recordId: string): string[] {
    return this.images
      .filter((im) => im.inventory_id === recordId)
      .sort((a, b) => {
        const pa = a.position ?? Number.MAX_SAFE_INTEGER;
        const pb = b.position ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return a.created_at.localeCompare(b.created_at);
      })
      .map((im) => im.path);
  }

  /** Mirrors the inventory_images RLS policy: only rows of VISIBLE items. */
  visibleImageRows(): Array<{ id: string; inventory_id: string; path: string; position: number | null }> {
    const visible = new Set(this.rows.filter((r) => r.is_published && ACTIVE.includes(r.status) && r.quantity > 0).map((r) => r.id));
    return this.images
      .filter((im) => visible.has(im.inventory_id))
      .map(({ id, inventory_id, path, position }) => ({ id, inventory_id, path, position }));
  }

  /** Mirrors the SECURITY DEFINER admin gate of every listing_* mutation. */
  adminMode = true;

  listingCreate(args: Record<string, unknown>): string {
    if (!this.adminMode) reject('admin role required');
    const category = String(args.p_category ?? '');
    if (category === 'phone') reject('phones must use the legacy inventory_add_item flow');
    if (!['car', 'property'].includes(category)) reject(`unknown category "${category}": use car|property`);

    const brand = String(args.p_brand ?? '').trim();
    const model = String(args.p_model ?? '').trim();
    // Brand is the car Make (required); property keeps an optional developer.
    if (category === 'car') {
      if (brand === '' || model === '') reject('car make and model are required');
    } else if (model === '') {
      reject('property listing title is required');
    }

    const period = String(args.p_price_period ?? 'sale');
    if (!['sale', 'monthly'].includes(period)) reject(`invalid price_period "${period}" (sale|monthly)`);
    const quantity = Number(args.p_quantity ?? 1);
    if (quantity !== 1) reject('quantity must be exactly 1 for car/property listings');
    const price = args.p_price != null ? Number(args.p_price) : null;

    const rawDetails = args.p_details;
    if (rawDetails == null || typeof rawDetails !== 'object' || Array.isArray(rawDetails)) {
      reject('p_details jsonb object is required');
    }
    let payload: Record<string, unknown>;
    if (category === 'car') {
      if (period !== 'sale') reject('car listings pair with price_period=sale');
      payload = normalizeCarPayload(rawDetails as Record<string, unknown>);
    } else {
      payload = normalizePropertyPayload(rawDetails as Record<string, unknown>);
      if (payload.transaction_type === 'rent' && period !== 'monthly') {
        reject('rental property pairs with price_period=monthly');
      }
      if (payload.transaction_type === 'sale' && period !== 'sale') {
        reject('for-sale property pairs with price_period=sale');
      }
    }

    const isPublished = Boolean(args.p_is_published);
    const city = String(args.p_city ?? '').trim();
    if (isPublished) assertPublishable(category, price, city, payload);

    const row: FakeInventoryRow = {
      id: uuid(),
      model_id: [brand, model].filter(Boolean).join(' '),
      brand,
      model,
      variant: '',
      ram: null,
      storage: '',
      condition: FAKE_LISTING_CONDITION_PROJECTION[String(payload.condition_state)] ?? 'New',
      color: args.p_color != null && String(args.p_color) !== '' ? String(args.p_color) : null,
      quantity,
      status: deriveStatus(quantity),
      buy_price: null,
      sell_price: price,
      created_at: nowIso(),
      updated_at: nowIso(),
      total_purchased: quantity,
      total_sold: 0,
      code: args.p_code != null && String(args.p_code).trim() !== '' ? String(args.p_code).trim() : null,
      battery_health: null,
      warranty: args.p_warranty != null && String(args.p_warranty).trim() !== '' ? String(args.p_warranty).trim() : null,
      city: city !== '' ? city : null,
      description: args.p_description != null ? String(args.p_description) : null,
      is_published: isPublished,
      source_label: null,
      category,
      price_period: period,
      car_details: category === 'car' ? payload : null,
      property_details: category === 'property' ? payload : null,
    };
    this.rows.push(row);
    this.movement(row, 'created', quantity);
    return row.id;
  }

  private findListing(id: unknown, caller = 'listing_update_core'): FakeInventoryRow {
    if (!this.adminMode) reject('admin role required');
    const key = String(id ?? '');
    const row = this.find(key);
    if (!row) reject(`listing ${key} not found`);
    if (!['car', 'property'].includes(row.category ?? '')) {
      reject(`${caller} targets car/property listings only`);
    }
    return row;
  }

  listingUpdateCore(args: Record<string, unknown>): null {
    const row = this.findListing(args.p_listing_id);
    const newBrand = args.p_brand != null && String(args.p_brand).trim() !== '' ? String(args.p_brand).trim() : row.brand;
    const newModel = args.p_model != null && String(args.p_model).trim() !== '' ? String(args.p_model).trim() : row.model;
    const newPrice = args.p_price != null ? Number(args.p_price) : row.sell_price;
    const newPeriod = args.p_price_period != null ? String(args.p_price_period) : row.price_period ?? 'sale';
    const newCity = args.p_city != null ? String(args.p_city).trim() : row.city ?? '';

    // Brand is mandatory only for cars; property keeps its optional developer.
    if (row.category === 'car') {
      if (newBrand === '' || newModel === '') reject('car make and model are required');
    } else if (newModel === '') {
      reject('property listing title is required');
    }
    if (newPeriod !== 'sale' && newPeriod !== 'monthly') reject('invalid price_period');
    const payload = (row.category === 'car'
      ? row.car_details
      : row.property_details) as Record<string, unknown> ?? {};
    if (row.category === 'car' && newPeriod !== 'sale') reject('car listings pair with price_period=sale');
    if (row.category === 'property') {
      if (payload.transaction_type === 'rent' && newPeriod !== 'monthly') reject('rental property pairs with price_period=monthly');
      if (payload.transaction_type === 'sale' && newPeriod !== 'sale') reject('for-sale property pairs with price_period=sale');
    }
    // Validate BEFORE mutating (mirrors single-statement atomicity in Postgres).
    if (row.is_published) assertPublishable(row.category ?? 'car', newPrice, newCity, payload);

    row.model_id = [newBrand, newModel].filter(Boolean).join(' ');
    row.brand = newBrand;
    row.model = newModel;
    row.sell_price = newPrice;
    row.price_period = newPeriod;
    if (args.p_color != null) row.color = String(args.p_color);
    row.city = newCity !== '' ? newCity : null;
    if (args.p_description != null) row.description = String(args.p_description);
    if (args.p_code != null && String(args.p_code).trim() !== '') row.code = String(args.p_code).trim();
    if (args.p_warranty != null && String(args.p_warranty).trim() !== '') row.warranty = String(args.p_warranty);
    row.updated_at = nowIso();

    this.movement(row, 'details_updated', null, { before: undefined });
    return null;
  }

  listingUpdateDetails(args: Record<string, unknown>): null {
    const row = this.findListing(args.p_listing_id);
    const raw = args.p_details;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      reject('p_details jsonb object is required');
    }
    const patch = raw as Record<string, unknown>;
    if (row.category === 'car') {
      const merged = normalizeCarPayload({ ...(row.car_details ?? {}), ...patch });
      // Validate BEFORE mutating (mirrors single-statement atomicity).
      if (row.is_published) assertPublishable('car', row.sell_price, row.city, merged);
      row.car_details = merged;
    } else {
      const merged = normalizePropertyPayload({ ...(row.property_details ?? {}), ...patch });
      if (row.is_published) assertPublishable('property', row.sell_price, row.city, merged);
      row.property_details = merged;
    }
    row.updated_at = nowIso();
    return null;
  }

  /** Flat projection of v_public_listings (published + active + qty > 0). */
  publicListingsView(): FakePublicListingRow[] {
    return this.rows
      .filter((r) => r.is_published && ACTIVE.includes(r.status) && r.quantity > 0)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((r) => projectListingRow(r, this.imagePathsFor(r.id)));
  }

  /**
   * Mirror of listing_my_listings (migration 00039): ALL non-deleted
   * listings of one category INCLUDING drafts/unpublished, each flagged
   * with its real is_published bit. Admin-gated like every listing mutation.
   */
  myListings(args: Record<string, unknown>): { total: number; items: FakeAdminListingRow[] } {
    if (!this.adminMode) reject('admin role required');
    const category = String(args.p_category ?? '');
    if (category === 'phone') reject('phones are managed through inventory_management_list');
    if (!['car', 'property'].includes(category)) {
      reject(`unknown category "${category}": use car|property`);
    }
    const items = this.rows
      .filter((r) => (r.category ?? 'phone') === category && r.status !== 'deleted')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((r) => ({ ...projectListingRow(r, this.imagePathsFor(r.id)), is_published: r.is_published }));
    return { total: items.length, items };
  }

  /**
   * Mirror of listing_delete (00039): SOFT delete only — status := 'deleted',
   * the row physically remains. Idempotent by UPDATE semantics.
   */
  listingDelete(args: Record<string, unknown>): null {
    const row = this.findListing(args.p_listing_id, 'listing_delete');
    row.status = 'deleted';
    row.updated_at = nowIso();
    this.movement(row, 'details_updated', null, { before: undefined });
    return null;
  }

  listingSearch(args: Record<string, unknown>): { total: number; items: FakePublicListingRow[] } {
    const category = String(args.p_category ?? '');
    if (!['phone', 'car', 'property'].includes(category)) {
      reject(`unknown category "${category}" (phone|car|property)`);
    }
    const sort = String(args.p_sort ?? 'latest');
    if (!['latest', 'cheapest', 'expensive'].includes(sort)) {
      reject(`invalid sort "${sort}": use latest|cheapest|expensive`);
    }
    const filters = (args.p_filters ?? {}) as Record<string, unknown>;

    if (category === 'car') {
      for (const k of Object.keys(filters)) {
        if (!['fuel', 'transmission', 'bodyType', 'yearMin', 'yearMax', 'mileageKmMax'].includes(k)) {
          reject(`unknown car filter "${k}"`);
        }
      }
      if (filters.fuel != null && !(CAR_FUEL_VALUES as readonly string[]).includes(String(filters.fuel))) {
        reject(`invalid fuel filter "${String(filters.fuel)}"`);
      }
      if (filters.transmission != null && !(CAR_TRANSMISSION_VALUES as readonly string[]).includes(String(filters.transmission))) {
        reject(`invalid transmission filter "${String(filters.transmission)}"`);
      }
      if (filters.bodyType != null && !(CAR_BODY_TYPE_VALUES as readonly string[]).includes(String(filters.bodyType))) {
        reject(`invalid bodyType filter "${String(filters.bodyType)}"`);
      }
    } else if (category === 'property') {
      for (const k of Object.keys(filters)) {
        if (!['propertyType', 'transactionType', 'bedroomsMin', 'bathroomsMin', 'areaM2Min', 'areaM2Max', 'furnished'].includes(k)) {
          reject(`unknown property filter "${k}"`);
        }
      }
      if (filters.propertyType != null && !(PROPERTY_TYPE_VALUES as readonly string[]).includes(String(filters.propertyType))) {
        reject(`invalid propertyType filter "${String(filters.propertyType)}"`);
      }
      if (filters.transactionType != null && !(PROPERTY_TRANSACTION_TYPES as readonly string[]).includes(String(filters.transactionType))) {
        reject(`invalid transactionType filter "${String(filters.transactionType)}"`);
      }
    } else if (Object.keys(filters).length > 0) {
      reject('phone search takes no filters');
    }

    const query = String(args.p_query ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(args.p_limit ?? 24) || 24, 1), 100);
    const offset = Math.max(Number(args.p_offset ?? 0) || 0, 0);

    const matchQuery = (r: FakePublicListingRow): boolean => {
      if (query === '') return true;
      const haystack = [
        r.brand, r.model, r.city ?? '', r.code ?? '',
        r.car_trim ?? '', r.property_district ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    };
    const matchFilters = (r: FakePublicListingRow): boolean => {
      if (filters.fuel != null && r.car_fuel !== filters.fuel) return false;
      if (filters.transmission != null && r.car_transmission !== filters.transmission) return false;
      if (filters.bodyType != null && r.car_body_type !== filters.bodyType) return false;
      if (filters.yearMin != null && (r.car_year ?? NaN) < Number(filters.yearMin)) return false;
      if (filters.yearMax != null && (r.car_year ?? NaN) > Number(filters.yearMax)) return false;
      if (filters.mileageKmMax != null && (r.car_mileage_km ?? Infinity) > Number(filters.mileageKmMax)) return false;
      if (filters.propertyType != null && r.property_type !== filters.propertyType) return false;
      if (filters.transactionType != null && r.transaction_type !== filters.transactionType) return false;
      if (filters.bedroomsMin != null && (r.property_bedrooms ?? NaN) < Number(filters.bedroomsMin)) return false;
      if (filters.bathroomsMin != null && (r.property_bathrooms ?? NaN) < Number(filters.bathroomsMin)) return false;
      if (filters.areaM2Min != null && (r.property_area_m2 ?? NaN) < Number(filters.areaM2Min)) return false;
      if (filters.areaM2Max != null && (r.property_area_m2 ?? Infinity) > Number(filters.areaM2Max)) return false;
      if (filters.furnished != null && r.property_furnished !== filters.furnished) return false;
      return true;
    };

    const base = this.publicListingsView()
      .filter((r) => r.category === category)
      .filter(matchQuery)
      .filter(matchFilters);

    const sorted = [...base];
    if (sort === 'cheapest') {
      sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sort === 'expensive') {
      sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } // latest keeps updated_at desc order from the view

    return { total: base.length, items: sorted.slice(offset, offset + limit) };
  }
}

/** Simulate an unauthenticated / non-admin caller for security tests. */
export function setFakeCentralAdminMode(admin: boolean): void {
  getFakeCentralDb().adminMode = admin;
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

/** Adds the P8.3 fixtures: exactly one published car + one rented property. */
export function seedFakeListings(): { carId: string; propertyId: string } {
  const db = getFakeCentralDb();
  const carId = db.listingCreate({
    p_category: 'car',
    p_brand: FAKE_CAR_LISTING_SEED.brand,
    p_model: FAKE_CAR_LISTING_SEED.model,
    p_price: FAKE_CAR_LISTING_SEED.price,
    p_price_period: FAKE_CAR_LISTING_SEED.period,
    p_color: FAKE_CAR_LISTING_SEED.color ?? '',
    p_city: FAKE_CAR_LISTING_SEED.city,
    p_description: FAKE_CAR_LISTING_SEED.description ?? null,
    p_quantity: 1,
    p_is_published: true,
    p_details: FAKE_CAR_LISTING_SEED.car ?? {},
  });
  const propertyId = db.listingCreate({
    p_category: 'property',
    p_brand: FAKE_PROPERTY_LISTING_SEED.brand,
    p_model: FAKE_PROPERTY_LISTING_SEED.model,
    p_price: FAKE_PROPERTY_LISTING_SEED.price,
    p_price_period: FAKE_PROPERTY_LISTING_SEED.period,
    p_city: FAKE_PROPERTY_LISTING_SEED.city,
    p_description: FAKE_PROPERTY_LISTING_SEED.description ?? null,
    p_quantity: 1,
    p_is_published: true,
    p_details: FAKE_PROPERTY_LISTING_SEED.propertyDetails ?? {},
  });
  // P8.6/D4: seed real image rows so the public projection matches the live
  // SQL aggregation (cover first, then by position).
  db.addImage({ p_inventory_id: carId, p_path: `${carId}/seed-exterior.jpg`, p_position: 1 });
  db.addImage({ p_inventory_id: carId, p_path: `${carId}/seed-interior.jpg`, p_position: 2 });
  db.addImage({ p_inventory_id: propertyId, p_path: `${propertyId}/seed-front.jpg`, p_position: 1 });
  return { carId, propertyId };
}

/** Test seam: inject an arbitrary (possibly malformed) image path. */
export function fakeAddImage(inventoryId: string, path: string, position?: number): { path: string; position: number } {
  return getFakeCentralDb().addImage({ p_inventory_id: inventoryId, p_path: path, p_position: position });
}

function queryResult(
  db: FakeCentralDb,
  table: string,
  eq?: { col: string; value: unknown },
): { data: unknown[]; error: { message: string } | null } {
  if (table === 'v_public_inventory') return { data: db.publicList(), error: null };
  if (table === 'v_public_listings') {
    let rows: FakePublicListingRow[] = db.publicListingsView();
    if (eq && eq.col === 'id') rows = rows.filter((r) => r.id === eq.value);
    return { data: rows, error: null };
  }
  if (table === 'inventory_movements') return { data: db.movementsList(), error: null };
  if (table === 'inventory_images') {
    let rows = db.visibleImageRows();
    if (eq && eq.col === 'inventory_id') rows = rows.filter((r) => r.inventory_id === eq.value);
    return { data: rows, error: null };
  }
  return { data: [], error: null };
}

function rpcResult(db: FakeCentralDb, fn: string, args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  const listingMutation = (run: () => unknown): { data: unknown; error: { message: string } | null } => {
    try {
      return { data: run(), error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  };
  switch (fn) {
    case 'listing_create':
      return listingMutation(() => db.listingCreate(args));
    case 'listing_update_core':
      return listingMutation(() => db.listingUpdateCore(args));
    case 'listing_update_details':
      return listingMutation(() => db.listingUpdateDetails(args));
    case 'listing_search':
      return listingMutation(() => db.listingSearch(args));
    case 'listing_my_listings':
      return listingMutation(() => db.myListings(args));
    case 'listing_delete':
      return listingMutation(() => db.listingDelete(args));
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
      return { data: db.addImage(args), error: null };
    case 'inventory_remove_image':
      return { data: { removed: db.removeImage(String(args.p_image_id ?? '')) }, error: null };
    default:
      return { data: null, error: null };
  }
}

export function getFakeSupabaseClient(): {
  from: (table: string) => {
    select: () => {
      eq: (col: string, value: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>; order: () => Promise<{ data: unknown[]; error: { message: string } | null }> };
      order: () => Promise<{ data: unknown[]; error: { message: string } | null }>;
    };
    order: () => Promise<{ data: unknown[]; error: { message: string } | null }>;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      upload: () => Promise<{ error: null; data: { path: string } }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
} {
  const db = getFakeCentralDb();
  return {
    from: (table: string) => {
      const runEq = (col: string, value: unknown) => {
        const eq = { col, value };
        return {
          maybeSingle: async () => {
            const res = queryResult(db, table, eq);
            return { data: (res.data[0] as unknown) ?? null, error: null };
          },
          order: () => Promise.resolve(queryResult(db, table, eq)),
        };
      };
      const chain = {
        select: () => ({
          eq: runEq,
          order: () => Promise.resolve(queryResult(db, table)),
        }),
        eq: (col: string, value: unknown) => runEq(col, value),
        order: () => Promise.resolve(queryResult(db, table)),
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown> = {}) => Promise.resolve(rpcResult(db, fn, args)),
    storage: {
      from: (bucket: string) => ({
        upload: async () => ({ error: null, data: { path: 'inventory-images/fake.jpg' } }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://fake-storage.test/${bucket}/${path}` },
        }),
      }),
    },
  };
}

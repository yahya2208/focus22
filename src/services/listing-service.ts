/**
 * Listing Service — CATEGORY-NEUTRAL LISTING API (P8.3)
 *
 * The single runtime surface for the NEW listing categories (car | property)
 * and the neutral read model shared with phones:
 *
 *   Admin writes  → listing_create / listing_update_core /
 *                   listing_update_details   (SECURITY DEFINER RPCs, 00038;
 *                   the SAME inventory_is_admin() gate as every legacy
 *                   inventory_* RPC — never raw table writes)
 *   Public reads  → v_public_listings / listing_search        (view + RPC,
 *                   both gated by the exact v_public_inventory predicate:
 *                   is_published AND quantity>0 AND status active)
 *
 * Category boundary (mirrors migration 00038):
 *   - Phones keep ONE write path: inventory_add_item / inventory_update_details.
 *     This service NEVER writes phone rows; `listingFromInventoryRecord` is a
 *     pure adapter mapping phones INTO the neutral shape (never the reverse).
 *   - Car/property quantity is pinned to 1 server-side; identity = id
 *     (variant stays '' — the phone SKU index never sees these rows).
 *   - price.amount/period here map to sell_price/price_period in storage.
 *     Money is never duplicated; rent pairs with 'monthly', everything else
 *     with 'sale' (enforced again server-side).
 *
 * NOTE: migrations 00037/00038 are FILE-ONLY for now (not applied to
 * Supabase). Until they are applied, calling these functions against the live
 * project will fail with "function ... is not defined" — that is expected and
 * is why every consumer ships behind its own phase gate (P8.4+).
 */

import { getSupabaseClient } from '../core/supabase/client';
import type { InventoryRecord } from './inventory-service';
import type {
  CarDetails,
  ListingCategory,
  ListingConditionGroup,
  ListingPrice,
  ListingPricePeriod,
  ListingRecord,
  ListingStatus,
  PropertyDetails,
} from '../domains/listings';

// ── Raw shapes ──────────────────────────────────────────────────────────────

/** Flat row of `v_public_listings` (migration 00037 projection). */
export interface PublicListingRow {
  id: string;
  category: ListingCategory;
  brand: string;
  model: string;
  color: string | null;
  quantity: number;
  status: string;
  /** Present only on listing_my_listings rows (00039); absent on the view. */
  is_published?: boolean;
  price: number | null;
  price_period: string;
  code: string | null;
  warranty: string | null;
  city: string | null;
  description: string | null;
  phone_variant: string | null;
  phone_ram: string | null;
  phone_storage: string | null;
  phone_condition: string | null;
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

// ── Input contracts ─────────────────────────────────────────────────────────

interface ListingCreateCommon {
  brand: string;
  model: string;
  price: ListingPrice;
  color?: string;
  city?: string;
  description?: string;
  code?: string;
  warranty?: string;
  /** Publish immediately; defaults to FALSE (explicit publishing). */
  publish?: boolean;
}

export interface CreateCarListingInput extends ListingCreateCommon {
  category: 'car';
  car: CarDetails;
}

export interface CreatePropertyListingInput extends ListingCreateCommon {
  category: 'property';
  propertyDetails: PropertyDetails;
}

export type CreateListingInput = CreateCarListingInput | CreatePropertyListingInput;

/** Tri-state core patch: omitted fields are kept unchanged (server-side NULL). */
export interface UpdateListingCorePatch {
  brand?: string;
  model?: string;
  /** Maps to sell_price; null clears the stored amount. */
  priceAmount?: number | null;
  pricePeriod?: ListingPricePeriod;
  color?: string;
  city?: string;
  description?: string;
  code?: string;
  warranty?: string;
}

export type ListingSearchSort = 'latest' | 'cheapest' | 'expensive';

export interface ListingSearchParams {
  category: ListingCategory;
  query?: string;
  /** Raw filter keys mirror LISTING_FILTER_SCHEMAS; validated server-side. */
  filters?: Record<string, unknown>;
  sort?: ListingSearchSort;
  limit?: number;
  offset?: number;
}

export interface ListingSearchPage {
  total: number;
  items: ListingRecord[];
}

// ── Mapping helpers ─────────────────────────────────────────────────────────

function conditionGroupFor(
  category: ListingCategory,
  row: Pick<PublicListingRow, 'phone_condition' | 'car_condition_state' | 'property_condition_state'>,
): ListingConditionGroup | null {
  if (category === 'phone') return row.phone_condition?.toLowerCase() === 'new' ? 'new' : 'used';
  const state =
    category === 'car'
      ? row.car_condition_state ?? ''
      : row.property_condition_state ?? '';
  return state === 'new' ? 'new' : state === '' ? null : 'used';
}

/**
 * View row → neutral ListingRecord. Phone-specific specs (variant/ram/
 * storage/battery) intentionally have no field on the neutral type; phone
 * consumers keep reading InventoryRecord/v_public_inventory directly.
 *
 * P8.6/D5: STRICT mapping — a car row without its details projection or a
 * property row missing type/transaction is CORRUPTION, never a default.
 * Malformed rows are rejected loudly instead of being silently repaired.
 */
function requireDetail(
  category: 'car' | 'property',
  id: string,
  field: string,
  value: string | null | undefined,
): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`[listings] ${category} ${id}: missing ${field} projection (corrupt public row)`);
  }
  return value;
}

export function mapPublicListingRow(row: PublicListingRow): ListingRecord {
  const category = row.category;
  const status = row.status as ListingStatus;

  const base: ListingRecord = {
    id: row.id,
    category,
    brand: row.brand ?? '',
    model: row.model ?? '',
    description: row.description ?? '',
    color: row.color ?? '',
    city: row.city ?? '',
    warranty: row.warranty ?? '',
    code: row.code ?? '',
    price: { amount: row.price, period: row.price_period === 'monthly' ? 'monthly' : 'sale' },
    conditionGroup: conditionGroupFor(category, row),
    quantity: row.quantity,
    status,
    isPublished: true, // view only exposes published rows
    images: Array.isArray(row.images) ? row.images : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (category === 'car') {
    base.car = {
      trim: row.car_trim ?? '',
      year: row.car_year ?? null,
      mileageKm: row.car_mileage_km ?? null,
      fuel: (row.car_fuel ?? null) as CarDetails['fuel'],
      transmission: (row.car_transmission ?? null) as CarDetails['transmission'],
      bodyType: (row.car_body_type ?? null) as CarDetails['bodyType'],
      engineCc: row.car_engine_cc ?? null,
      conditionState: requireDetail('car', row.id, 'car_condition_state', row.car_condition_state) as CarDetails['conditionState'],
    };
  } else if (category === 'property') {
    base.propertyDetails = {
      propertyType: requireDetail('property', row.id, 'property_type', row.property_type) as PropertyDetails['propertyType'],
      transactionType: requireDetail('property', row.id, 'transaction_type', row.transaction_type) as PropertyDetails['transactionType'],
      district: row.property_district ?? '',
      areaM2: row.property_area_m2 ?? null,
      bedrooms: row.property_bedrooms ?? null,
      bathrooms: row.property_bathrooms ?? null,
      floor: row.property_floor ?? null,
      furnished: row.property_furnished ?? null,
      conditionState: requireDetail(
        'property',
        row.id,
        'property_condition_state',
        row.property_condition_state,
      ) as PropertyDetails['conditionState'],
    };
  }
  return base;
}

/**
 * Pure adapter: phone InventoryRecord INTO the neutral ListingRecord.
 * One direction only — the legacy phone flow is never rebuilt from this.
 *
 * P8.7/D1: additionally carries the identity facts (variant/ram/storage/
 * batteryHealth/modelId/conditionRaw) on `phone` so generic consumers can
 * render a phone WITHOUT touching inventory fields. Purely additive —
 * every pre-existing field keeps its exact value (parity-pinned by tests).
 */
export function listingFromInventoryRecord(record: InventoryRecord): ListingRecord {
  return {
    id: record.id,
    category: 'phone',
    brand: record.brand,
    model: record.model,
    description: record.description ?? '',
    color: record.color ?? '',
    city: record.city ?? '',
    warranty: record.warranty ?? '',
    code: record.code ?? '',
    price: { amount: record.sellPrice ?? null, period: 'sale' },
    conditionGroup: record.condition.toLowerCase() === 'new' ? 'new' : 'used',
    quantity: record.quantity,
    status: (record.status ?? 'in_stock') as ListingStatus,
    // Publishing lives DB-side for phones; mapped-in records represent
    // sellable stock, so they present as published.
    isPublished: true,
    images: record.images ?? [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    phone: {
      variant: record.variant,
      ram: record.ram,
      storage: record.storage,
      batteryHealth: record.batteryHealth ?? null,
      modelId: record.modelId,
      conditionRaw: record.condition,
    },
  };
}

// ── Error plumbing ──────────────────────────────────────────────────────────

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ── API ─────────────────────────────────────────────────────────────────────

/**
 * Creates a car or property listing (core row + child details) atomically via
 * one SECURITY DEFINER call. Rejects category='phone' by design — phones use
 * the legacy inventory flow.
 */
export async function createListing(input: CreateListingInput): Promise<string> {
  const details =
    input.category === 'car'
      ? { ...input.car }
      : { ...(input.propertyDetails as unknown as Record<string, unknown>) };

  return callRpc<string>('listing_create', {
    p_category: input.category,
    p_brand: input.brand,
    p_model: input.model,
    p_price: input.price.amount,
    p_price_period: input.price.period,
    p_color: input.color ?? '',
    p_city: input.city ?? '',
    p_description: input.description ?? null,
    p_code: input.code ?? null,
    p_warranty: input.warranty ?? null,
    p_quantity: 1, // car/property listings are exactly one unit (server pins too)
    p_is_published: input.publish ?? false,
    p_details: details,
  });
}

/** Core-field edits (brand/model/price/city/…) for car|property listings. */
export async function updateListingCore(id: string, patch: UpdateListingCorePatch): Promise<void> {
  await callRpc<null>('listing_update_core', {
    p_listing_id: id,
    p_brand: patch.brand ?? null,
    p_model: patch.model ?? null,
    p_price: patch.priceAmount !== undefined ? patch.priceAmount : null,
    p_price_period: patch.pricePeriod ?? null,
    p_color: patch.color ?? null,
    p_city: patch.city ?? null,
    p_description: patch.description ?? null,
    p_code: patch.code ?? null,
    p_warranty: patch.warranty ?? null,
  });
}

/**
 * Merge-updates the child details row (car_details / property_details).
 * Partial patches are the point: omitted keys keep their stored values,
 * unknown keys are rejected upstream. The category is inferred from the
 * payload shape ('propertyType' ⇒ property, else car).
 */
export async function updateListingDetails(
  id: string,
  details: Partial<CarDetails> | Partial<PropertyDetails>,
): Promise<void> {
  const payload = { ...(details as unknown as Record<string, unknown>) };
  await callRpc<null>('listing_update_details', {
    p_listing_id: id,
    p_details: payload,
  });
}

/**
 * Publishes/hides via the EXISTING generic inventory_set_published RPC —
 * no duplicate function was added for this (id-keyed, category-agnostic).
 */
export async function setListingPublished(id: string, published: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc('inventory_set_published', {
    p_inventory_id: id,
    p_is_published: published,
  });
  if (error) throw new Error(`setListingPublished: ${error.message}`);
}

/** Customer/admin search over published listings of ONE category. */
export async function searchListings(params: ListingSearchParams): Promise<ListingSearchPage> {
  const result = await callRpc<{ total: number; items: PublicListingRow[] }>('listing_search', {
    p_category: params.category,
    p_query: params.query ?? '',
    p_filters: params.filters ?? {},
    p_sort: params.sort ?? 'latest',
    p_limit: params.limit ?? 24,
    p_offset: params.offset ?? 0,
  });
  return {
    total: Number(result?.total ?? 0),
    items: (result?.items ?? []).map((row) => mapPublicListingRow(row as PublicListingRow)),
  };
}

/** Single public listing by id (null when missing/unpublished/inactive). */
export async function getPublicListing(id: string): Promise<ListingRecord | null> {
  const { data, error } = await getSupabaseClient()
    .from('v_public_listings')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getPublicListing: ${error.message}`);
  if (!data) return null;
  return mapPublicListingRow(data as PublicListingRow);
}

/**
 * Bucket-relative inventory_images path (what v_public_listings.images
 * carries) → public URL. Same storage convention as centralListImages —
 * no new bucket, no architecture change (P8.5).
 */
export function listingImageUrl(path: string): string {
  if (!path) return '';
  return getSupabaseClient().storage.from('inventory-images').getPublicUrl(path).data.publicUrl ?? '';
}

// ── Admin surface (migration 00039) ─────────────────────────────────────────

/**
 * Admin read of ALL non-deleted listings of one NEW category — including
 * drafts/unpublished rows the public view can never expose. Phones are
 * rejected server-side on purpose: inventory_management_list stays their
 * single admin read path.
 */
export async function fetchMyListings(category: 'car' | 'property'): Promise<ListingRecord[]> {
  const result = await callRpc<{ total: number; items: PublicListingRow[] }>('listing_my_listings', {
    p_category: category,
  });
  return (result?.items ?? []).map((row) => {
    // No silent category fallback: a malformed row is a data bug, not a
    // row to reinterpret (house rule — errors must stay visible).
    if (row.category !== 'car' && row.category !== 'property') {
      throw new Error(`listing_my_listings: unexpected category "${String(row.category)}"`);
    }
    return { ...mapPublicListingRow(row), isPublished: Boolean(row.is_published) };
  });
}

/**
 * SOFT delete via listing_delete (00039): status := 'deleted', the row
 * physically remains. Never a hard DELETE.
 */
export async function deleteListing(id: string): Promise<void> {
  await callRpc<null>('listing_delete', { p_listing_id: id });
}

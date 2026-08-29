/**
 * Listings domain — category-neutral contracts (P8.1).
 *
 * Concept hierarchy (approved architecture):
 *   Category ('phone' | 'car' | 'property')
 *     └─ Listing                ← this file's `ListingRecord`
 *          └─ CategoryDetails   ← `CarDetails` / `PropertyDetails`
 *
 * Physical storage stays `inventory_items` (+ future child tables) for
 * backward compatibility; these types are the neutral surface every NEW
 * consumer (search, showroom presenters, admin forms, WhatsApp factory)
 * builds against. Phones continue to flow through `InventoryRecord`
 * unchanged — adapters map them INTO this shape, never the reverse.
 */

// ── Category ────────────────────────────────────────────────────────────────

export type ListingCategory = 'phone' | 'car' | 'property';

// ── Price (neutral abstraction) ─────────────────────────────────────────────

/** Sale vs recurring pricing. Rent = 'monthly'. Default 'sale'. */
export type ListingPricePeriod = 'sale' | 'monthly';

export const DEFAULT_PRICE_PERIOD: ListingPricePeriod = 'sale';

/**
 * Category-neutral money concept. Physically backed by the existing
 * `inventory_items.sell_price` column (never duplicated); `period` is
 * carried by the new `price_period` core attribute. Phones implicitly
 * use period 'sale' and never read it.
 */
export interface ListingPrice {
  /** Amount in the listing currency; null when not yet priced. */
  amount: number | null;
  period: ListingPricePeriod;
}

// ── Lifecycle / status ──────────────────────────────────────────────────────

/**
 * Mirrors the inventory lifecycle already enforced server-side
 * (in_stock/low_stock/out_of_stock/archived/discontinued/deleted).
 */
export type ListingStatus =
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock'
  | 'archived'
  | 'discontinued'
  | 'deleted';

/**
 * Coarse customer-facing condition bucket used by shared showroom filters.
 * Derived per category at mapping time (phones: New→'new', else 'used';
 * cars/property: from their own condition_state vocabularies below).
 */
export type ListingConditionGroup = 'new' | 'used';

// ── Car details (V1 — free-text make/model, no reference catalog) ──────────

/**
 * Runtime vocabularies mirroring the SQL CHECK constraints of
 * car_details/property_details (migration 00036) — single source consumed by
 * the listing RPC fake substrate and the migration-coherence tests. Each
 * array is compile-time checked against the union below via `satisfies`.
 */
export const CAR_FUEL_VALUES = [
  'benzin',
  'diesel',
  'hybrid',
  'electric',
  'lpg',
] as const satisfies readonly CarFuel[];
export const CAR_TRANSMISSION_VALUES = ['manual', 'automatic'] as const satisfies readonly CarTransmission[];
export const CAR_BODY_TYPE_VALUES = [
  'sedan',
  'suv',
  'hatchback',
  'pickup',
  'coupe',
  'van',
] as const satisfies readonly CarBodyType[];
export const CAR_CONDITION_STATES = ['new', 'used', 'damaged'] as const satisfies readonly CarConditionState[];

export type CarFuel = 'benzin' | 'diesel' | 'hybrid' | 'electric' | 'lpg';
export type CarTransmission = 'manual' | 'automatic';
export type CarBodyType =
  | 'sedan'
  | 'suv'
  | 'hatchback'
  | 'pickup'
  | 'coupe'
  | 'van';
export type CarConditionState = 'new' | 'used' | 'damaged';

export interface CarDetails {
  trim: string;
  year: number | null;
  mileageKm: number | null;
  fuel: CarFuel | null;
  transmission: CarTransmission | null;
  bodyType: CarBodyType | null;
  engineCc: number | null;
  conditionState: CarConditionState;
}

// ── Property details (V1 — text location, no coordinates/PostGIS) ──────────

export type PropertyType =
  | 'apartment'
  | 'villa'
  | 'house'
  | 'land'
  | 'shop'
  | 'office';
export type PropertyTransactionType = 'sale' | 'rent';
export type PropertyConditionState = 'new' | 'good' | 'needs_renovation';

export const PROPERTY_TYPE_VALUES = [
  'apartment',
  'villa',
  'house',
  'land',
  'shop',
  'office',
] as const satisfies readonly PropertyType[];
export const PROPERTY_TRANSACTION_TYPES = ['sale', 'rent'] as const satisfies readonly PropertyTransactionType[];
export const PROPERTY_CONDITION_STATES = [
  'new',
  'good',
  'needs_renovation',
] as const satisfies readonly PropertyConditionState[];

export interface PropertyDetails {
  propertyType: PropertyType;
  transactionType: PropertyTransactionType;
  district: string;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  furnished: boolean | null;
  conditionState: PropertyConditionState;
}

// ── Phone details (P8.7/D1 — legacy inventory passthrough) ─────────────────

/**
 * Identity facts carried from the LEGACY phone inventory row into the
 * neutral record. Purely additive presentation payload — phones keep
 * flowing through InventoryRecord end-to-end; this exists so generic
 * domain consumers can render a phone without reaching back into
 * inventory-specific fields.
 *
 * CONTRACT NOTES:
 *   - `variant` is NOT a trim: it never fills subtitle slots (owner rule).
 *   - `conditionRaw` preserves the exact stored condition string
 *     ('New'/'Used'/…); `ListingRecord.conditionGroup` stays binary.
 *   - `modelId` is the real catalog id and the basis of similar-item
 *     identity (same semantics as useSimilarPhones).
 */
export interface PhoneDetails {
  variant: string;
  ram: string;
  storage: string;
  batteryHealth: number | null;
  modelId: string;
  conditionRaw: string;
}

// ── Listing record (the commercial unit) ────────────────────────────────────

export interface ListingRecord {
  id: string;
  category: ListingCategory;

  /**
   * Make / developer / agency free text. Phones: existing brand column.
   * Cars V1: Make. Property: optional developer ('' allowed).
   */
  brand: string;
  /** Model for phones/cars; listing title for property. */
  model: string;

  description: string;
  color: string;
  city: string;
  warranty: string;
  /** Short ad/WhatsApp code; fallback = short form of id (existing rule). */
  code: string;

  price: ListingPrice;
  conditionGroup: ListingConditionGroup | null;

  /** Stock semantics apply to phones; cars/property pin this to 1. */
  quantity: number;
  status: ListingStatus;
  isPublished: boolean;

  /** Presentational image URLs/data-URLs, ordered; first = cover. */
  images: string[];

  createdAt: string;
  updatedAt: string;

  /** Present iff category === 'car' (from car_details). */
  car?: CarDetails;
  /** Present iff category === 'property' (from property_details). */
  propertyDetails?: PropertyDetails;
  /** Present iff category === 'phone' (legacy inventory passthrough, P8.7/D1). */
  phone?: PhoneDetails;
}

// ── Type guards ─────────────────────────────────────────────────────────────

export function isPhoneListing(
  listing: ListingRecord,
): boolean {
  return listing.category === 'phone';
}

export function isCarListing(listing: ListingRecord): boolean {
  return listing.category === 'car' && !!listing.car;
}

export function isPropertyListing(listing: ListingRecord): boolean {
  return listing.category === 'property' && !!listing.propertyDetails;
}

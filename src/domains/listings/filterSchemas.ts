/**
 * Declarative per-category filter schemas (P8.1 contracts).
 *
 * Single source of truth consumed later by the showroom FilterBar (P8.7),
 * the search RPC payload validation (P8.5) and admin form generation
 * (P8.4). Values are raw domain values; ALL human labels are i18n keys so
 * the four translation files stay the only place nouns live.
 */

import type { ListingCategory } from './types';

// ── Field spec primitives ───────────────────────────────────────────────────

export type FilterFieldKind = 'select' | 'range' | 'boolean';

export interface SelectOptionSpec {
  /** Raw value stored/queried; label resolved via `labelKey`. */
  readonly value: string;
  readonly labelKey: string;
}

export interface FilterFieldSpec {
  /** Stable key; also the query-param / filter-state key. */
  readonly key: string;
  readonly kind: FilterFieldKind;
  readonly labelKey: string;
  /** Required for kind='select'; ignored otherwise. */
  readonly options?: readonly SelectOptionSpec[];
  /**
   * Range bounds keys — at least one required for kind='range'.
   * e.g. { minKey: 'yearMin', maxKey: 'yearMax' }.
   */
  readonly minKey?: string;
  readonly maxKey?: string;
}

export interface ListingFilterSchema {
  readonly category: ListingCategory;
  readonly fields: readonly FilterFieldSpec[];
}

// ── Schemas ─────────────────────────────────────────────────────────────────
// Phone V1: EMPTY on purpose — the existing showroom controls
// (query / condition new|used / city / sort) stay untouched (P8.1 rule:
// no phone behavior change). Extra phone filters may be added later
// without breaking this contract.

const CAR_FILTER_SCHEMA: ListingFilterSchema = {
  category: 'car',
  fields: [
    {
      key: 'fuel',
      kind: 'select',
      labelKey: 'listings.filters.fuel',
      options: [
        { value: 'benzin', labelKey: 'listings.filters.fuel.benzin' },
        { value: 'diesel', labelKey: 'listings.filters.fuel.diesel' },
        { value: 'hybrid', labelKey: 'listings.filters.fuel.hybrid' },
        { value: 'electric', labelKey: 'listings.filters.fuel.electric' },
        { value: 'lpg', labelKey: 'listings.filters.fuel.lpg' },
      ],
    },
    {
      key: 'transmission',
      kind: 'select',
      labelKey: 'listings.filters.transmission',
      options: [
        { value: 'manual', labelKey: 'listings.filters.transmission.manual' },
        { value: 'automatic', labelKey: 'listings.filters.transmission.automatic' },
      ],
    },
    {
      key: 'bodyType',
      kind: 'select',
      labelKey: 'listings.filters.bodyType',
      options: [
        { value: 'sedan', labelKey: 'listings.filters.bodyType.sedan' },
        { value: 'suv', labelKey: 'listings.filters.bodyType.suv' },
        { value: 'hatchback', labelKey: 'listings.filters.bodyType.hatchback' },
        { value: 'pickup', labelKey: 'listings.filters.bodyType.pickup' },
        { value: 'coupe', labelKey: 'listings.filters.bodyType.coupe' },
        { value: 'van', labelKey: 'listings.filters.bodyType.van' },
      ],
    },
    {
      key: 'year',
      kind: 'range',
      labelKey: 'listings.filters.year',
      minKey: 'yearMin',
      maxKey: 'yearMax',
    },
    {
      key: 'mileageKm',
      kind: 'range',
      labelKey: 'listings.filters.mileageKm',
      maxKey: 'mileageKmMax',
    },
  ],
};

const PROPERTY_FILTER_SCHEMA: ListingFilterSchema = {
  category: 'property',
  fields: [
    {
      key: 'propertyType',
      kind: 'select',
      labelKey: 'listings.filters.propertyType',
      options: [
        { value: 'apartment', labelKey: 'listings.filters.propertyType.apartment' },
        { value: 'villa', labelKey: 'listings.filters.propertyType.villa' },
        { value: 'house', labelKey: 'listings.filters.propertyType.house' },
        { value: 'land', labelKey: 'listings.filters.propertyType.land' },
        { value: 'shop', labelKey: 'listings.filters.propertyType.shop' },
        { value: 'office', labelKey: 'listings.filters.propertyType.office' },
      ],
    },
    {
      key: 'transactionType',
      kind: 'select',
      labelKey: 'listings.filters.transactionType',
      options: [
        { value: 'sale', labelKey: 'listings.filters.transactionType.sale' },
        { value: 'rent', labelKey: 'listings.filters.transactionType.rent' },
      ],
    },
    {
      key: 'bedrooms',
      kind: 'range',
      labelKey: 'listings.filters.bedrooms',
      minKey: 'bedroomsMin',
    },
    {
      key: 'bathrooms',
      kind: 'range',
      labelKey: 'listings.filters.bathrooms',
      minKey: 'bathroomsMin',
    },
    {
      key: 'areaM2',
      kind: 'range',
      labelKey: 'listings.filters.areaM2',
      minKey: 'areaM2Min',
      maxKey: 'areaM2Max',
    },
    {
      key: 'furnished',
      kind: 'boolean',
      labelKey: 'listings.filters.furnished',
    },
  ],
};

// ── Registry map ────────────────────────────────────────────────────────────

export const LISTING_FILTER_SCHEMAS: Readonly<
  Record<ListingCategory, ListingFilterSchema>
> = {
  phone: { category: 'phone', fields: [] },
  car: CAR_FILTER_SCHEMA,
  property: PROPERTY_FILTER_SCHEMA,
};

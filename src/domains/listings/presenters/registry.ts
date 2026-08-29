/**
 * Listing presenter contract + registry (P8.1 contracts).
 *
 * One presenter per category supplies every category-specific rendering
 * decision (card fields, spec rows, contact payload) so the showroom shell
 * stays SHARED — no triple copies of component logic (approved design P4).
 *
 * P8.1 ships the CONTRACT and the registry mechanism only. Concrete
 * adapters (phone first, then car/property) register themselves in their
 * delivery phases (P8.7); nothing in this module is phone-specific.
 *
 * Labels are i18n keys; raw values ride alongside for sorting/search.
 */

import type { ListingCategory, ListingPricePeriod, ListingRecord } from '../types';

// ── View models ─────────────────────────────────────────────────────────────

/** Small attribute chip on a listing card (e.g. storage chip on phones). */
export interface ListingChip {
  readonly labelKey: string;
  /** Raw value already formatted for display (unit included). */
  readonly value: string;
}

export interface ListingCardModel {
  /** Primary line — phones/cars: "Brand Model", property: title. */
  readonly title: string;
  /** Secondary line (trim+year / district+type), '' when absent. */
  readonly subtitle: string;
  readonly chips: readonly ListingChip[];
  readonly priceLabelKey: 'listings.price.sale' | 'listings.price.monthly';
  /**
   * Public-surface extensions (P8.5). Optional so admin consumers
   * (ListingRow) stay source-compatible; the neutral decorator
   * (`toPublicCardModel`) fills them from the record.
   */
  readonly price?: number | null;
  readonly pricePeriod?: ListingPricePeriod;
  /** Cover image as a bucket-relative inventory_images path ('' = none). */
  readonly image?: string;
  readonly category?: ListingCategory;
  readonly deepLink?: string;
  /** Neutral fact for the public card's 📍 line ('' when absent). */
  readonly city?: string;
}

export interface ListingSpecRow {
  readonly labelKey: string;
  readonly value: string;
}

/**
 * Neutral contact payload matching the existing WhatsApp mediator
 * contract (name/code/price/city/link) — consumed by the WhatsApp
 * template factory in P8.9.
 */
export interface ListingContactInfo {
  readonly name: string;
  readonly code: string;
  readonly priceText: string;
  readonly city: string;
  readonly deepLink: string;
}

// ── Presenter contract ──────────────────────────────────────────────────────

export interface ListingPresenter {
  readonly category: ListingCategory;
  card(listing: ListingRecord): ListingCardModel;
  specRows(listing: ListingRecord): readonly ListingSpecRow[];
  /**
   * Identity used by shared "similar items": same model first, same brand
   * next, then newest — identical semantics to today's useSimilarPhones.
   */
  similarIdentity(
    listing: ListingRecord,
  ): { readonly modelId: string; readonly brand: string };
  contact(listing: ListingRecord, deepLink: string): ListingContactInfo;
}

// ── Registry mechanism ──────────────────────────────────────────────────────

export class ListingPresenterError extends Error {
  constructor(category: ListingCategory, message: string) {
    super(`[listings] ${category}: ${message}`);
    this.name = 'ListingPresenterError';
  }
}

const registry = new Map<ListingCategory, ListingPresenter>();

export function registerListingPresenter(presenter: ListingPresenter): void {
  if (registry.has(presenter.category)) {
    throw new ListingPresenterError(
      presenter.category,
      'presenter already registered',
    );
  }
  registry.set(presenter.category, presenter);
}

export function getListingPresenter(
  category: ListingCategory,
): ListingPresenter | undefined {
  return registry.get(category);
}

/** Strict accessor for UI shells that must render a known category. */
export function getRequiredListingPresenter(
  category: ListingCategory,
): ListingPresenter {
  const presenter = registry.get(category);
  if (!presenter) {
    throw new ListingPresenterError(category, 'no presenter registered');
  }
  return presenter;
}

export function hasListingPresenter(category: ListingCategory): boolean {
  return registry.has(category);
}

/** Test seam — clears registrations between isolated test cases. */
export function resetListingPresentersForTests(): void {
  registry.clear();
}

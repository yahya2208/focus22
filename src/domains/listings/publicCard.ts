/**
 * Public listing card decorator (P8.5).
 *
 * Category presentation semantics stay owned by the per-category presenters
 * (registry.getRequired); this module adds only the NEUTRAL public facts the
 * showroom shell needs on every card: cover image, price amount + period,
 * category, and the approved `#/listing-details?id=` deep link.
 *
 * Car listings are sale-only by contract (STEP 4): a car carrying a monthly
 * period is a data-contract violation and is thrown loudly, never rendered.
 */

import type { ListingCategory, ListingPricePeriod, ListingRecord, ProduceUnit } from './types';
import { getRequiredListingPresenter } from './presenters/registry';
import type { ListingChip } from './presenters/registry';

/** Approved P8.5 deep link shape for public listing details. */
export const LISTING_DETAILS_DEEP_LINK_PREFIX = '#/listing-details?id=';

export function listingDeepLink(id: string): string {
  return LISTING_DETAILS_DEEP_LINK_PREFIX + encodeURIComponent(id);
}

/** Card model as the public shell consumes it: presenter fields + neutral facts, all required. */
export interface PublicListingCardModel {
  readonly title: string;
  readonly subtitle: string;
  readonly chips: readonly ListingChip[];
  readonly priceLabelKey: 'listings.price.sale' | 'listings.price.monthly';
  readonly price: number | null;
  readonly pricePeriod: ListingPricePeriod;
  /** Pricing unit for unit-priced domains (produce): e.g. 'kg' → "د.ج/كغ". Absent for car/property. */
  readonly unit: ProduceUnit | null;
  readonly image: string;
  readonly category: ListingCategory;
  readonly deepLink: string;
  readonly city: string;
}

export function toPublicCardModel(listing: ListingRecord): PublicListingCardModel {
  if (listing.category === 'car' && listing.price.period !== 'sale') {
    throw new Error(
      `[listings] car ${listing.id}: price.period "${listing.price.period}" is not representable — cars are sale-only`,
    );
  }
  const base = getRequiredListingPresenter(listing.category).card(listing);
  return {
    title: base.title,
    subtitle: base.subtitle,
    chips: base.chips,
    priceLabelKey: base.priceLabelKey,
    price: listing.price.amount,
    pricePeriod: listing.price.period,
    unit: listing.unit ?? null,
    image: listing.images.length > 0 ? listing.images[0]! : '',
    category: listing.category,
    deepLink: listingDeepLink(listing.id),
    city: listing.city,
  };
}

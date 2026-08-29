/**
 * Admin listings board loader (P8.4).
 *
 * Composes the category-aware admin view from exactly two sources:
 *
 *   Phone     → legacy inventory cache → listingFromInventoryRecord adapter
 *               (one direction only; the phone flow is never rebuilt from it)
 *   Car/Prop  → listing_my_listings RPC via listing-service — the 00039 read
 *               that INCLUDES drafts/unpublished rows the public view hides
 *
 * No fallbacks: a failed load or an unexpected row shape surfaces as an
 * error to the caller (house rule — never hide data bugs).
 */

import { InventoryService } from '../../services/inventory-service';
import { fetchMyListings, listingFromInventoryRecord } from '../../services/listing-service';
import type { ListingCategory, ListingRecord } from './types';

export interface AdminListingsBoard {
  phones: ListingRecord[];
  cars: ListingRecord[];
  properties: ListingRecord[];
  produce: ListingRecord[];
}

/** Runtime guard mirroring rule 26 — unknown categories are rejected loudly. */
export function assertKnownListingCategory(category: string): asserts category is ListingCategory {
  if (
    category !== 'phone' &&
    category !== 'car' &&
    category !== 'property' &&
    category !== 'produce'
  ) {
    throw new Error(`unknown listing category "${category}"`);
  }
}

export async function loadAdminListingsBoard(): Promise<AdminListingsBoard> {
  const [cars, properties, produce] = await Promise.all([
    fetchMyListings('car'),
    fetchMyListings('property'),
    fetchMyListings('produce'),
  ]);
  const phones = InventoryService.getAll().map(listingFromInventoryRecord);
  for (const rec of [...cars, ...properties, ...produce]) {
    assertKnownListingCategory(rec.category);
  }
  return { phones, cars, properties, produce };
}

/**
 * Client-side substring filter for car/property rows on the admin board —
 * same fields the server-side search matches (brand/model/city/code plus
 * car trim / property district+title). Phones keep their dedicated
 * InventoryService.search path untouched.
 */
export function filterAdminListing(listing: ListingRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const haystack = [
    listing.brand,
    listing.model,
    listing.city,
    listing.code,
    listing.car?.trim ?? '',
    listing.propertyDetails?.district ?? '',
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

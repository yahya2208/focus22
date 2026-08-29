/**
 * Phone listing presenter (P8.7) — the legacy category enters the neutral
 * registry WITHOUT any behavior change to the legacy phone flow.
 *
 * Presentation decisions mirror the P8.4 car/property presenters: empty or
 * absent details never render (no fields invented just to normalize shapes).
 *
 * OWNER RULES honored here:
 *   - `variant` is NOT a trim: it NEVER fills the subtitle slot (D-decision);
 *     it appears as its own chip/spec row instead.
 *   - Condition display derives from `phone.conditionRaw` (exact stored
 *     string), not from the binary conditionGroup (P8.7/D6).
 *   - similarIdentity uses the REAL catalog modelId when present (D4),
 *     falling back to the "Brand Model" composite for degraded records —
 *     identical semantics to useSimilarPhones.
 */

import type { ListingRecord } from '../types';
import type { ListingCardModel, ListingChip, ListingPresenter, ListingSpecRow } from './registry';

/** Raw condition → Arabic display; unknown values render AS-IS (labels.ts rule). */
const CONDITION_AR: Record<string, string> = {
  new: 'جديد',
  used: 'مستعمل',
};

function conditionLabel(conditionRaw: string): string {
  return CONDITION_AR[conditionRaw.toLowerCase()] ?? conditionRaw;
}

export const phoneListingPresenter: ListingPresenter = {
  category: 'phone',

  card(listing: ListingRecord): ListingCardModel {
    const phone = listing.phone;
    const chips: ListingChip[] = [];
    if (phone) {
      if (phone.storage !== '') chips.push({ labelKey: 'listings.phone.storage', value: phone.storage });
      if (phone.ram !== '') chips.push({ labelKey: 'listings.phone.ram', value: phone.ram });
    }
    return {
      title: [listing.brand, listing.model].filter(Boolean).join(' '),
      // variant is never a subtitle (owner rule P8.7).
      subtitle: '',
      chips,
      priceLabelKey: 'listings.price.sale',
    };
  },

  specRows(listing: ListingRecord): readonly ListingSpecRow[] {
    const phone = listing.phone;
    if (!phone) return [];
    const rows: ListingSpecRow[] = [];
    if (phone.variant !== '') rows.push({ labelKey: 'listings.phone.variant', value: phone.variant });
    if (phone.ram !== '') rows.push({ labelKey: 'listings.phone.ram', value: phone.ram });
    if (phone.storage !== '') rows.push({ labelKey: 'listings.phone.storage', value: phone.storage });
    if (phone.batteryHealth != null) {
      rows.push({ labelKey: 'listings.phone.batteryHealth', value: `${phone.batteryHealth}%` });
    }
    if (listing.color !== '') rows.push({ labelKey: 'listings.phone.color', value: listing.color });
    if (listing.warranty !== '') rows.push({ labelKey: 'listings.phone.warranty', value: listing.warranty });
    rows.push({ labelKey: 'listings.phone.condition', value: conditionLabel(phone.conditionRaw) });
    return rows;
  },

  similarIdentity(listing: ListingRecord) {
    const modelId = listing.phone?.modelId.trim();
    return {
      modelId: modelId ? modelId : `${listing.brand} ${listing.model}`.trim(),
      brand: listing.brand,
    };
  },

  contact(listing: ListingRecord, deepLink: string) {
    return {
      name: this.card(listing).title,
      code: listing.code || listing.id.slice(0, 8),
      priceText: listing.price.amount != null ? `${listing.price.amount.toLocaleString('en-US')} د.ج` : '',
      city: listing.city,
      deepLink,
    };
  },
};

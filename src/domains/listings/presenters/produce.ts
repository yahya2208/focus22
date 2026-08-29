/**
 * Produce listing presenter (Generic Catalog) — every produce-specific
 * rendering decision in ONE place, per the presenter registry contract.
 *
 * Produce is unit-priced: "250 دج / كغ", stock in the same unit ("100 كغ").
 * Empty/absent details never render (same rule as car/property).
 */

import type { ListingRecord, ProduceUnit } from '../types';
import type { ListingCardModel, ListingChip, ListingPresenter, ListingSpecRow } from './registry';

const UNIT_AR: Record<ProduceUnit, string> = {
  piece: 'قطعة',
  kg: 'كغ',
  g: 'غرام',
  liter: 'لتر',
  dozen: 'دزينة',
  bag: 'كيس',
};

export { UNIT_AR };

/** "250 د.ج" — the money amount (English locale, same as car/property). */
export function formatProduceAmount(amount: number): string {
  return `${amount.toLocaleString('en-US')} د.ج`;
}

/** "د.ج/كغ" — the price-per-unit suffix, or 'د.ج' when no unit. */
export function formatProduceUnitSuffix(unit: ProduceUnit | null): string {
  if (!unit) return 'د.ج';
  return `د.ج/${UNIT_AR[unit]}`;
}

/** Arabic unit label (chips / spec rows / "available: 100 كغ"). */
export function produceUnitLabel(unit: ProduceUnit | null): string {
  return UNIT_AR[unit ?? 'piece'];
}

export const produceListingPresenter: ListingPresenter = {
  category: 'produce',

  card(listing: ListingRecord): ListingCardModel {
    const produce = listing.produce;
    const unit = listing.unit;
    const chips: ListingChip[] = [];
    if (produce?.origin !== '') chips.push({ labelKey: 'listings.produce.origin', value: produce?.origin ?? '' });
    if (produce?.grade !== '') chips.push({ labelKey: 'listings.produce.grade', value: produce?.grade ?? '' });

    return {
      title: listing.model,
      subtitle: unit ? produceUnitLabel(unit) : (produce?.origin ?? ''),
      chips,
      priceLabelKey: 'listings.price.sale',
    };
  },

  specRows(listing: ListingRecord): readonly ListingSpecRow[] {
    const produce = listing.produce;
    const unit = listing.unit;
    const rows: ListingSpecRow[] = [];
    if (unit) rows.push({ labelKey: 'listings.produce.unit', value: produceUnitLabel(unit) });
    if (produce && produce.origin !== '') rows.push({ labelKey: 'listings.produce.origin', value: produce.origin });
    if (produce && produce.grade !== '') rows.push({ labelKey: 'listings.produce.grade', value: produce.grade });
    return rows;
  },

  similarIdentity(listing: ListingRecord) {
    return { modelId: listing.model, brand: listing.brand };
  },

  contact(listing: ListingRecord, deepLink: string) {
    const amount = listing.price.amount != null ? formatProduceAmount(listing.price.amount) : '';
    const priceText = listing.unit ? `${amount} / ${produceUnitLabel(listing.unit)}` : amount;
    return {
      name: this.card(listing).title,
      code: listing.code || listing.id.slice(0, 8),
      priceText,
      city: listing.city,
      deepLink,
    };
  },
};

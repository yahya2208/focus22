/**
 * Property listing presenter (P8.4) — every property-specific rendering
 * decision in ONE place, per the P8.1 registry contract. Empty/absent
 * details never render.
 */

import type { ListingRecord, PropertyType, PropertyTransactionType, PropertyConditionState } from '../types';
import type { ListingCardModel, ListingChip, ListingPresenter, ListingSpecRow } from './registry';

const TYPE_AR: Record<PropertyType, string> = {
  apartment: 'شقة',
  villa: 'فيلا',
  house: 'منزل',
  land: 'أرض',
  shop: 'محل',
  office: 'مكتب',
};

export const PROPERTY_TYPE_AR = TYPE_AR;

const TRANSACTION_AR: Record<PropertyTransactionType, string> = {
  sale: 'بيع',
  rent: 'إيجار',
};

export const PROPERTY_TRANSACTION_AR = TRANSACTION_AR;

const CONDITION_AR: Record<PropertyConditionState, string> = {
  new: 'جديد',
  good: 'جيد',
  needs_renovation: 'يحتاج ترميم',
};

export const propertyListingPresenter: ListingPresenter = {
  category: 'property',

  card(listing: ListingRecord): ListingCardModel {
    const pd = listing.propertyDetails;
    const chips: ListingChip[] = [];
    if (pd) {
      if (pd.areaM2 != null) chips.push({ labelKey: 'listings.property.areaM2', value: `${pd.areaM2} م²` });
      if (pd.bedrooms != null) chips.push({ labelKey: 'listings.property.bedrooms', value: `${pd.bedrooms} غرف` });
      if (pd.bathrooms != null) chips.push({ labelKey: 'listings.property.bathrooms', value: `${pd.bathrooms} حمامات` });
    }
    const developer = listing.brand !== '' ? `${listing.brand} · ` : '';
    return {
      title: listing.model,
      subtitle: pd ? [developer + TYPE_AR[pd.propertyType], pd.district].filter(Boolean).join(' · ') : '',
      chips,
      priceLabelKey: pd?.transactionType === 'rent' ? 'listings.price.monthly' : 'listings.price.sale',
    };
  },

  specRows(listing: ListingRecord): readonly ListingSpecRow[] {
    const pd = listing.propertyDetails;
    if (!pd) return [];
    const rows: ListingSpecRow[] = [
      { labelKey: 'listings.property.propertyType', value: TYPE_AR[pd.propertyType] },
      { labelKey: 'listings.property.transactionType', value: TRANSACTION_AR[pd.transactionType] },
    ];
    if (pd.district !== '') rows.push({ labelKey: 'listings.property.district', value: pd.district });
    if (pd.areaM2 != null) rows.push({ labelKey: 'listings.property.areaM2', value: `${pd.areaM2} م²` });
    if (pd.bedrooms != null) rows.push({ labelKey: 'listings.property.bedrooms', value: String(pd.bedrooms) });
    if (pd.bathrooms != null) rows.push({ labelKey: 'listings.property.bathrooms', value: String(pd.bathrooms) });
    if (pd.floor != null) rows.push({ labelKey: 'listings.property.floor', value: String(pd.floor) });
    if (pd.furnished != null) {
      rows.push({ labelKey: 'listings.property.furnished', value: pd.furnished ? 'مفروشة' : 'غير مفروشة' });
    }
    rows.push({ labelKey: 'listings.property.conditionState', value: CONDITION_AR[pd.conditionState] });
    return rows;
  },

  similarIdentity(listing: ListingRecord) {
    return { modelId: listing.model, brand: listing.brand };
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

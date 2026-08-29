/**
 * Car listing presenter (P8.4) — every car-specific rendering decision in
 * ONE place, per the P8.1 registry contract. Empty/absent details never
 * render (no fields shown just to normalize shapes).
 */

import type { ListingRecord, CarFuel, CarTransmission, CarBodyType, CarConditionState } from '../types';
import type { ListingCardModel, ListingChip, ListingPresenter, ListingSpecRow } from './registry';

const FUEL_AR: Record<CarFuel, string> = {
  benzin: 'بنزين',
  diesel: 'ديزل',
  hybrid: 'هايبرد',
  electric: 'كهرباء',
  lpg: 'غاز',
};

const TRANSMISSION_AR: Record<CarTransmission, string> = {
  manual: 'عادي',
  automatic: 'أوتوماتيك',
};

const BODY_AR: Record<CarBodyType, string> = {
  sedan: 'سيدان',
  suv: 'دفع رباعي',
  hatchback: 'هاتشباك',
  pickup: 'بيك أب',
  coupe: 'كوبيه',
  van: 'فان',
};

const CONDITION_AR: Record<CarConditionState, string> = {
  new: 'جديدة',
  used: 'مستعملة',
  damaged: 'متضررة',
};

export function formatCarMileage(km: number): string {
  return `${km.toLocaleString('en-US')} كم`;
}

export const carListingPresenter: ListingPresenter = {
  category: 'car',

  card(listing: ListingRecord): ListingCardModel {
    const car = listing.car;
    const chips: ListingChip[] = [];
    if (car) {
      if (car.mileageKm != null) chips.push({ labelKey: 'listings.car.mileageKm', value: formatCarMileage(car.mileageKm) });
      if (car.fuel) chips.push({ labelKey: 'listings.car.fuel', value: FUEL_AR[car.fuel] });
      if (car.transmission) chips.push({ labelKey: 'listings.car.transmission', value: TRANSMISSION_AR[car.transmission] });
    }
    return {
      title: [listing.brand, listing.model].filter(Boolean).join(' '),
      subtitle: car ? [car.trim, car.year != null ? String(car.year) : ''].filter(Boolean).join(' · ') : '',
      chips,
      priceLabelKey: 'listings.price.sale',
    };
  },

  specRows(listing: ListingRecord): readonly ListingSpecRow[] {
    const car = listing.car;
    if (!car) return [];
    const rows: ListingSpecRow[] = [];
    if (car.trim !== '') rows.push({ labelKey: 'listings.car.trim', value: car.trim });
    if (car.year != null) rows.push({ labelKey: 'listings.car.year', value: String(car.year) });
    if (car.mileageKm != null) rows.push({ labelKey: 'listings.car.mileageKm', value: formatCarMileage(car.mileageKm) });
    if (car.fuel) rows.push({ labelKey: 'listings.car.fuel', value: FUEL_AR[car.fuel] });
    if (car.transmission) rows.push({ labelKey: 'listings.car.transmission', value: TRANSMISSION_AR[car.transmission] });
    if (car.bodyType) rows.push({ labelKey: 'listings.car.bodyType', value: BODY_AR[car.bodyType] });
    if (car.engineCc != null) rows.push({ labelKey: 'listings.car.engineCc', value: `${car.engineCc} cc` });
    rows.push({ labelKey: 'listings.car.conditionState', value: CONDITION_AR[car.conditionState] });
    return rows;
  },

  similarIdentity(listing: ListingRecord) {
    return { modelId: `${listing.brand} ${listing.model}`.trim(), brand: listing.brand };
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

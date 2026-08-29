/**
 * P8.5 — `toPublicCardModel` pure-domain behavioral tests.
 *
 * The decorator is the ONLY bridge between category presenters and the
 * public showroom card. Contract under test (approved scope):
 *   - presenter semantics pass through untouched (title/subtitle/chips)
 *   - neutral facts attach (price/period/image/category/deepLink/city)
 *   - car + monthly price is unrepresentable → throws loudly
 *   - no field fabrication for nulls; variant-like noise never leaks
 */

import { describe, it, expect } from 'vitest';
import {
  toPublicCardModel,
  listingDeepLink,
  LISTING_DETAILS_DEEP_LINK_PREFIX,
  ensureAdminListingPresenters,
} from '../../domains/listings';
import type { ListingRecord } from '../../domains/listings';

// Presenters are session-singletons; the pure decorator requires them registered.
ensureAdminListingPresenters();

function makeCar(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: 'car-1',
    category: 'car',
    brand: 'Toyota',
    model: 'Corolla GLX',
    description: '',
    color: '',
    city: 'Damascus',
    warranty: '',
    code: '',
    price: { amount: 18500, period: 'sale' },
    conditionGroup: null,
    quantity: 1,
    status: 'in_stock',
    isPublished: true,
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    car: {
      trim: 'GLX',
      year: 2020,
      mileageKm: 54000,
      fuel: 'benzin',
      transmission: 'automatic',
      bodyType: 'sedan',
      engineCc: 1800,
      conditionState: 'used',
    },
    ...overrides,
  };
}

function makeProperty(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: 'prop-1',
    category: 'property',
    brand: '',
    model: 'Apartment Mazzeh 3 rooms',
    description: '',
    color: '',
    city: 'Damascus',
    warranty: '',
    code: '',
    price: { amount: 450, period: 'monthly' },
    conditionGroup: null,
    quantity: 1,
    status: 'in_stock',
    isPublished: true,
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    propertyDetails: {
      propertyType: 'apartment',
      transactionType: 'rent',
      district: 'Mazzeh',
      areaM2: 120,
      bedrooms: 3,
      bathrooms: 2,
      floor: 4,
      furnished: false,
      conditionState: 'good',
    },
    ...overrides,
  };
}

describe('P8.5 toPublicCardModel — neutral facts attach', () => {
  it('car: sale price passthrough with sale label key and no monthly suffix data', () => {
    const m = toPublicCardModel(makeCar());
    expect(m.price).toBe(18500);
    expect(m.pricePeriod).toBe('sale');
    expect(m.priceLabelKey).toBe('listings.price.sale');
  });

  it('property rent: monthly period pairs with monthly label key', () => {
    const m = toPublicCardModel(makeProperty());
    expect(m.price).toBe(450);
    expect(m.pricePeriod).toBe('monthly');
    expect(m.priceLabelKey).toBe('listings.price.monthly');
  });

  it('property sale: transaction_type=sale keeps sale pairing', () => {
    const m = toPublicCardModel(
      makeProperty({
        price: { amount: 90000, period: 'sale' },
        propertyDetails: {
          propertyType: 'villa',
          transactionType: 'sale',
          district: '',
          areaM2: null,
          bedrooms: null,
          bathrooms: null,
          floor: null,
          furnished: null,
          conditionState: 'new',
        },
      }),
    );
    expect(m.pricePeriod).toBe('sale');
    expect(m.priceLabelKey).toBe('listings.price.sale');
  });

  it('deep link shape is stable and encodes the id', () => {
    expect(listingDeepLink('abc')).toBe('#/listing-details?id=abc');
    expect(listingDeepLink('a b/c')).toBe('#/listing-details?id=a%20b%2Fc');
    expect(LISTING_DETAILS_DEEP_LINK_PREFIX).toBe('#/listing-details?id=');
    const m = toPublicCardModel(makeCar({ id: 'x y' }));
    expect(m.deepLink).toBe('#/listing-details?id=x%20y');
  });

  it('image picks the FIRST path; single and empty image sets behave', () => {
    expect(toPublicCardModel(makeCar({ images: ['a.jpg', 'b.jpg'] })).image).toBe('a.jpg');
    expect(toPublicCardModel(makeCar({ images: ['only.jpg'] })).image).toBe('only.jpg');
    expect(toPublicCardModel(makeCar({ images: [] })).image).toBe('');
  });

  it('city passes through verbatim (empty city stays empty — no fabrication)', () => {
    expect(toPublicCardModel(makeCar()).city).toBe('Damascus');
    expect(toPublicCardModel(makeCar({ city: '' })).city).toBe('');
  });
});

describe('P8.5 toPublicCardModel — presenter semantics pass through untouched', () => {
  it('car title/subtitle/chips come from the presenter only (trim · year subtitle)', () => {
    const m = toPublicCardModel(makeCar());
    expect(m.title).toBe('Toyota Corolla GLX');
    expect(m.subtitle).toBe('GLX · 2020');
    expect(m.chips.map((c) => c.value)).toEqual(['54,000 كم', 'بنزين', 'أوتوماتيك']);
  });

  it('variant-like noise never leaks: result keys are exactly the contract shape', () => {
    const m = toPublicCardModel(makeCar());
    // A phone-style variant string is not even representable on a car record;
    // the shape lock proves the decorator invents nothing beyond its contract.
    expect(Object.keys(m).sort()).toEqual(
      ['category', 'chips', 'city', 'deepLink', 'image', 'price', 'priceLabelKey', 'pricePeriod', 'subtitle', 'title'],
    );
    // And every chip value traces to a presenter labelKey — nothing anonymous.
    expect(m.chips.every((c) => c.labelKey.startsWith('listings.car.'))).toBe(true);
  });

  it('nulls never fabricate "0"/"N/A" chips (absent details stay absent)', () => {
    const m = toPublicCardModel(
      makeProperty({
        propertyDetails: {
          propertyType: 'house',
          transactionType: 'rent',
          district: '',
          areaM2: null,
          bedrooms: null,
          bathrooms: null,
          floor: null,
          furnished: null,
          conditionState: 'good',
        },
      }),
    );
    expect(m.chips).toEqual([]);
    expect(JSON.stringify(m)).not.toContain('N/A');
    expect(m.subtitle).not.toContain('undefined');
  });

  it('unknown category is rejected loudly via the registry (no silent fallback)', () => {
    expect(() => toPublicCardModel(makeCar({ category: 'boat' as never }))).toThrow();
  });
});

describe('P8.5 toPublicCardModel — car pricing guard', () => {
  it('car + monthly is unrepresentable and throws with the listing id', () => {
    expect(() =>
      toPublicCardModel(makeCar({ id: 'car-bad', price: { amount: 900, period: 'monthly' } })),
    ).toThrow(/car-bad/);
    expect(() =>
      toPublicCardModel(makeCar({ id: 'car-bad', price: { amount: 900, period: 'monthly' } })),
    ).toThrow(/sale-only/);
  });
});

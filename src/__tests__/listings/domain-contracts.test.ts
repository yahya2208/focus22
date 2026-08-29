import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_PRICE_PERIOD,
  isPhoneListing,
  isCarListing,
  isPropertyListing,
  LISTING_FILTER_SCHEMAS,
  registerListingPresenter,
  getListingPresenter,
  getRequiredListingPresenter,
  hasListingPresenter,
  resetListingPresentersForTests,
  ListingPresenterError,
  type ListingRecord,
  type CarDetails,
  type PropertyDetails,
  type ListingPresenter,
  type ListingCategory,
} from '../../domains/listings';

// ── Fixtures ────────────────────────────────────────────────────────────────

const carDetails: CarDetails = {
  trim: 'GLX',
  year: 2024,
  mileageKm: 15_000,
  fuel: 'benzin',
  transmission: 'automatic',
  bodyType: 'sedan',
  engineCc: 1600,
  conditionState: 'used',
};

const propertyDetails: PropertyDetails = {
  propertyType: 'apartment',
  transactionType: 'rent',
  district: 'Bir Mourad Raïs',
  areaM2: 95,
  bedrooms: 3,
  bathrooms: 2,
  floor: 4,
  furnished: true,
  conditionState: 'good',
};

function makeListing(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    category: 'phone',
    brand: 'Samsung',
    model: 'Galaxy S25',
    description: '',
    color: '',
    city: '',
    warranty: '',
    code: '',
    price: { amount: null, period: DEFAULT_PRICE_PERIOD },
    conditionGroup: 'used',
    quantity: 1,
    status: 'in_stock',
    isPublished: false,
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePresenter(category: ListingCategory): ListingPresenter {
  return {
    category,
    card: () => ({
      title: 't',
      subtitle: '',
      chips: [],
      priceLabelKey: 'listings.price.sale',
    }),
    specRows: () => [],
    similarIdentity: () => ({ modelId: 'm', brand: 'b' }),
    contact: (_l, deepLink) => ({
      name: 'n',
      code: 'c',
      priceText: 'p',
      city: '',
      deepLink,
    }),
  };
}

// ── Types & guards ──────────────────────────────────────────────────────────

describe('listings domain — types & guards', () => {
  it('defaults the neutral price period to sale', () => {
    expect(DEFAULT_PRICE_PERIOD).toBe('sale');
  });

  it('classifies listings by category AND presence of details', () => {
    const phone = makeListing();
    expect(isPhoneListing(phone)).toBe(true);
    expect(isCarListing(phone)).toBe(false);
    expect(isPropertyListing(phone)).toBe(false);

    // Category 'car' WITHOUT details must not pass the strict guard.
    const brokenCar = makeListing({ category: 'car' });
    expect(isCarListing(brokenCar)).toBe(false);

    const car = makeListing({ category: 'car', car: carDetails });
    expect(isCarListing(car)).toBe(true);
    expect(isPhoneListing(car)).toBe(false);

    const brokenProperty = makeListing({ category: 'property' });
    expect(isPropertyListing(brokenProperty)).toBe(false);

    const property = makeListing({
      category: 'property',
      propertyDetails,
    });
    expect(isPropertyListing(property)).toBe(true);
  });

  it('keeps rent expressible without any second money column', () => {
    const rental = makeListing({
      category: 'property',
      propertyDetails,
      price: { amount: 45_000, period: 'monthly' },
    });
    expect(rental.price.period).toBe('monthly');
    expect(typeof rental.price.amount).toBe('number');
  });
});

// ── Filter schemas ──────────────────────────────────────────────────────────

describe('listings domain — filter schemas', () => {
  it('covers exactly the three approved categories', () => {
    expect(Object.keys(LISTING_FILTER_SCHEMAS).sort()).toEqual([
      'car',
      'phone',
      'property',
    ]);
  });

  it('keeps the phone schema EMPTY (no phone behavior change rule)', () => {
    expect(LISTING_FILTER_SCHEMAS.phone.fields).toHaveLength(0);
  });

  it.each(['car', 'property'] as const)(
    '%s schema fields are structurally valid',
    (category) => {
      const { fields } = LISTING_FILTER_SCHEMAS[category];
      expect(fields.length).toBeGreaterThan(0);

      const keys = new Set<string>();
      for (const field of fields) {
        expect(keys.has(field.key)).toBe(false);
        keys.add(field.key);

        if (field.kind === 'select') {
          expect(field.options?.length ?? 0).toBeGreaterThan(0);
          const values = new Set(field.options!.map((o) => o.value));
          expect(values.size).toBe(field.options!.length);
        }
        if (field.kind === 'range') {
          expect(field.minKey !== undefined || field.maxKey !== undefined)
            .toBe(true);
        }
      }
    },
  );
});

// ── Presenter registry ──────────────────────────────────────────────────────

describe('listings domain — presenter registry', () => {
  afterEach(() => resetListingPresentersForTests());

  it('registers, resolves and reports presenters per category', () => {
    expect(hasListingPresenter('car')).toBe(false);

    const presenter = makePresenter('car');
    registerListingPresenter(presenter);

    expect(hasListingPresenter('car')).toBe(true);
    expect(getListingPresenter('car')).toBe(presenter);
    expect(getRequiredListingPresenter('car')).toBe(presenter);
  });

  it('rejects duplicate registration for the same category', () => {
    registerListingPresenter(makePresenter('property'));
    expect(() => registerListingPresenter(makePresenter('property')))
      .toThrow(ListingPresenterError);
  });

  it('throws a typed error for unregistered categories', () => {
    expect(() => getRequiredListingPresenter('car')).toThrow(
      ListingPresenterError,
    );
    try {
      getRequiredListingPresenter('car');
      expect.unreachable('must throw');
    } catch (err) {
      expect((err as Error).message).toContain('car');
      expect((err as ListingPresenterError).name).toBe(
        'ListingPresenterError',
      );
    }
  });

  it('reset clears every registration (test seam)', () => {
    registerListingPresenter(makePresenter('phone'));
    resetListingPresentersForTests();
    expect(hasListingPresenter('phone')).toBe(false);
  });
});

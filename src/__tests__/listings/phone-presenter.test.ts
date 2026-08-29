/**
 * P8.7 — Phone enters the neutral listing domain (D1–D6).
 *
 * Proves: adapter parity (every legacy field value preserved, inventory
 * secrets excluded), PhoneDetails passthrough (variant/ram/storage/
 * batteryHealth/modelId/conditionRaw), the presenter contract (variant is
 * NEVER a subtitle; condition renders from the RAW string), real-modelId
 * similar identity, idempotent registration of all three categories,
 * registry isolation, and STATIC isolation of the legacy phone UI
 * (PhoneShowroom/ProductDetailsScreen import nothing from domains/listings).
 */

import { describe, it, expect } from 'vitest';
import phoneShowroomSource from '../../components/showroom/PhoneShowroom.tsx?raw';
import productDetailsSource from '../../screens/showroom/ProductDetailsScreen.tsx?raw';
import { listingFromInventoryRecord } from '../../services/listing-service';
import type { InventoryRecord } from '../../services/inventory-service';
import {
  ensureAdminListingPresenters,
  getRequiredListingPresenter,
  hasListingPresenter,
  listingLabel,
  registerListingPresenter,
  resetListingPresentersForTests,
  ListingPresenterError,
} from '../../domains/listings';
import type { ListingRecord } from '../../domains/listings';

function makePhoneRecord(overrides: Partial<InventoryRecord> = {}): InventoryRecord {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    modelId: 'apple-iphone13-catalog',
    brand: 'Apple',
    model: 'iPhone 13',
    variant: '128GB/4GB',
    ram: '4GB',
    storage: '128GB',
    condition: 'New',
    quantity: 2,
    sellPrice: 98000,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    totalPurchased: 5,
    totalSold: 3,
    ...overrides,
  };
}

describe('P8.7/D1 adapter parity — InventoryRecord → ListingRecord', () => {
  it('preserves every commercial field byte-for-byte and carries PhoneDetails', () => {
    const rec = makePhoneRecord({
      color: 'Midnight',
      city: 'Algiers',
      warranty: '6 أشهر',
      code: 'ABCD12',
      description: 'كامل العلبة',
      batteryHealth: 89,
    });
    const neutral = listingFromInventoryRecord(rec);

    expect(neutral.id).toBe(rec.id);
    expect(neutral.category).toBe('phone');
    expect(neutral.brand).toBe('Apple');
    expect(neutral.model).toBe('iPhone 13');
    expect(neutral.description).toBe('كامل العلبة');
    expect(neutral.color).toBe('Midnight');
    expect(neutral.city).toBe('Algiers');
    expect(neutral.warranty).toBe('6 أشهر');
    expect(neutral.code).toBe('ABCD12');
    expect(neutral.price).toEqual({ amount: 98000, period: 'sale' });
    expect(neutral.conditionGroup).toBe('new');
    expect(neutral.quantity).toBe(2);
    expect(neutral.status).toBe('in_stock');
    expect(neutral.isPublished).toBe(true);
    expect(neutral.createdAt).toBe(rec.createdAt);
    expect(neutral.updatedAt).toBe(rec.updatedAt);

    // P8.7/D1 — identity facts ride on `phone`, untouched:
    expect(neutral.phone).toEqual({
      variant: '128GB/4GB',
      ram: '4GB',
      storage: '128GB',
      batteryHealth: 89,
      modelId: 'apple-iphone13-catalog',
      conditionRaw: 'New',
    });

    // Neutral shape stays clean of category siblings and inventory secrets:
    expect(neutral.car).toBeUndefined();
    expect(neutral.propertyDetails).toBeUndefined();
    expect('buyPrice' in neutral).toBe(false);
    expect('sourceLabel' in neutral).toBe(false);
    expect('totalPurchased' in neutral).toBe(false);
    expect('modelId' in neutral).toBe(false);
  });

  it('folds missing optionals exactly per contract (no invented values)', () => {
    const neutral = listingFromInventoryRecord(
      makePhoneRecord({ status: undefined, sellPrice: undefined }),
    );
    expect(neutral.description).toBe('');
    expect(neutral.color).toBe('');
    expect(neutral.city).toBe('');
    expect(neutral.warranty).toBe('');
    expect(neutral.code).toBe('');
    expect(neutral.price.amount).toBeNull();
    expect(neutral.images).toEqual([]);
    expect(neutral.status).toBe('in_stock');
    expect(neutral.phone!.batteryHealth).toBeNull();
  });

  it('conditionGroup stays binary while conditionRaw preserves the exact string (D6)', () => {
    const used = listingFromInventoryRecord(makePhoneRecord({ condition: 'Used' }));
    expect(used.conditionGroup).toBe('used');
    expect(used.phone!.conditionRaw).toBe('Used');

    const exotic = listingFromInventoryRecord(makePhoneRecord({ condition: 'Refurbished' }));
    expect(exotic.conditionGroup).toBe('used'); // folded — only 'New' is new
    expect(exotic.phone!.conditionRaw).toBe('Refurbished'); // raw survives for display
  });
});

describe('P8.7/D2 registry — idempotent registration of all three categories', () => {
  it('ensure registers phone+car+property once and tolerates repeated calls', () => {
    resetListingPresentersForTests();
    ensureAdminListingPresenters();
    ensureAdminListingPresenters(); // second call must NOT throw
    expect(hasListingPresenter('phone')).toBe(true);
    expect(hasListingPresenter('car')).toBe(true);
    expect(hasListingPresenter('property')).toBe(true);
    expect(getRequiredListingPresenter('phone').category).toBe('phone');
  });

  it('direct duplicate registration still rejects loudly (registry contract intact)', () => {
    ensureAdminListingPresenters();
    expect(() => registerListingPresenter(getRequiredListingPresenter('phone'))).toThrow(ListingPresenterError);
  });

  it('registry isolation: reset clears everything; ensure restores all three', () => {
    ensureAdminListingPresenters();
    resetListingPresentersForTests();
    expect(hasListingPresenter('phone')).toBe(false);
    expect(hasListingPresenter('car')).toBe(false);
    ensureAdminListingPresenters();
    expect(hasListingPresenter('phone')).toBe(true);
  });
});

describe('P8.7 presenter contract', () => {
  ensureAdminListingPresenters();
  const presenter = getRequiredListingPresenter('phone');

  it('card: title joins brand+model; subtitle NEVER carries the variant; chips are storage→ram', () => {
    const listing = listingFromInventoryRecord(makePhoneRecord());
    const card = presenter.card(listing);

    expect(card.title).toBe('Apple iPhone 13');
    expect(card.subtitle).toBe(''); // owner rule: variant is not a trim
    expect(card.chips.map((c) => [c.labelKey, c.value])).toEqual([
      ['listings.phone.storage', '128GB'],
      ['listings.phone.ram', '4GB'],
    ]);
    expect(card.priceLabelKey).toBe('listings.price.sale');
  });

  it('specRows: variant/ram/storage/batteryHealth/color/warranty + condition FROM THE RAW string', () => {
    const listing = listingFromInventoryRecord(
      makePhoneRecord({ color: 'Midnight', warranty: '6 أشهر', batteryHealth: 89 }),
    );
    const rows = presenter.specRows(listing).map((r) => [r.labelKey, r.value]);

    expect(rows).toContainEqual(['listings.phone.variant', '128GB/4GB']);
    expect(rows).toContainEqual(['listings.phone.ram', '4GB']);
    expect(rows).toContainEqual(['listings.phone.storage', '128GB']);
    expect(rows).toContainEqual(['listings.phone.batteryHealth', '89%']);
    expect(rows).toContainEqual(['listings.phone.color', 'Midnight']);
    expect(rows).toContainEqual(['listings.phone.warranty', '6 أشهر']);
    expect(rows).toContainEqual(['listings.phone.condition', 'جديد']); // raw 'New' → Arabic
  });

  it('unknown raw condition renders AS-IS (labels.ts visible-gap rule), never blank', () => {
    const listing = listingFromInventoryRecord(makePhoneRecord({ condition: 'Excellent' }));
    const conditionRow = presenter.specRows(listing).find((r) => r.labelKey === 'listings.phone.condition');
    expect(conditionRow!.value).toBe('Excellent');
  });

  it('null handling: empty ram/storage/batteryHealth produce no chips and no NaN rows', () => {
    const listing = listingFromInventoryRecord(
      makePhoneRecord({ ram: '', storage: '', batteryHealth: undefined, color: undefined, warranty: undefined }),
    );
    expect(presenter.card(listing).chips).toEqual([]);
    const keys = presenter.specRows(listing).map((r) => r.labelKey);
    expect(keys).toEqual(['listings.phone.variant', 'listings.phone.condition']);
    for (const row of presenter.specRows(listing)) {
      expect(row.value).not.toMatch(/NaN|undefined|null%/);
    }
  });

  it('similarIdentity uses the REAL catalog modelId (D4), composite only as degraded fallback', () => {
    const listing = listingFromInventoryRecord(makePhoneRecord());
    expect(presenter.similarIdentity(listing)).toEqual({
      modelId: 'apple-iphone13-catalog', // ≠ "Apple iPhone 13" composite
      brand: 'Apple',
    });

    const degraded: ListingRecord = { ...listing, phone: undefined };
    expect(presenter.similarIdentity(degraded)).toEqual({
      modelId: 'Apple iPhone 13', // brand+model composite
      brand: 'Apple',
    });
  });

  it('contact payload matches the WhatsApp mediator contract incl. code fallback', () => {
    const listing = listingFromInventoryRecord(makePhoneRecord({ code: 'ABCD12' }));
    expect(presenter.contact(listing, '#/listing-details?id=x')).toEqual({
      name: 'Apple iPhone 13',
      code: 'ABCD12',
      priceText: '98,000 د.ج',
      city: '',
      deepLink: '#/listing-details?id=x',
    });

    const noCode = listingFromInventoryRecord(
      makePhoneRecord({ id: 'abcdef12-0000-0000-0000-000000000000', code: undefined }),
    );
    expect(presenter.contact(noCode, '').code).toBe('abcdef12');
  });

  it('every emitted labelKey resolves in labels.ts (no unknown-key leakage)', () => {
    const listing = listingFromInventoryRecord(makePhoneRecord({ color: 'Red', warranty: 'سنة' }));
    const keys = [
      ...presenter.card(listing).chips.map((c) => c.labelKey),
      ...presenter.specRows(listing).map((r) => r.labelKey),
      presenter.card(listing).priceLabelKey,
    ];
    for (const key of keys) {
      expect(listingLabel(key)).not.toBe(key); // resolved, not echoed
    }
  });
});

describe('P8.7 static isolation — legacy phone UI never imports the domain', () => {
  it('PhoneShowroom.tsx and ProductDetailsScreen.tsx have zero domains/listings imports', () => {
    for (const [name, source] of [
      ['PhoneShowroom.tsx', phoneShowroomSource],
      ['ProductDetailsScreen.tsx', productDetailsSource],
    ] as const) {
      expect(source.includes('domains/listings'), `${name} must not import domains/listings`).toBe(false);
      expect(source.includes('listingFromInventoryRecord'), `${name} must not use the adapter`).toBe(false);
      expect(source.includes('getRequiredListingPresenter'), `${name} must not touch the registry`).toBe(false);
    }
  });
});

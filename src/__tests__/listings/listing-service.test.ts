/**
 * Listing Service behavioral tests (P8.3).
 *
 * Runs the REAL listing-service against the extended fake substrate, which
 * mirrors migration 00038's validation rules and migration 00037's public
 * projection. Covers: creation (happy + every rejection class), security,
 * publish-completeness, detail merges, core edits, search (filters/sort/
 * pagination/category isolation) and backward-compat proofs for the legacy
 * phone flow.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createListing,
  updateListingCore,
  updateListingDetails,
  setListingPublished,
  searchListings,
  getPublicListing,
  listingFromInventoryRecord,
  fetchMyListings,
  deleteListing,
} from '../../services/listing-service';
import type { CreateCarListingInput } from '../../services/listing-service';
import { getSupabaseClient } from '../../core/supabase/client';
import { InventoryService } from '../../services/inventory-service';
import {
  bootstrapCentralInventory,
  resetCentralInventoryState,
} from '../../services/inventory-central-service';
import { DEFAULT_INVENTORY_SEED } from '../../services/inventory-seed';
import {
  FAKE_CAR_LISTING_SEED,
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
  setFakeCentralAdminMode,
} from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

/** Complete publishable car input builder (seed baseline + overrides). */
function completeCar(overrides: Partial<CreateCarListingInput> = {}): CreateCarListingInput {
  return {
    category: 'car',
    brand: 'Kia',
    model: 'Sportage',
    price: { amount: 22000, period: 'sale' },
    city: 'Damascus',
    publish: true,
    car: {
      trim: 'GL',
      year: 2021,
      mileageKm: 30000,
      fuel: 'diesel',
      transmission: 'manual',
      bodyType: 'suv',
      engineCc: 1600,
      conditionState: 'used',
    },
    ...overrides,
  };
}

describe('createListing — happy paths', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('creates the fixture-equivalent car and exposes it through the public projection', async () => {
    const id = await createListing({
      category: 'car',
      brand: FAKE_CAR_LISTING_SEED.brand,
      model: FAKE_CAR_LISTING_SEED.model,
      price: { amount: FAKE_CAR_LISTING_SEED.price, period: 'sale' },
      city: FAKE_CAR_LISTING_SEED.city,
      color: FAKE_CAR_LISTING_SEED.color,
      description: FAKE_CAR_LISTING_SEED.description,
      publish: true,
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
    });

    const rec = await getPublicListing(id);
    expect(rec).not.toBeNull();
    expect(rec!.category).toBe('car');
    expect(rec!.brand).toBe('Toyota');
    expect(rec!.price).toEqual({ amount: 18500, period: 'sale' });
    expect(rec!.quantity).toBe(1);
    expect(rec!.isPublished).toBe(true);
    expect(rec!.conditionGroup).toBe('used'); // authoritative state 'used' → used bucket
    expect(rec!.car).toEqual({
      trim: 'GLX',
      year: 2020,
      mileageKm: 54000,
      fuel: 'benzin',
      transmission: 'automatic',
      bodyType: 'sedan',
      engineCc: 1800,
      conditionState: 'used',
    });
  });

  it('creates a rental property with price_period=monthly and maps property details', async () => {
    const id = await createListing({
      category: 'property',
      brand: '',
      model: 'Villa Yalda',
      price: { amount: 800, period: 'monthly' },
      city: 'Latakia',
      publish: true,
      propertyDetails: {
        propertyType: 'villa',
        transactionType: 'rent',
        district: 'Yalda',
        areaM2: 250,
        bedrooms: 5,
        bathrooms: 3,
        floor: null,
        furnished: true,
        conditionState: 'new',
      },
    });

    const rec = await getPublicListing(id);
    expect(rec!.price).toEqual({ amount: 800, period: 'monthly' });
    expect(rec!.conditionGroup).toBe('new');
    expect(rec!.propertyDetails).toMatchObject({
      propertyType: 'villa',
      transactionType: 'rent',
      district: 'Yalda',
      areaM2: 250,
      bedrooms: 5,
      furnished: true,
      conditionState: 'new',
    });
  });

  it('keeps unpublished listings invisible to customers until explicitly published', async () => {
    const id = await createListing(completeCar({ publish: false }));
    expect(await getPublicListing(id)).toBeNull();

    await setListingPublished(id, true);
    expect((await getPublicListing(id))!.id).toBe(id);
  });
});

describe('createListing — validation rejections (server contract)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  function broken(shape: Record<string, unknown>): CreateCarListingInput {
    return shape as unknown as CreateCarListingInput;
  }

  it('rejects category=phone — phones keep the single legacy intake flow', async () => {
    await expect(createListing(broken({ category: 'phone', brand: 'Apple', model: 'iPhone', price: { amount: 500, period: 'sale' }, car: {} })))
      .rejects.toThrow('phones must use the legacy inventory_add_item flow');
  });

  it('rejects unknown categories', async () => {
    await expect(createListing(broken({ category: 'boat', brand: 'x', model: 'y', price: { amount: 1, period: 'sale' }, car: {} })))
      .rejects.toThrow('unknown category "boat"');
  });

  it('rejects empty make/model for cars and empty titles for properties', async () => {
    await expect(createListing(completeCar({ brand: '   ', model: 'x' }))).rejects.toThrow(
      'car make and model are required',
    );
    await expect(createListing(completeCar({ brand: 'Kia', model: '' }))).rejects.toThrow(
      'car make and model are required',
    );
    await expect(createListing({
      category: 'property', brand: '', model: '', price: { amount: 1, period: 'sale' }, city: 'x', publish: true,
      propertyDetails: {
        propertyType: 'land', transactionType: 'sale', district: '',
        areaM2: 100, bedrooms: null, bathrooms: null, floor: null, furnished: null, conditionState: 'good',
      },
    })).rejects.toThrow('property listing title is required');
  });

  it('rejects a car without meaningful details and a property without required keys', async () => {
    // Service always sends an object; an ALL-DEFAULTS car payload must still
    // be rejected ("no real detail" ≠ "details provided").
    await expect(createListing(broken({ category: 'car', brand: 'a', model: 'b', price: { amount: 1, period: 'sale' } })))
      .rejects.toThrow('listing details: car payload is empty');

    await expect(createListing(broken({
      category: 'property', brand: 'a', model: 'b', price: { amount: 1, period: 'monthly' },
      propertyDetails: { district: 'x' },
    }))).rejects.toThrow('propertyType is required');
  });

  it('rejects out-of-vocabulary values for every enum field', async () => {
    await expect(createListing(completeCar({ car: { trim: '', year: 2020, mileageKm: 10, fuel: 'petrol' as never, transmission: 'automatic', bodyType: 'sedan', engineCc: 1500, conditionState: 'used' } })))
      .rejects.toThrow('invalid fuel "petrol"');
    await expect(createListing(completeCar({ car: { trim: '', year: 2020, mileageKm: 10, fuel: 'diesel', transmission: 'cvt' as never, bodyType: 'sedan', engineCc: 1500, conditionState: 'used' } })))
      .rejects.toThrow('invalid transmission "cvt"');
    await expect(createListing(completeCar({ car: { trim: '', year: 2020, mileageKm: 10, fuel: 'diesel', transmission: 'manual', bodyType: 'boat' as never, engineCc: 1500, conditionState: 'used' } })))
      .rejects.toThrow('invalid bodyType "boat"');
    await expect(createListing(completeCar({ car: { trim: '', year: 2020, mileageKm: 10, fuel: 'diesel', transmission: 'manual', bodyType: 'van', engineCc: 1500, conditionState: 'broken' as never } })))
      .rejects.toThrow('invalid car conditionState "broken"');
    await expect(createListing({
      category: 'property', brand: 'a', model: 'b', price: { amount: 1, period: 'sale' }, city: 'x', publish: true,
      propertyDetails: {
        propertyType: 'castle' as never, transactionType: 'sale', district: '',
        areaM2: 100, bedrooms: 1, bathrooms: 1, floor: null, furnished: null, conditionState: 'good',
      },
    })).rejects.toThrow('propertyType is required');
    await expect(createListing({
      category: 'property', brand: 'a', model: 'b', price: { amount: 1, period: 'sale' }, city: 'x', publish: true,
      propertyDetails: {
        propertyType: 'shop', transactionType: 'swap' as never, district: '',
        areaM2: 100, bedrooms: 1, bathrooms: 1, floor: null, furnished: null, conditionState: 'good',
      },
    })).rejects.toThrow('transactionType is required');
  });

  it('rejects unknown detail keys (typo protection) and cross-category payloads', async () => {
    await expect(createListing(completeCar({ car: { trim: '', year: 2020, mileageKm: 10, milageKm: 5, fuel: 'diesel', transmission: 'manual', bodyType: 'van', engineCc: 1500, conditionState: 'used' } as never })))
      .rejects.toThrow('unknown car key "milageKm"');

    await expect(createListing(broken({
      category: 'car', brand: 'a', model: 'b', price: { amount: 1, period: 'sale' },
      car: { propertyType: 'villa', trim: '', year: 2020, mileageKm: 1, fuel: null, transmission: null, bodyType: null, engineCc: null, conditionState: 'used' },
    }))).rejects.toThrow('unknown car key "propertyType"');

    await expect(createListing(broken({
      category: 'property', brand: 'a', model: 'b', price: { amount: 1, period: 'monthly' },
      propertyDetails: { trim: 'GLX', propertyType: 'apartment', transactionType: 'rent' },
    }))).rejects.toThrow('unknown property key "trim"');
  });

  it('pins quantity to exactly 1 at the RPC layer (direct contract probe)', async () => {
    const probe = async (quantity: number) => {
      const res = await getSupabaseClient().rpc('listing_create', {
        p_category: 'car',
        p_brand: 'Toyota',
        p_model: 'Corolla',
        p_quantity: quantity,
        p_details: { conditionState: 'used' },
      });
      return res.error?.message ?? '';
    };
    expect(await probe(2)).toContain('quantity must be exactly 1 for car/property listings');
    expect(await probe(0)).toContain('quantity must be exactly 1 for car/property listings');
  });

  it('enforces the price_period pairing rules (car=sale, rent=monthly, sale-property=sale)', async () => {
    await expect(createListing(completeCar({ price: { amount: 100, period: 'monthly' } })))
      .rejects.toThrow('car listings pair with price_period=sale');

    await expect(createListing({
      category: 'property', brand: '', model: 'Flat', price: { amount: 400, period: 'sale' }, city: 'x', publish: true,
      propertyDetails: {
        propertyType: 'apartment', transactionType: 'rent', district: '',
        areaM2: 80, bedrooms: 2, bathrooms: 1, floor: 1, furnished: null, conditionState: 'good',
      },
    })).rejects.toThrow('rental property pairs with price_period=monthly');

    await expect(createListing({
      category: 'property', brand: '', model: 'Flat', price: { amount: 40000, period: 'monthly' }, city: 'x', publish: true,
      propertyDetails: {
        propertyType: 'apartment', transactionType: 'sale', district: '',
        areaM2: 80, bedrooms: 2, bathrooms: 1, floor: 1, furnished: null, conditionState: 'good',
      },
    })).rejects.toThrow('for-sale property pairs with price_period=sale');
  });

  it('rejects publishing incomplete listings, but accepts drafts', async () => {
    const { car, ...rest } = completeCar();
    const missingMileage = { ...rest, car: { ...car!, mileageKm: null } };

    await expect(createListing(missingMileage)).rejects.toThrow(
      'cannot publish incomplete listing: car mileageKm is required',
    );

    // Same shape as a draft is fine.
    const draftId = await createListing({ ...missingMileage, publish: false });
    expect(draftId).toBeTruthy();

    await expect(createListing(completeCar({ price: { amount: null, period: 'sale' } }))).rejects.toThrow(
      'cannot publish incomplete listing: sell_price is required',
    );
    await expect(createListing(completeCar({ city: '' }))).rejects.toThrow(
      'cannot publish incomplete listing: city is required',
    );

    // Land is exempt from the bedroom requirement.
    const landId = await createListing({
      category: 'property', brand: '', model: 'Plot', price: { amount: 90000, period: 'sale' },
      city: 'Homs', publish: true,
      propertyDetails: {
        propertyType: 'land', transactionType: 'sale', district: '',
        areaM2: 500, bedrooms: null, bathrooms: null, floor: null, furnished: null, conditionState: 'good',
      },
    });
    expect(landId).toBeTruthy();
  });

  it('rejects every mutation for non-admin callers while search stays public', async () => {
    setFakeCentralAdminMode(false);

    await expect(createListing(completeCar())).rejects.toThrow('admin role required');
    await expect(searchListings({ category: 'car' })).resolves.toMatchObject({ total: 1 });

    setFakeCentralAdminMode(true);
    const id = await createListing(completeCar());
    setFakeCentralAdminMode(false);
    await expect(updateListingCore(id, { city: 'Aleppo' })).rejects.toThrow('admin role required');
    await expect(updateListingDetails(id, { fuel: 'lpg', trim: '', year: 2021, mileageKm: 1, transmission: null, bodyType: null, engineCc: null, conditionState: 'used' }))
      .rejects.toThrow('admin role required');
  });
});

describe('updateListingDetails — merge semantics + guards', () => {
  let carId = '';
  let propertyId = '';

  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    ({ carId, propertyId } = seedFakeListings());
  });

  it('merges provided keys and preserves stored ones', async () => {
    await updateListingDetails(carId, { fuel: 'hybrid' });

    const rec = await getPublicListing(carId);
    expect(rec!.car!.fuel).toBe('hybrid');
    expect(rec!.car!.year).toBe(FAKE_CAR_LISTING_SEED.car!.year);
    expect(rec!.car!.bodyType).toBe(FAKE_CAR_LISTING_SEED.car!.body_type);
    expect(rec!.car!.transmission).toBe(FAKE_CAR_LISTING_SEED.car!.transmission);
  });

  it('rejects unknown keys and cross-category shapes', async () => {
    await expect(updateListingDetails(carId, { zipCode: 'x' } as never))
      .rejects.toThrow('unknown car key "zipCode"');
    await expect(updateListingDetails(propertyId, { trim: 'GLX' } as never))
      .rejects.toThrow('unknown property key "trim"');
  });

  it('re-validates completeness when editing a LIVE listing', async () => {
    // Seeded car is published; stripping fuel breaks completeness → blocked.
    await expect(updateListingDetails(carId, { fuel: null } as never)).rejects.toThrow(
      'cannot publish incomplete listing: car fuel is required',
    );
  });

  it('refuses phone targets (legacy flow owns them)', async () => {
    const phones = await getSupabaseClient().from('v_public_inventory').select('*').order('updated_at', { ascending: false });
    const rows = phones.data as Array<{ id: string; ram: number | null }>;
    // v_public_inventory predates categories (00035 added the column without
    // touching the view), so published car/property rows can surface here.
    // Select an actual phone by its non-null ram — independent of ordering.
    const phoneId = rows.find((r) => r.ram != null)!.id;
    await expect(updateListingDetails(phoneId, { fuel: 'diesel' })).rejects.toThrow(
      'targets car/property listings only',
    );
  });
});

describe('updateListingCore — tri-state core edits', () => {
  let carId = '';

  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    ({ carId } = seedFakeListings());
  });

  it('updates price and city and keeps everything else', async () => {
    await updateListingCore(carId, { priceAmount: 19500, city: 'Aleppo' });

    const rec = await getPublicListing(carId);
    expect(rec!.price.amount).toBe(19500);
    expect(rec!.city).toBe('Aleppo');
    expect(rec!.brand).toBe(FAKE_CAR_LISTING_SEED.brand);
    expect(rec!.model).toBe(FAKE_CAR_LISTING_SEED.model);
    expect(rec!.car!.year).toBe(FAKE_CAR_LISTING_SEED.car!.year);
  });

  it('blocks core edits that would break a live listing completeness', async () => {
    await expect(updateListingCore(carId, { city: '' })).rejects.toThrow(
      'cannot publish incomplete listing: city is required',
    );
  });

  it('refuses phone targets', async () => {
    const phones = await getSupabaseClient().from('v_public_inventory').select('*').order('updated_at', { ascending: false });
    const phoneId = (phones.data as Array<{ id: string }>)[0]!.id;
    await expect(updateListingCore(phoneId, { priceAmount: 1 })).rejects.toThrow(
      'targets car/property listings only',
    );
  });
});

describe('searchListings — category-aware public search', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('isolates categories: car search never leaks phones or properties', async () => {
    const page = await searchListings({ category: 'car' });
    expect(page.total).toBe(1);
    expect(page.items.every((i) => i.category === 'car')).toBe(true);

    const props = await searchListings({ category: 'property' });
    expect(props.total).toBe(1);
    expect(props.items[0]!.propertyDetails!.transactionType).toBe('rent');
  });

  it('matches free-text across brand/model/city/district case-insensitively', async () => {
    expect((await searchListings({ category: 'car', query: 'corolla' })).total).toBe(1);
    expect((await searchListings({ category: 'car', query: 'COROLLA' })).total).toBe(1);
    expect((await searchListings({ category: 'car', query: 'damascus' })).total).toBe(1);
    expect((await searchListings({ category: 'car', query: 'mazzeh' })).total).toBe(0);
    expect((await searchListings({ category: 'property', query: 'mazzeh' })).total).toBe(1);
  });

  it('applies car filters (selects + ranges) and validates their vocabulary', async () => {
    expect((await searchListings({ category: 'car', filters: { fuel: 'benzin' } })).total).toBe(1);
    expect((await searchListings({ category: 'car', filters: { fuel: 'electric' } })).total).toBe(0);
    expect((await searchListings({ category: 'car', filters: { transmission: 'automatic' } })).total).toBe(1);
    expect((await searchListings({ category: 'car', filters: { bodyType: 'sedan' } })).total).toBe(1);
    expect((await searchListings({ category: 'car', filters: { yearMin: 2018, yearMax: 2021 } })).total).toBe(1);
    expect((await searchListings({ category: 'car', filters: { yearMin: 2021 } })).total).toBe(0);
    expect((await searchListings({ category: 'car', filters: { mileageKmMax: 60000 } })).total).toBe(1);
    expect((await searchListings({ category: 'car', filters: { mileageKmMax: 50000 } })).total).toBe(0);

    await expect(searchListings({ category: 'car', filters: { fuel: 'petrol' } }))
      .rejects.toThrow('invalid fuel filter "petrol"');
    await expect(searchListings({ category: 'car', filters: { color: 'red' } }))
      .rejects.toThrow('unknown car filter "color"');
  });

  it('applies property filters including tri-state furnished', async () => {
    expect((await searchListings({ category: 'property', filters: { propertyType: 'apartment' } })).total).toBe(1);
    expect((await searchListings({ category: 'property', filters: { propertyType: 'villa' } })).total).toBe(0);
    expect((await searchListings({ category: 'property', filters: { transactionType: 'rent' } })).total).toBe(1);
    expect((await searchListings({ category: 'property', filters: { bedroomsMin: 3 } })).total).toBe(1);
    expect((await searchListings({ category: 'property', filters: { bedroomsMin: 4 } })).total).toBe(0);
    expect((await searchListings({ category: 'property', filters: { bathroomsMin: 2 } })).total).toBe(1);
    expect((await searchListings({ category: 'property', filters: { areaM2Min: 100, areaM2Max: 150 } })).total).toBe(1);
    expect((await searchListings({ category: 'property', filters: { areaM2Max: 90 } })).total).toBe(0);
    expect((await searchListings({ category: 'property', filters: { furnished: false } })).total).toBe(1);
    expect((await searchListings({ category: 'property', filters: { furnished: true } })).total).toBe(0);

    await expect(searchListings({ category: 'property', filters: { garage: true } }))
      .rejects.toThrow('unknown property filter "garage"');
  });

  it('phone search works WITHOUT filters (P8.1 schema stays empty)', async () => {
    const page = await searchListings({ category: 'phone' });
    expect(page.total).toBe(DEFAULT_INVENTORY_SEED.length);

    await expect(searchListings({ category: 'phone', filters: { condition: 'new' } }))
      .rejects.toThrow('phone search takes no filters');
    await expect(searchListings({ category: 'phone', sort: 'newest' as never }))
      .rejects.toThrow('invalid sort "newest"');
  });

  it('sorts by cheapest / expensive / latest and paginates with an accurate total', async () => {
    const { getFakeCentralDb } = await import('../helpers/fake-central-inventory');
    const secondId = await createListing(completeCar({ price: { amount: 30000, period: 'sale' } }));
    // Guarantee a strictly newer updated_at for the 'latest' ordering probe.
    const newerStamp = new Date(Date.now() + 60_000).toISOString();
    getFakeCentralDb().rows.find((r) => r.id === secondId)!.updated_at = newerStamp;

    const cheapest = await searchListings({ category: 'car', sort: 'cheapest', limit: 1 });
    expect(cheapest.items[0]!.price.amount).toBe(18500);
    expect(cheapest.total).toBe(2);

    const expensive = await searchListings({ category: 'car', sort: 'expensive', limit: 1 });
    expect(expensive.items[0]!.price.amount).toBe(30000);

    const latest = await searchListings({ category: 'car', sort: 'latest', limit: 1 });
    expect(latest.items[0]!.id).toBe(secondId);

    const page1 = await searchListings({ category: 'car', sort: 'cheapest', limit: 1, offset: 0 });
    const page2 = await searchListings({ category: 'car', sort: 'cheapest', limit: 1, offset: 1 });
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
    expect(page2.total).toBe(2);

    // Limit clamps to the server cap without crashing.
    const clamped = await searchListings({ category: 'car', limit: 99999, offset: -5 });
    expect(clamped.total).toBe(2);
    expect(clamped.items.length).toBe(2);
  });
});

describe('Backward compatibility — phone flow is byte-compatible beside listings', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('the phone seed hydrates the legacy showroom unchanged while listings coexist', async () => {
    await bootstrapCentralInventory();

    // P8.6 INVARIANT: the legacy phone grid (getAll / inventory_management_list)
    // exposes phone rows ONLY. The car/property rows share the same table but
    // are isolated at the cache boundary (adminCache filters category==='phone'),
    // so they can never render as malformed phone cards. Every legacy phone
    // resolves byte-identically — nothing about its fields is disturbed.
    const all = InventoryService.getAll();
    expect(all.length).toBe(DEFAULT_INVENTORY_SEED.length); // phones only
    expect(all.every((r) => r.category === 'phone' || r.category === undefined)).toBe(true);
    for (const phone of DEFAULT_INVENTORY_SEED) {
      const rec = all.find((r) => r.brand === phone.brand && r.model === phone.model && r.variant === phone.variant);
      expect(rec, `${phone.brand} ${phone.model} ${phone.variant}`).toBeTruthy();
      expect(rec!.sellPrice).toBe(phone.sellPrice);
      expect(rec!.buyPrice).toBe(phone.buyPrice);
      expect(rec!.quantity).toBe(phone.quantity);
    }

    // Listings live in the same fake DB but never leak into the phone search.
    const carPage = await searchListings({ category: 'car' });
    expect(carPage.total).toBe(1);
  });

  it('a newly stocked + explicitly published phone appears ONLY in the neutral phone search', async () => {
    await bootstrapCentralInventory();

    const rec = await InventoryService.addStock(
      'Xiaomi', 'Redmi Turbo', '8/128', 1, undefined, undefined, 'purchase',
      undefined, undefined, undefined, 'New',
    );
    await InventoryService.publishRecord(rec.id, true);

    const phones = await searchListings({ category: 'phone' });
    expect(phones.total).toBe(DEFAULT_INVENTORY_SEED.length + 1);
    expect((await searchListings({ category: 'car' })).total).toBe(1);
    expect(phones.items.map((p) => `${p.brand} ${p.model}`)).toContain('Xiaomi Redmi Turbo');
  });

  it('listingFromInventoryRecord adapts phones INTO the neutral shape (never the reverse)', async () => {
    await bootstrapCentralInventory();

    const source = InventoryService.getAll()[0]!;
    const neutral = listingFromInventoryRecord(source);
    expect(neutral.category).toBe('phone');
    expect(neutral.id).toBe(source.id);
    expect(neutral.price).toEqual({ amount: source.sellPrice ?? null, period: 'sale' });
    expect(neutral.car).toBeUndefined();
    expect(neutral.propertyDetails).toBeUndefined();
    expect(neutral.conditionGroup === 'new').toBe(source.condition.toLowerCase() === 'new');
  });

  it('getPublicListing maps a phone row from the unified view without losing commercial fields', async () => {
    const phones = await getSupabaseClient().from('v_public_listings').select('*').order('updated_at', { ascending: false });
    const row = (phones.data as Array<{ id: string; category: string; phone_variant: string }>)
      .find((r) => r.category === 'phone');
    if (!row) throw new Error('no phone row found in v_public_listings');

    const rec = await getPublicListing(row.id);
    expect(rec!.category).toBe('phone');
    expect(rec!.isPublished).toBe(true);
    expect(rec!.car).toBeUndefined();
  });

  it('missing/unpublished ids resolve to null instead of throwing', async () => {
    expect(await getPublicListing('00000000-0000-0000-0000-000000000000')).toBeNull();

    const draftId = await createListing(completeCar({ publish: false }));
    expect(await getPublicListing(draftId)).toBeNull();
  });
});

// ── 00039 — listing admin surface (my_listings + soft delete) ───────────────

describe('fetchMyListings — admin read including drafts (migration 00039)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('THE GAP PROOF: an unpublished draft IS readable by the admin — the public view never sees it', async () => {
    const draftId = await createListing(completeCar({
      brand: 'Hyundai',
      model: 'Tucson',
      publish: false, // draft — invisible to listing_search / v_public_listings
    }));

    const publicPage = await searchListings({ category: 'car' });
    expect(publicPage.items.find((r) => r.id === draftId)).toBeUndefined();

    const mine = await fetchMyListings('car');
    const draft = mine.find((r) => r.id === draftId);
    expect(draft, 'draft must be visible to the admin').toBeTruthy();
    expect(draft!.isPublished).toBe(false);
    // The published fixture car is there too, flagged as published.
    expect(mine.find((r) => r.isPublished)).toBeTruthy();
  });

  it('inactive-status rows (archived) remain admin-visible but stay off the public view', async () => {
    const id = await createListing(completeCar({ publish: true }));
    await setListingPublished(id, false);
    const { getFakeCentralDb } = await import('../helpers/fake-central-inventory');
    const row = getFakeCentralDb().rows.find((r) => r.id === id)!;
    row.status = 'archived';

    expect((await searchListings({ category: 'car' })).items.find((r) => r.id === id)).toBeUndefined();
    expect((await fetchMyListings('car')).find((r) => r.id === id)).toBeTruthy();
  });

  it('rejects phone and unknown categories (boundary: one phone read path only)', async () => {
    await expect(fetchMyListings('phone' as 'car')).rejects.toThrow(
      'phones are managed through inventory_management_list',
    );
    await expect(fetchMyListings('boat' as 'car')).rejects.toThrow('unknown category "boat": use car|property');
  });

  it('requires the admin gate like every other listing mutation', async () => {
    setFakeCentralAdminMode(false);
    await expect(fetchMyListings('car')).rejects.toThrow('admin role required');
    setFakeCentralAdminMode(true);
  });

  it('maps rows into the neutral record with real is_published values (no silent fallback)', async () => {
    const mine = await fetchMyListings('property');
    expect(mine.length).toBe(1);
    expect(mine[0]!.category).toBe('property');
    expect(mine[0]!.isPublished).toBe(true);
    expect(mine[0]!.propertyDetails).toBeTruthy();
  });
});

describe('deleteListing — SOFT delete contract (migration 00039)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('marks status=deleted AND keeps the physical row (never a hard DELETE)', async () => {
    const { carId } = seedFakeListings();
    await deleteListing(carId);

    const { getFakeCentralDb } = await import('../helpers/fake-central-inventory');
    const row = getFakeCentralDb().rows.find((r) => r.id === carId);
    expect(row, 'row must physically remain').toBeTruthy();
    expect(row!.status).toBe('deleted');

    // Every reader excludes it.
    expect((await fetchMyListings('car')).find((r) => r.id === carId)).toBeUndefined();
    expect((await searchListings({ category: 'car' })).items.find((r) => r.id === carId)).toBeUndefined();
  });

  it('deleting a phone is rejected — phones keep their legacy lifecycle RPCs', async () => {
    const { getFakeCentralDb } = await import('../helpers/fake-central-inventory');
    const phoneRow = getFakeCentralDb().rows.find((r) => !r.category)!;
    await expect(deleteListing(phoneRow.id)).rejects.toThrow('listing_delete targets car/property listings only');
    expect(phoneRow.status).not.toBe('deleted');
  });

  it('unknown id raises a not-found error', async () => {
    await expect(deleteListing('00000000-0000-0000-0000-000000000000')).rejects.toThrow('not found');
  });

  it('is idempotent by UPDATE semantics (deleting twice succeeds)', async () => {
    const { propertyId } = seedFakeListings();
    await deleteListing(propertyId);
    await expect(deleteListing(propertyId)).resolves.toBeUndefined();
  });
});

/**
 * P8.6 — Public media pipeline + projection contract (D2/D4/D5).
 *
 * Proves the fake mirrors the live SQL image aggregation (ORDER BY position,
 * created_at), that the public row shape never carries internal fields, that
 * malformed detail projections are rejected loudly (strict mapper), and that
 * inventory_images reads mirror the RLS visibility rule.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPublicListing,
  listingImageUrl,
  mapPublicListingRow,
  createListing,
  setListingPublished,
  type CreateCarListingInput,
} from '../../services/listing-service';
import { resetCentralInventoryState } from '../../services/inventory-central-service';
import { getSupabaseClient } from '../../core/supabase/client';
import {
  fakeAddImage,
  getFakeCentralDb,
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
} from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

let ids: { carId: string; propertyId: string };

beforeEach(() => {
  resetFakeCentralDb();
  resetCentralInventoryState();
  seedFakeCentralDb();
  ids = seedFakeListings();
});

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

describe('P8.6 media pipeline through the public projection', () => {
  it('car seed exposes two images ordered by position (cover first)', async () => {
    const rec = await getPublicListing(ids.carId);
    expect(rec!.images).toEqual([`${ids.carId}/seed-exterior.jpg`, `${ids.carId}/seed-interior.jpg`]);
  });

  it('property seed exposes its single cover image', async () => {
    const rec = await getPublicListing(ids.propertyId);
    expect(rec!.images).toEqual([`${ids.propertyId}/seed-front.jpg`]);
  });

  it('listingImageUrl composes the public bucket URL; empty path stays empty', () => {
    expect(listingImageUrl(`${ids.carId}/seed-exterior.jpg`)).toBe(
      `https://fake-storage.test/inventory-images/${ids.carId}/seed-exterior.jpg`,
    );
    expect(listingImageUrl('')).toBe('');
  });

  it('appended images keep position order; ties fall back to created_at', async () => {
    fakeAddImage(ids.carId, `${ids.carId}/extra.jpg`, 1); // same position as cover → newer created_at wins the later slot
    const rec = await getPublicListing(ids.carId);
    expect(rec!.images[0]).toBe(`${ids.carId}/seed-exterior.jpg`);
    expect(rec!.images).toContain(`${ids.carId}/extra.jpg`);
    expect(rec!.images.length).toBe(3);
  });

  it('duplicate paths pass through untouched at the projection level (no silent dedupe)', async () => {
    fakeAddImage(ids.carId, `${ids.carId}/seed-exterior.jpg`, 3);
    const rec = await getPublicListing(ids.carId);
    expect(rec!.images.filter((p) => p === `${ids.carId}/seed-exterior.jpg`).length).toBe(2);
  });

  it('inventory_add_image rejects empty/whitespace paths loudly', () => {
    expect(() => fakeAddImage(ids.carId, '   ')).toThrow(/image path is required/);
  });
});

describe('P8.6 inventory_images visibility (RLS mirror)', () => {
  it('hides rows of invisible items until they become visible', async () => {
    const draftId = await createListing(completeCar({ publish: false }));
    fakeAddImage(draftId, `${draftId}/hidden.jpg`, 1);

    const before = await getSupabaseClient().from('inventory_images').select().order('created_at');
    expect((before.data as Array<{ inventory_id: string }>).some((r) => r.inventory_id === draftId)).toBe(false);

    await setListingPublished(draftId, true);
    const after = await getSupabaseClient().from('inventory_images').select().order('created_at');
    expect((after.data as Array<{ inventory_id: string }>).some((r) => r.inventory_id === draftId)).toBe(true);
  });
});

describe('P8.6 strict mapping (D5) — corrupt rows rejected, never repaired', () => {
  function carRowWithout(field: 'condition'): Record<string, unknown> {
    return {
      id: 'car-1',
      category: 'car',
      brand: 'Kia',
      model: 'Sportage',
      color: null,
      quantity: 1,
      status: 'in_stock',
      price: 22000,
      price_period: 'sale',
      code: null,
      warranty: null,
      city: 'Damascus',
      description: null,
      images: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      car_condition_state: field === 'condition' ? null : 'used',
    };
  }

  it('car row without car_details projection throws', () => {
    expect(() => mapPublicListingRow(carRowWithout('condition') as never)).toThrow(
      /\[listings\] car car-1: missing car_condition_state projection/,
    );
  });

  it('property row missing property_type/transaction_type throws', () => {
    const row = {
      id: 'prop-1',
      category: 'property',
      property_type: null,
      transaction_type: null,
      property_condition_state: 'good',
    };
    expect(() => mapPublicListingRow(row as never)).toThrow(
      /\[listings\] property prop-1: missing property_type projection/,
    );
  });

  it('phone rows map without touching car/property branches (no false rejection)', () => {
    const rec = mapPublicListingRow({
      id: 'ph-1',
      category: 'phone',
      brand: 'Apple',
      model: 'iPhone 15',
      quantity: 1,
      status: 'in_stock',
      price: 90000,
      price_period: 'sale',
      images: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as never);
    expect(rec.category).toBe('phone');
    expect(rec.car).toBeUndefined();
    expect(rec.propertyDetails).toBeUndefined();
  });
});

describe('P8.6 public projection leak-proof', () => {
  it('v_public_listings exposes EXACTLY the public columns — never internals', async () => {
    const res = await getSupabaseClient().from('v_public_listings').select().order('updated_at');
    expect((res.data as unknown[]).length).toBeGreaterThan(0);
    const keys = Object.keys(res.data![0] as object).sort();
    expect(keys).toEqual([
      'brand',
      'car_body_type',
      'car_condition_state',
      'car_engine_cc',
      'car_fuel',
      'car_mileage_km',
      'car_transmission',
      'car_trim',
      'car_year',
      'category',
      'city',
      'code',
      'color',
      'created_at',
      'description',
      'id',
      'images',
      'model',
      'phone_battery_health',
      'phone_condition',
      'phone_ram',
      'phone_storage',
      'phone_variant',
      'price',
      'price_period',
      'produce_grade',
      'produce_origin',
      'property_area_m2',
      'property_bathrooms',
      'property_bedrooms',
      'property_condition_state',
      'property_district',
      'property_floor',
      'property_furnished',
      'property_type',
      'quantity',
      'status',
      'transaction_type',
      'unit',
      'updated_at',
      'warranty',
    ]);
    for (const forbidden of ['model_id', 'buy_price', 'total_purchased', 'total_sold', 'source_label', 'is_published']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('image paths are bucket-relative (<recordId>/<token>.jpg), never absolute URLs', async () => {
    const rec = await getPublicListing(ids.carId);
    for (const p of rec!.images) {
      expect(p.startsWith('http')).toBe(false);
      expect(p).toMatch(new RegExp(`^${ids.carId}/[\\w.-]+\\.jpg$`));
    }
  });

  it('fake db keeps seeded images attached to their records after resets cycle', () => {
    expect(getFakeCentralDb().imagePathsFor(ids.carId)).toEqual([
      `${ids.carId}/seed-exterior.jpg`,
      `${ids.carId}/seed-interior.jpg`,
    ]);
  });
});

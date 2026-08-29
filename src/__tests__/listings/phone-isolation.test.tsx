/**
 * P8.6 — Phone-isolation regression (admin + public + board).
 *
 * Car/property listings live in the SAME inventory_items table as phones
 * (migration 00035 introduces the `category` discriminator). The invariant:
 *
 *     Admin Phone Grid     → phone rows only
 *     Admin Car views      → car rows only
 *     Admin Property views → property rows only
 *
 * The authoritative correctness boundary is the inventory service cache
 * (category==='phone' filter), mirroring migration 00040 for the public view.
 * This suite proves that even when a published car AND a published property
 * exist in the substrate, they can NEVER leak into the phone-shaped admin
 * grid, the neutral phone read model, or `loadAdminListingsBoard().phones`.
 *
 * The UI-level filter in CatalogInventoryScreen is a DEFENSIVE layer only —
 * the service boundary is what makes the invariant hold.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import {
  bootstrapCentralInventory,
  resetCentralInventoryState,
  getCachedAdmin,
  getCachedPublic,
} from '../../services/inventory-central-service';
import { InventoryService } from '../../services/inventory-service';
import { loadAdminListingsBoard } from '../../domains/listings/adminBoard';
import { listingFromInventoryRecord } from '../../services/listing-service';
import { CatalogInventoryScreen } from '../../screens/inventory/CatalogInventoryScreen';
import {
  FAKE_CAR_LISTING_SEED,
  FAKE_PROPERTY_LISTING_SEED,
  getFakeCentralDb,
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
} from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  resetFakeCentralDb();
  resetCentralInventoryState();
  seedFakeCentralDb(); // phones only (legacy, no category)
  seedFakeListings();  // exactly ONE published car + ONE published property
});

describe('Admin phone grid isolation (service boundary)', () => {
  it('seeds the substrate with a published car AND property sharing the table', () => {
    const cats = new Set(getFakeCentralDb().rows.map((r) => r.category ?? 'phone'));
    expect([...cats].sort()).toEqual(['car', 'phone', 'property']);
    getFakeCentralDb().rows
      .filter((r) => r.category !== 'phone')
      .forEach((r) => expect(r.is_published).toBe(true));
  });

  it('getCachedAdmin() exposes ONLY phones even though car/property rows exist', async () => {
    await bootstrapCentralInventory();
    const admin = getCachedAdmin();
    const carsProps = admin.filter((r) => r.category !== 'phone');
    expect(carsProps).toHaveLength(0);
    // Every remaining row is either a legacy phone or explicitly phone.
    expect(admin.every((r) => r.category === 'phone' || r.category === undefined)).toBe(true);
    // The phone rows are the seeded phones (not silently dropped).
    expect(admin.length).toBe(getFakeCentralDb().rows.filter((r) => (r.category ?? 'phone') === 'phone').length);
  });

  it('InventoryService.getAll() (the admin phone grid read) never returns car/property rows', async () => {
    await bootstrapCentralInventory();
    const all = InventoryService.getAll();
    expect(all.some((r) => r.category === 'car' || r.category === 'property')).toBe(false);
    // Phones are still there and byte-compatible as before.
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => typeof r.brand === 'string' && typeof r.model === 'string')).toBe(true);
  });

  it('loadAdminListingsBoard() buckets correctly — phones/cars/properties never cross-contain', async () => {
    await bootstrapCentralInventory();
    const board = await loadAdminListingsBoard();
    // Phones bucket: phone-only (never a car/property).
    expect(board.phones.every((r) => r.category === 'phone')).toBe(true);
    // Cars bucket: exactly the seeded car.
    expect(board.cars.map((r) => r.category)).toEqual(['car']);
    expect(board.cars[0]!.brand).toBe(FAKE_CAR_LISTING_SEED.brand);
    expect(board.cars[0]!.model).toBe(FAKE_CAR_LISTING_SEED.model);
    // Properties bucket: exactly the seeded property.
    expect(board.properties.map((r) => r.category)).toEqual(['property']);
    expect(board.properties[0]!.model).toBe(FAKE_PROPERTY_LISTING_SEED.model);
    // No row appears in two buckets.
    const ids = [...board.phones, ...board.cars, ...board.properties].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the neutral adapter maps a legacy phone (no category) to category=phone', () => {
    const phone = getFakeCentralDb().rows.find((r) => !r.category)!;
    const listing = listingFromInventoryRecord({
      id: phone.id, modelId: phone.model_id, brand: phone.brand, model: phone.model,
      variant: phone.variant, ram: '', storage: '', condition: phone.condition,
      quantity: phone.quantity, createdAt: phone.created_at, updatedAt: phone.updated_at,
      totalPurchased: 1, totalSold: 0,
    });
    expect(listing.category).toBe('phone');
  });
});

describe('Public phone view isolation', () => {
  it('getCachedPublic() is phone-only even though a car and property are published', async () => {
    await bootstrapCentralInventory();
    const pub = getCachedPublic();
    expect(pub.some((r) => r.category === 'car' || r.category === 'property')).toBe(false);
    // The published phones are still present.
    expect(pub.length).toBe(getFakeCentralDb().rows.filter((r) => (r.category ?? 'phone') === 'phone').length);
  });
});

describe('Admin phone grid UI (defensive layer)', () => {
  const phonesChip = () =>
    screen.getAllByRole('button').find((b) => b.textContent?.startsWith('الهواتف'))!;

  it('renders the seeded phone rows and never a car/property row in the phone grid', async () => {
    await bootstrapCentralInventory();
    render(<CatalogInventoryScreen />);
    await waitFor(() => expect(screen.getAllByText(/Galaxy A54/).length).toBeGreaterThan(0));
    // Isolate the PHONE grid (hides the car/property sections that legitimately
    // render their own rows in the All view).
    fireEvent.click(phonesChip());
    expect(screen.queryByText('سيارة')).toBeNull();
    expect(screen.queryByText('عقار')).toBeNull();
    expect(screen.queryByText(`${FAKE_CAR_LISTING_SEED.brand} ${FAKE_CAR_LISTING_SEED.model}`)).toBeNull();
    expect(screen.queryByText(FAKE_PROPERTY_LISTING_SEED.model)).toBeNull();
    // The seeded phones are still there.
    expect(screen.getAllByText(/Galaxy A54/).length).toBeGreaterThan(0);
  });

  it('search on the phone grid cannot surface car/property rows', async () => {
    await bootstrapCentralInventory();
    render(<CatalogInventoryScreen />);
    await waitFor(() => expect(screen.getAllByText(/Galaxy A54/).length).toBeGreaterThan(0));
    fireEvent.click(phonesChip());
    const input = screen.getByPlaceholderText('ابحث في المخزون...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: FAKE_CAR_LISTING_SEED.brand } });
    expect(screen.queryAllByText(new RegExp(FAKE_CAR_LISTING_SEED.model)).length).toBe(0);
    expect(screen.queryAllByText(new RegExp(FAKE_PROPERTY_LISTING_SEED.model)).length).toBe(0);
  });
});

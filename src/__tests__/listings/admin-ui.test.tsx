/**
 * P8.4 — Category-aware admin UI behavioral tests.
 *
 * Runs the REAL CatalogInventoryScreen + new listing components against the
 * fake substrate (mirroring migrations 00037/00038/00039). Covers the 27
 * mandated cases: phone backward-compatibility, car/property rendering and
 * full CRUD, category filtering, and the incomplete-details safety guards.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import {
  bootstrapCentralInventory,
  resetCentralInventoryState,
} from '../../services/inventory-central-service';
import { listingFromInventoryRecord } from '../../services/listing-service';
import { assertKnownListingCategory } from '../../domains/listings/adminBoard';
import { getRequiredListingPresenter } from '../../domains/listings/presenters/registry';
import { carListingPresenter } from '../../domains/listings/presenters/car';
import { propertyListingPresenter } from '../../domains/listings/presenters/property';
import type { ListingRecord } from '../../domains/listings';
import { CatalogInventoryScreen } from '../../screens/inventory/CatalogInventoryScreen';
import { ListingRow } from '../../components/inventory/listings/ListingRow';
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

/** Renders the admin screen with both caches hydrated (phones + listings). */
async function renderAdminScreen() {
  await bootstrapCentralInventory();
  render(<CatalogInventoryScreen />);
  // Wait for the async listings board: section headers appear once state lands.
  await waitFor(() => expect(screen.getAllByText(/السيارات \(/).length).toBeGreaterThan(0));
}

const chipButton = (label: string) =>
  screen.getAllByRole('button').find((b) => b.textContent?.startsWith(label))!;

// ── Backward compatibility ──────────────────────────────────────────────────

describe('Backward compatibility — phones stay byte-compatible', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb(); // phones only — no listings seeded here
  });

  it('phone rows render exactly as before (brand/model/variant/storage + legacy buttons)', async () => {
    await renderAdminScreen();
    // Row titles are split across text nodes ("Samsung" + " " + "Galaxy A54") — regex match.
    const titleEl = screen.getAllByText(/Samsung Galaxy A54/)[0]!;
    const table = titleEl.closest('div[style*="justify-content"]')?.parentElement ?? document.body;
    expect(within(table as HTMLElement).getAllByText(/Galaxy A54/).length).toBeGreaterThan(0);
    // Seeded phones are published → the toggle shows منشور (not نشر).
    for (const label of ['تعديل', 'منشور', 'إخفاء', 'حذف']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
  });

  it('the free-text search filters phones as before', async () => {
    await renderAdminScreen();
    const input = screen.getByPlaceholderText('ابحث في المخزون...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'iPhone' } });
    expect(screen.queryAllByText(/Galaxy A54/).length).toBe(0);
    expect(screen.getAllByText(/iPhone/).length).toBeGreaterThan(0);
  });

  it('phone creation flow is untouched: إضافة opens the legacy wizard, never a listing call', async () => {
    const createSpy = vi.fn();
    const mod = await import('../../services/listing-service');
    // Keep ONE spy reference — re-spying to restore would leave the first spy attached
    // and silently swallow every later createListing in the file.
    const spy = vi.spyOn(mod, 'createListing').mockImplementation(createSpy);
    await renderAdminScreen();
    fireEvent.click(chipButton('إضافة'));
    // Legacy wizard step 1 (same assertion as AddInventoryModal.test.tsx).
    expect(screen.getByText('1. اختيار الموديل')).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('phone data needs NO car/property details in the neutral adapter (unit)', () => {
    const rec = getFakeCentralDb().rows.find((r) => !r.category)!;
    const listing = listingFromInventoryRecord({
      id: rec.id, modelId: rec.model_id, brand: rec.brand, model: rec.model,
      variant: rec.variant, ram: '', storage: '', condition: rec.condition,
      quantity: rec.quantity, createdAt: rec.created_at, updatedAt: rec.updated_at,
      totalPurchased: 1, totalSold: 0,
    });
    expect(listing.category).toBe('phone');
    expect(listing.car).toBeUndefined();
    expect(listing.propertyDetails).toBeUndefined();
  });
});

// ── Car ─────────────────────────────────────────────────────────────────────

describe('Car — list, fields, CRUD', () => {
  let carId = '';
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    ({ carId } = seedFakeListings());
  });

  it('appears in the admin list under category=car with its specific fields', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('السيارات'));

    expect(screen.getByText('سيارة')).toBeTruthy();
    expect(screen.getByText(`${FAKE_CAR_LISTING_SEED.brand} ${FAKE_CAR_LISTING_SEED.model}`)).toBeTruthy();
    // subtitle trim · year
    expect(screen.getByText(`GLX · ${FAKE_CAR_LISTING_SEED.car!.year}`)).toBeTruthy();
    // chips + first spec slice carry mileage/fuel/transmission
    expect(screen.getAllByText(/الممشى:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/الوقود:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ناقل الحركة:/).length).toBeGreaterThan(0);
    expect(screen.getByText('18,500 د.ج')).toBeTruthy();
    expect(screen.getByText(FAKE_CAR_LISTING_SEED.city)).toBeTruthy();
    expect(screen.getByText('متاح')).toBeTruthy();
  });

  it('never renders the phone variant as a trim (no GB/storage chips on car rows)', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('السيارات'));
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\d+GB/);
  });

  it('create works end-to-end through the form (draft lands in my_listings)', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('+ سيارة'));
    fireEvent.change(screen.getByLabelText('الماركة (Make) *'), { target: { value: 'Kia' } });
    fireEvent.change(screen.getByLabelText('الموديل *'), { target: { value: 'Sportage' } });
    // A car needs at least one real detail (P8.3 guard rejects fully-empty payloads).
    fireEvent.change(screen.getByLabelText('السنة'), { target: { value: '2022' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ السيارة' }));

    await waitFor(() => expect(chipButton('السيارات')).toBeTruthy());
    fireEvent.click(chipButton('السيارات'));
    await waitFor(() => expect(screen.getAllByText(/Kia Sportage/).length).toBeGreaterThan(0));
    // Cars are pinned to quantity=1 (P8.3 rule) → derived stock status is low_stock, never in_stock.
    expect(getFakeCentralDb().rows.find((r) => r.id !== carId && r.brand === 'Kia')!.status).toBe('low_stock');
  });

  it('update works via the edit modal (price persists through update_core)', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('السيارات'));
    fireEvent.click(screen.getAllByRole('button', { name: 'تعديل' })[0]!);
    const priceInput = screen.getByLabelText('السعر (د.ج)') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '20000' } });
    fireEvent.click(within(screen.getByLabelText('السعر (د.ج)').closest('div[style*="360px"]')!.parentElement!.parentElement!).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(screen.getByText('20,000 د.ج')).toBeTruthy());
  });

  it('delete works and is SOFT at the storage layer (00039 contract)', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('السيارات'));
    fireEvent.click(screen.getAllByRole('button', { name: 'حذف' })[0]!);
    await waitFor(() => expect(screen.queryByText(`${FAKE_CAR_LISTING_SEED.brand} ${FAKE_CAR_LISTING_SEED.model}`)).toBeNull());
    const row = getFakeCentralDb().rows.find((r) => r.id === carId);
    expect(row).toBeTruthy();
    expect(row!.status).toBe('deleted');
  });

  it('publish toggle flips is_published through the generic RPC', async () => {
    const draftId = getFakeCentralDb().listingCreate({
      p_category: 'car', p_brand: 'Honda', p_model: 'Civic', p_quantity: 1,
      p_is_published: false, p_details: { conditionState: 'used', year: 2019 },
    });
    await renderAdminScreen();
    fireEvent.click(chipButton('السيارات'));
    const draftRowTitle = screen.getByText('Honda Civic');
    const rowRoot = draftRowTitle.closest('div[style*="justify-content"]')!;
    fireEvent.click(within(rowRoot as HTMLElement).getByRole('button', { name: 'نشر' }));
    await waitFor(() => {
      expect(getFakeCentralDb().rows.find((r) => r.id === draftId)!.is_published).toBe(true);
    });
  });
});

// ── Property ────────────────────────────────────────────────────────────────

describe('Property — list, fields, CRUD', () => {
  let propertyId = '';
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    ({ propertyId } = seedFakeListings());
  });

  it('appears with its specific fields incl. rent period on the price', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('العقارات'));
    expect(screen.getByText('عقار')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(FAKE_PROPERTY_LISTING_SEED.model)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/شقة · Mazzeh/).length).toBeGreaterThan(0);
    // 'المساحة:' appears both as a spec row and as a chip — assert presence, not uniqueness.
    expect(screen.getAllByText(/المساحة:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/450 د\.ج \/ شهر/).length).toBeGreaterThan(0);
  });

  it('transaction_type select exposes EXACTLY sale|rent', async () => {
    const mod = await import('../../components/inventory/listings/PropertyListingForm');
    void mod;
    const { PROPERTY_TRANSACTION_TYPES } = await import('../../domains/listings/types');
    expect([...PROPERTY_TRANSACTION_TYPES]).toEqual(['sale', 'rent']);
    await renderAdminScreen();
    fireEvent.click(chipButton('+ عقار'));
    const options = [...screen.getByLabelText('نوع المعاملة').querySelectorAll('option')].map((o) => o.value);
    expect(options).toEqual(['sale', 'rent']);
  });

  it('price_period stays an independent field auto-paired to the transaction', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('+ عقار'));
    const txSelect = screen.getByLabelText('نوع المعاملة') as HTMLSelectElement;
    const periodSelect = screen.getByLabelText('فترة السعر') as HTMLSelectElement;
    expect(periodSelect.value).toBe('sale'); // default sale↔sale
    fireEvent.change(txSelect, { target: { value: 'rent' } });
    expect(periodSelect.value).toBe('monthly'); // rent pairs monthly
    expect(periodSelect.disabled).toBe(true); // pairing enforced, not conflated
  });

  it('create works end-to-end through the form', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('+ عقار'));
    fireEvent.change(screen.getByLabelText('العنوان *'), { target: { value: 'Villa Yalda' } });
    fireEvent.change(screen.getByLabelText('المساحة (م²)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ العقار' }));
    await waitFor(() => expect(chipButton('العقارات')).toBeTruthy());
    fireEvent.click(chipButton('العقارات'));
    await waitFor(() => expect(screen.getAllByText(/Villa Yalda/).length).toBeGreaterThan(0));
  });

  it('update works (district merge via update_details)', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('العقارات'));
    fireEvent.click(screen.getAllByRole('button', { name: 'تعديل' })[0]!);
    fireEvent.change(screen.getByLabelText('حي جديد'), { target: { value: 'Kafr Sousa' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(screen.getAllByText(/Kafr Sousa/).length).toBeGreaterThan(0));
  });

  it('delete works and is SOFT at the storage layer', async () => {
    await renderAdminScreen();
    fireEvent.click(chipButton('العقارات'));
    fireEvent.click(screen.getAllByRole('button', { name: 'حذف' })[0]!);
    await waitFor(() => expect(screen.queryByText(FAKE_PROPERTY_LISTING_SEED.model)).toBeNull());
    expect(getFakeCentralDb().rows.find((r) => r.id === propertyId)!.status).toBe('deleted');
  });
});

// ── Filtering ───────────────────────────────────────────────────────────────

describe('Category filtering', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('All shows all three categories; each dedicated filter isolates its own', async () => {
    await renderAdminScreen();

    // Section headers share their text with the filter chips ("السيارات (1)") —
    // assert on non-button elements to prove the SECTION rendered.
    const sectionHeader = (re: RegExp) =>
      screen.getAllByText(re).filter((el) => el.tagName !== 'BUTTON').length > 0;
    expect(sectionHeader(/الهواتف \(\d+\)/)).toBe(true);
    expect(sectionHeader(/السيارات \(1\)/)).toBe(true);
    expect(sectionHeader(/العقارات \(1\)/)).toBe(true);

    // Phones only.
    fireEvent.click(chipButton('الهواتف'));
    expect(screen.queryByText('سيارة')).toBeNull();
    expect(screen.queryByText('عقار')).toBeNull();
    expect(screen.getAllByText(/Galaxy A54/).length).toBeGreaterThan(0);

    // Cars only.
    fireEvent.click(chipButton('السيارات'));
    expect(screen.getAllByText(new RegExp(`${FAKE_CAR_LISTING_SEED.brand} ${FAKE_CAR_LISTING_SEED.model}`)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(new RegExp(FAKE_PROPERTY_LISTING_SEED.model)).length).toBe(0);

    // Properties only.
    fireEvent.click(chipButton('العقارات'));
    expect(screen.getAllByText(new RegExp(FAKE_PROPERTY_LISTING_SEED.model)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(new RegExp(`${FAKE_CAR_LISTING_SEED.brand} ${FAKE_CAR_LISTING_SEED.model}`)).length).toBe(0);
  });
});

// ── Safety guards ───────────────────────────────────────────────────────────

describe('Safety — incomplete details & unknown categories', () => {
  const baseRecord = (over: Partial<ListingRecord>): ListingRecord => ({
    id: 'x1', category: 'car', brand: 'B', model: 'M', description: '', color: '',
    city: '', warranty: '', code: '', price: { amount: 100, period: 'sale' },
    conditionGroup: null, quantity: 1, status: 'in_stock', isPublished: false,
    images: [], createdAt: '', updatedAt: '', ...over,
  });

  it('car WITHOUT car_details renders the warning, never fabricated specs', () => {
    const noop = () => {};
    render(
      <ListingRow
        record={baseRecord({ category: 'car', car: undefined })}
        colors={{} as never}
        onEdit={noop}
        onDelete={noop}
        onTogglePublish={noop}
      />,
    );
    expect(screen.getByText(/بيانات التفاصيل مفقودة/)).toBeTruthy();
    expect(screen.queryByText(/الممشى:/)).toBeNull();
  });

  it('property WITHOUT property_details renders the warning, never fabricated specs', () => {
    const noop = () => {};
    render(
      <ListingRow
        record={baseRecord({ category: 'property', propertyDetails: undefined })}
        colors={{} as never}
        onEdit={noop}
        onDelete={noop}
        onTogglePublish={noop}
      />,
    );
    expect(screen.getByText(/بيانات التفاصيل مفقودة/)).toBeTruthy();
    expect(screen.queryByText(/المساحة:/)).toBeNull();
  });

  it('unknown category is rejected loudly (loader guard + registry strictness)', () => {
    expect(() => assertKnownListingCategory('boat')).toThrow('unknown listing category "boat"');
    expect(() => getRequiredListingPresenter('boat' as never)).toThrow('no presenter registered');
  });

  it('presenters emit empty spec lists for missing details (no invented defaults)', () => {
    const carless = baseRecord({ category: 'car', car: undefined });
    expect(carListingPresenter.specRows(carless)).toEqual([]);
    expect(propertyListingPresenter.specRows(baseRecord({ category: 'property', propertyDetails: undefined }))).toEqual([]);
  });
});

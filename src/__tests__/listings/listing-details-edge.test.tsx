/**
 * P8.6 — ListingDetailsScreen edge cases (D1 + visibility).
 *
 * Deep links can carry ANY id. Pins: unpublished → not-found, soft-deleted →
 * not-found, phone ids → not-found (guard until the P8.7 phone presenter),
 * malformed uuid-format ids → not-found under the fake, and internal fields
 * (code/warranty/quantity/status) never leak into the details DOM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { CartProvider } from '../../core/cart/CartContext';
import { WhatsAppProvider } from '../../providers/WhatsAppProvider';
import { ListingDetailsScreen } from '../../screens/showroom/ListingDetailsScreen';
import {
  createListing,
  deleteListing,
  type CreateCarListingInput,
} from '../../services/listing-service';
import { getSupabaseClient } from '../../core/supabase/client';
import {
  getFakeCentralDb,
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
} from '../helpers/fake-central-inventory';
import { updateSettings } from '../../core/config/settings';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

afterEach(() => {
  cleanup();
  // Language is a module-global setting: restore the jsdom default so later
  // test files in the single vitest fork are not polluted with Arabic.
  updateSettings({ language: 'en' });
});

function DeepLinkProbe({ id }: { id?: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'showroom', params: {} });
    if (id) dispatch({ type: 'NAVIGATE', screen: 'listing-details', params: { id } });
  }, [dispatch, id]);
  return <ListingDetailsScreen />;
}

function renderDetails(id?: string) {
  updateSettings({ language: 'ar' });
  return render(
    <ThemeProvider>
      <TranslationProvider>
        <AppProvider>
          <CartProvider>
            <WhatsAppProvider>
              <DeepLinkProbe id={id} />
            </WhatsAppProvider>
          </CartProvider>
        </AppProvider>
      </TranslationProvider>
    </ThemeProvider>,
  );
}

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

let ids: { carId: string; propertyId: string };

beforeEach(() => {
  resetFakeCentralDb();
  seedFakeCentralDb();
  ids = seedFakeListings();
});

describe('P8.6 details — invisible records degrade to ProductNotFound', () => {
  it('unpublished draft id renders ProductNotFound', async () => {
    const draftId = await createListing(completeCar({ publish: false }));
    renderDetails(draftId);
    await waitFor(() => expect(screen.getByText('هذا الإعلان غير متوفر')).toBeTruthy());
  });

  it('soft-deleted id renders ProductNotFound (never the record)', async () => {
    await deleteListing(ids.carId);
    renderDetails(ids.carId);
    await waitFor(() => expect(screen.getByText('هذا الإعلان غير متوفر')).toBeTruthy());
    expect(screen.queryByText('Toyota Corolla GLX')).toBeNull();
  });

  it('malformed uuid-format id degrades to ProductNotFound under the fake', async () => {
    // NOTE: against live PostgREST a non-uuid id raises a cast error and the
    // screen shows the error alert instead; both are loud-and-graceful.
    renderDetails('garbage-id');
    await waitFor(() => expect(screen.getByText('هذا الإعلان غير متوفر')).toBeTruthy());
  });
});

describe('P8.6 D1 — phone deep links never crash the details surface', () => {
  it('a published PHONE id renders ProductNotFound, not ErrorBoundary/presenter error', async () => {
    const phones = (
      await getSupabaseClient().from('v_public_inventory').select().order('updated_at')
    ).data as Array<{ id: string; ram: string | null }>;
    const phoneId = phones.find((p) => p.ram != null)!.id;

    const { container } = renderDetails(phoneId);
    await waitFor(() => expect(screen.getByText('هذا الإعلان غير متوفر')).toBeTruthy());

    // No presenter crash, no fetch error alert, no React blow-up.
    expect(screen.queryByText(/تعذر تحميل الإعلان/)).toBeNull();
    expect(container.textContent).not.toContain('ListingPresenterError');
  });
});

describe('P8.6 details — internal fields never reach the DOM', () => {
  it('code/warranty stay server-side metadata even when populated', async () => {
    // Seed admin-only metadata directly on the fake row (mirrors what only
    // the admin RPCs would write); none of it may appear in the public DOM.
    const row = getFakeCentralDb().rows.find((r) => r.id === ids.carId)!;
    row.code = 'LEAK-CODE-99';
    row.warranty = 'LEAK-WARRANTY';

    renderDetails(ids.carId);
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy()); // control: page rendered
    expect(screen.queryByText('LEAK-CODE-99')).toBeNull();
    expect(screen.queryByText(/LEAK-WARRANTY/)).toBeNull();
  });
});

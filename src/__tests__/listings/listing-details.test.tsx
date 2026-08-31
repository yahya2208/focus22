/**
 * P8.5/B1 — ListingDetailsScreen behavioral tests (`#/listing-details?id=`).
 *
 * Data path under test: getPublicListing(id) → v_public_listings ONLY.
 * Scope pins verified here: presenter spec rows render; B1 contact CTA (via
 * WhatsApp mediator, cars + properties) and Request Cart add-to-cart CTA
 * (cars/produce — properties stay contact/lead only); no view counter; BACK
 * returns to the showroom surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { CartProvider } from '../../core/cart/CartContext';
import { WhatsAppProvider } from '../../providers/WhatsAppProvider';
import { ListingDetailsScreen } from '../../screens/showroom/ListingDetailsScreen';
import {
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
} from '../helpers/fake-central-inventory';
import { updateSettings } from '../../core/config/settings';
import { getBackMatrixRow } from '../../core/navigation/back-matrix';
import { EDGES } from '../../core/navigation/reachability';

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

/** Mounts the details screen exactly like a deep link would: NAVIGATE + params. */
function DeepLinkProbe({ id }: { id?: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    // Seed the stack like a real session (home → showroom → details) so BACK
    // exercises the production pop semantics.
    dispatch({ type: 'NAVIGATE', screen: 'showroom', params: {} });
    if (id) dispatch({ type: 'NAVIGATE', screen: 'listing-details', params: { id } });
  }, [dispatch, id]);
  return <ListingDetailsScreen />;
}

/** Exposes the live route so BACK behavior can be asserted without App.tsx. */
function RouteProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="route" data-screen={current} />;
}

function renderDetails(id?: string) {
  updateSettings({ language: 'ar' });
  return render(
    <ThemeProvider>
      <TranslationProvider>
        <AppProvider>
          <CartProvider>
            <WhatsAppProvider>
              <RouteProbe />
              <DeepLinkProbe id={id} />
            </WhatsAppProvider>
          </CartProvider>
        </AppProvider>
      </TranslationProvider>
    </ThemeProvider>,
  );
}

let ids: { carId: string; propertyId: string } = { carId: '', propertyId: '' };

describe('P8.5 listing-details — valid records', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    seedFakeCentralDb();
    ids = seedFakeListings();
  });

  it('car: gallery + card + full presenter spec rows, sale price WITHOUT / شهر', async () => {
    renderDetails(ids.carId);
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());
    expect(screen.getByText('السيارات')).toBeTruthy(); // category badge
    expect(screen.getByText('18,500 د.ج')).toBeTruthy();
    expect(screen.queryByText(/\/ شهر/)).toBeNull();
    expect(screen.getByText('One owner, full service history.')).toBeTruthy();
    for (const value of ['GLX', '2020', '54,000 كم', 'بنزين', 'أوتوماتيك', 'سيدان', '1800 cc', 'مستعملة']) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.getByText('Damascus')).toBeTruthy(); // city line on the card
  });

  it('property: monthly price pairs with / شهر suffix', async () => {
    renderDetails(ids.propertyId);
    await waitFor(() => expect(screen.getByText('Apartment Mazzeh 3 rooms')).toBeTruthy());
    expect(screen.getByText('العقارات')).toBeTruthy();
    expect(screen.getByText('450 د.ج / شهر')).toBeTruthy();
  });

  it('B1: property has a contact CTA but NO request-cart CTA (contact/lead only)', async () => {
    renderDetails(ids.propertyId);
    await waitFor(() => expect(screen.getByText('Apartment Mazzeh 3 rooms')).toBeTruthy());
    expect(screen.getByText('تواصل مع صاحب الإعلان')).toBeTruthy(); // mediator contact
    expect(screen.queryByText('أضف إلى سلة الطلب')).toBeNull(); // properties are NOT orderable
  });

  it('B1: car has BOTH contact CTA and request-cart CTA; still no view counter', async () => {
    renderDetails(ids.carId);
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());
    expect(screen.getByText('تواصل مع صاحب الإعلان')).toBeTruthy(); // mediator contact (car+property)
    expect(screen.getByText('أضف إلى سلة الطلب')).toBeTruthy(); // request-cart CTA (cars/produce)
    expect(screen.queryByText(/مشاهدة|views?/i)).toBeNull(); // no view counter
  });
});

describe('P8.5 listing-details — degraded paths', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    seedFakeCentralDb();
    seedFakeListings();
  });

  it('missing id param renders ProductNotFound', async () => {
    renderDetails();
    await waitFor(() => expect(screen.getByText('هذا الإعلان غير متوفر')).toBeTruthy());
  });

  it('unknown id renders ProductNotFound (never a crash)', async () => {
    renderDetails('does-not-exist');
    await waitFor(() => expect(screen.getByText('هذا الإعلان غير متوفر')).toBeTruthy());
  });
});

describe('P8.5 listing-details — navigation contract', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    seedFakeCentralDb();
    ids = seedFakeListings();
  });

  it('BACK pops to the showroom surface after a real showroom → details session', async () => {
    renderDetails(ids.propertyId);
    await waitFor(() => expect(screen.getByText('Apartment Mazzeh 3 rooms')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button')[0]!); // header back button
    await waitFor(() =>
      expect(screen.getByTestId('route').getAttribute('data-screen')).toBe('showroom'),
    );
  });

  it('back-matrix pins listing-details to showroom and reachability allows deep-link', () => {
    expect(getBackMatrixRow('listing-details')!.backTarget).toBe('showroom');
    expect(EDGES['listing-details']).toContain('deep-link');
  });
});

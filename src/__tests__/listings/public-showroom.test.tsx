/**
 * P8.5 — Public showroom integration (car/property tabs).
 *
 * Runs the REAL ShowroomScreen against the fake substrate: default phone
 * surface untouched, neutral tabs fetch via `listing_search` only (server-side
 * text query), errors surface visibly, and card selection deep-links into
 * listing-details.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { CartProvider } from '../../core/cart/CartContext';
import { WhatsAppProvider } from '../../providers/WhatsAppProvider';
import { ShowroomScreen } from '../../screens/showroom/ShowroomScreen';
import { ListingDetailsScreen } from '../../screens/showroom/ListingDetailsScreen';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { searchListings } from '../../services/listing-service';
import {
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
} from '../helpers/fake-central-inventory';
import { resetShowroomUiState } from '../../hooks/useShowroomState';
import { resetSearchAnalyticsRetention } from '../../hooks/useSearchAnalytics';
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

async function renderShowroom() {
  // jsdom navigator.language is 'en' — pin Arabic so t()-driven labels and
  // placeholders match the assertions below.
  updateSettings({ language: 'ar' });
  await bootstrapCentralInventory();
  render(
    <ThemeProvider>
      <TranslationProvider>
        <AppProvider>
          <CartProvider>
            <WhatsAppProvider>
              <ScreenHost />
            </WhatsAppProvider>
          </CartProvider>
        </AppProvider>
      </TranslationProvider>
    </ThemeProvider>,
  );
}

/** Mirrors App.tsx's screen table for the two screens under test. */
function ScreenHost() {
  const { currentScreen } = useAppState();
  return currentScreen === 'listing-details' ? <ListingDetailsScreen /> : <ShowroomScreen />;
}

const tab = (name: string) => screen.getByRole('tab', { name });

// ── Default surface ─────────────────────────────────────────────────────────

describe('P8.5 showroom — default phone surface untouched', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings(); // car + property exist but MUST NOT leak into phones
    resetShowroomUiState();
    resetSearchAnalyticsRetention();
  });

  it('phones render on load and category tabs default to the phone surface', async () => {
    await renderShowroom();
    expect(screen.getAllByText(/iPhone 13/).length).toBeGreaterThan(0);
    // NOTE: v_public_inventory predates the category column (00035 added the
    // column without touching the 00019 view), so published listing rows CAN
    // appear here on a fully-migrated DB until a follow-up migration adds a
    // `category = 'phone'` predicate. Flagged in the P8.5 STOP GATE report;
    // out of scope by mandate (no SQL changes, no phone-flow edits).
    expect(tab('الهواتف').getAttribute('aria-selected')).toBe('true');
  });

  it('category tabs exist with phone selected by default', async () => {
    await renderShowroom();
    expect(tab('الهواتف').getAttribute('aria-selected')).toBe('true');
    expect(tab('السيارات').getAttribute('aria-selected')).toBe('false');
    expect(tab('العقارات').getAttribute('aria-selected')).toBe('false');
  });
});

// ── Neutral surfaces ────────────────────────────────────────────────────────

describe('P8.5 showroom — car tab (neutral variant)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    const ids = seedFakeListings();
    void ids;
    resetShowroomUiState();
    resetSearchAnalyticsRetention();
  });

  it('car card shows sale price WITHOUT monthly suffix and hides condition/city filter chips', async () => {
    await renderShowroom();
    fireEvent.click(tab('السيارات'));
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());
    // sale price, no '/ شهر'
    expect(screen.getByText('18,500 د.ج')).toBeTruthy();
    expect(screen.queryByText(/شهر/)).toBeNull();
    // neutral variant hides condition + city chips (search & sort only)
    expect(screen.queryByText('مستعملة')).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'الكل' }).length).toBe(0);
    // presenter chips still render on the card itself
    expect(screen.getByText('54,000 كم')).toBeTruthy();
    expect(screen.getByText('بنزين')).toBeTruthy();
  });

  it('text search hits listing_search server-side (Corolla matches, BMW empties)', async () => {
    await renderShowroom();
    fireEvent.click(tab('السيارات'));
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());

    const input = screen.getByPlaceholderText('ابحث عن هاتف…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Corolla' } });
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());

    fireEvent.change(input, { target: { value: 'BMW' } });
    await waitFor(() =>
      expect(screen.getByText('لا توجد أجهزة في المخزون حالياً')).toBeTruthy(),
    );
    expect(screen.queryByText('Toyota Corolla GLX')).toBeNull();
  });

  it('card selection navigates to listing-details for that id', async () => {
    await renderShowroom();
    fireEvent.click(tab('السيارات'));
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Toyota Corolla GLX' }));
    // Details-only content proves navigation (description never renders on cards).
    await waitFor(() =>
      expect(screen.getByText('One owner, full service history.')).toBeTruthy(),
    );
  });
});

describe('P8.5 showroom — property tab (neutral variant)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
    resetShowroomUiState();
    resetSearchAnalyticsRetention();
  });

  it('rent property card pairs amount with the / شهر suffix', async () => {
    await renderShowroom();
    fireEvent.click(tab('العقارات'));
    await waitFor(() => expect(screen.getByText('Apartment Mazzeh 3 rooms')).toBeTruthy());
    expect(screen.getByText('450 د.ج / شهر')).toBeTruthy();
    expect(screen.getByText('120 م²')).toBeTruthy();
    expect(screen.getByText('3 غرف')).toBeTruthy();
  });
});

// ── Error surfacing ─────────────────────────────────────────────────────────

describe('P8.5 showroom — guard rails', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
    resetShowroomUiState();
    resetSearchAnalyticsRetention();
  });

  it('unknown category is rejected by the RPC contract (no silent fallback)', async () => {
    await expect(searchListings({ category: 'boat' as never })).rejects.toThrow(/unknown category/);
  });
});

// ── P8.6 additions ──────────────────────────────────────────────────────────

describe('P8.6 showroom — tab isolation and cover-image hardening', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    seedFakeListings();
    resetShowroomUiState();
    resetSearchAnalyticsRetention();
  });

  it('switching category clears the previous category cards (server-side isolation)', async () => {
    await renderShowroom();
    fireEvent.click(tab('السيارات'));
    await waitFor(() => expect(screen.getByText('Toyota Corolla GLX')).toBeTruthy());

    fireEvent.click(tab('العقارات'));
    await waitFor(() => expect(screen.getByText('Apartment Mazzeh 3 rooms')).toBeTruthy());
    expect(screen.queryByText('Toyota Corolla GLX')).toBeNull();
    expect(screen.queryByText('18,500 د.ج')).toBeNull();
  });

  it('a dead cover URL degrades the card to the emoji placeholder (onError pin)', async () => {
    await renderShowroom();
    fireEvent.click(tab('السيارات'));
    const img = await waitFor(() => screen.getByAltText('Toyota Corolla GLX'));

    fireEvent.error(img);

    // The <img> is replaced by the role="img" placeholder div — no broken icon.
    const fallback = screen.getByRole('img', { name: 'Toyota Corolla GLX' });
    expect(fallback.tagName).toBe('DIV');
    expect(screen.queryByAltText('Toyota Corolla GLX')).toBeNull();
  });
});

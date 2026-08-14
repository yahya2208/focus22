import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { HomeScreen } from '../../screens/home/HomeScreen';
import { AppProvider } from '../../store/navigation';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { resetFakeCentralDb, seedFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { user: null }, researchRole: 'none' }),
}));
vi.mock('../../components/navigation/HomeMenu', () => ({ HomeMenu: () => null }));
vi.mock('../../components/brand/BrandLogo', () => ({ BrandLogo: () => null }));
vi.mock('../../components/brand/BrandFooter', () => ({ BrandFooter: () => null }));
vi.mock('../../components/ad-contact/AdContactBanner', () => ({
  AdContactBanner: () => <div data-testid="home-ad">ad</div>,
}));
vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

function renderHome() {
  return render(
    <AppProvider>
      <HomeScreen />
    </AppProvider>,
  );
}

describe('HomeScreen — inventory on first load (no refresh needed)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
  });

  it('shows the devices section only after inventory initialization, without a refresh', async () => {
    renderHome();

    // Before the central bootstrap settles, no device rows are rendered.
    expect(screen.queryByText('iPhone 15 Pro')).toBeNull();
    expect(screen.getByText('home.noDevices')).toBeTruthy();

    // Simulate the async bootstrap completing AFTER the screen mounted
    // (the reported "first load after disuse" path — no manual refresh).
    await act(async () => {
      await bootstrapCentralInventory();
      // Flush the per-card image resolution so no update lands outside act().
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText('home.noDevices')).toBeNull();
    expect(screen.getByText('iPhone 15 Pro')).toBeTruthy();
    expect(screen.getByText('Galaxy S24 Ultra')).toBeTruthy();
    expect(screen.getByText('Redmi Note 13')).toBeTruthy();
  });

  it('renders devices immediately when the cache is already hydrated at mount', async () => {
    await act(async () => {
      await bootstrapCentralInventory();
    });

    await act(async () => {
      renderHome();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('iPhone 15 Pro')).toBeTruthy();
    expect(screen.queryByText('home.noDevices')).toBeNull();
  });
});

describe('HomeScreen — layout order (Top bar → Ad → content)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
  });

  it('places the ad directly below the top bar and above every other content block', () => {
    renderHome();

    const menuButton = screen.getByLabelText('home.menu');
    const ad = screen.getByTestId('home-ad');
    const startTest = screen.getByText(/home\.startTest/);
    const services = screen.getByText('home.services', { exact: true });

    const isBefore = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    // Top bar stays on top and clean: menu button is the first control.
    expect(isBefore(menuButton, ad)).toBe(true);
    // Ad is the FIRST main content — nothing (greeting/score/start button)
    // renders above it.
    expect(isBefore(ad, startTest)).toBe(true);
    expect(isBefore(ad, services)).toBe(true);
    // Services come after the hero/start test.
    expect(isBefore(startTest, services)).toBe(true);
  });
});

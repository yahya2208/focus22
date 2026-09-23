import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ShowroomScreen } from '../../screens/showroom/ShowroomScreen';
import { AppProvider } from '../../store/navigation';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { resetFakeCentralDb, seedFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../components/ad-contact/AdContactBanner', () => ({
  AdContactBanner: () => null,
}));
vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

function renderShowroom() {
  return render(
    <AppProvider>
      <ShowroomScreen />
    </AppProvider>,
  );
}

describe('ShowroomScreen — inventory on first load (no refresh needed)', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
  });

  it('shows device rows only after inventory initialization, without a refresh', async () => {
    renderShowroom();

    // Before the central bootstrap settles, no device rows are rendered.
    expect(screen.queryByText('iPhone 15 Pro')).toBeNull();

    // Simulate the async bootstrap completing AFTER the screen mounted
    // (the reported "first load after disuse" path — no manual refresh).
    await act(async () => {
      await bootstrapCentralInventory();
      // Flush the per-card image resolution so no update lands outside act().
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('iPhone 15 Pro')).toBeTruthy();
    expect(screen.getByText('Galaxy S24 Ultra')).toBeTruthy();
    expect(screen.getByText('Redmi Note 13')).toBeTruthy();
  });

  it('renders devices immediately when the cache is already hydrated at mount', async () => {
    await act(async () => {
      await bootstrapCentralInventory();
    });

    await act(async () => {
      renderShowroom();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('iPhone 15 Pro')).toBeTruthy();
  });
});

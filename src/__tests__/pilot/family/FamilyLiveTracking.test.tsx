import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppProvider, useAppState } from '../../../store/navigation';
import { PilotFamilyHomeScreen } from '../../../screens/pilot/PilotFamilyHomeScreen';
import { FAMILY_POLL_MS } from '../../../screens/pilot/family/useFamilyOrderPolling';

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ar', dir: 'rtl' }),
}));
vi.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated' } }),
}));

const shared = vi.hoisted(() => ({
  status: 'preparing',
  fetchCount: 0,
}));

vi.mock('../../../services/pilot-account-service', () => ({
  fetchMyFamily: vi.fn(async () => ({ family_id: 'f1', family_name: 'A', family_name_ar: 'ع' })),
  fetchMyAccount: vi.fn(async () => ({ linked: false, balance: 0, debts: [] })),
  fetchMyFamilyContact: vi.fn(async () => null),
  saveMyFamilyContact: vi.fn(async (i: unknown) => i),
  fetchMyFamilyPreferences: vi.fn(async () => null),
  saveMyFamilyPreferences: vi.fn(async (i: unknown) => i),
}));
vi.mock('../../../services/order-tracking-service', () => ({
  fetchMyOrders: vi.fn(async () => {
    shared.fetchCount += 1;
    return [
      { order_id: 'o1', order_number: 'FC-2', status: shared.status, total: 100, created_at: '2026-09-01', item_count: 1 },
    ];
  }),
  mergeRealtimeOrderPayload: vi.fn((p: unknown) => p),
}));

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {});
  }
}

describe('Family home live tracking (5s polling)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    shared.status = 'preparing';
    shared.fetchCount = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderSettled(withProbe = false) {
    const r = render(
      <AppProvider>
        <PilotFamilyHomeScreen />
        {withProbe ? <ScreenProbe /> : null}
      </AppProvider>,
    );
    await flush();
    expect(shared.fetchCount).toBeGreaterThan(0);
    expect(screen.getByText('pilot.currentOrder')).toBeTruthy();
    return r;
  }

  it('starts polling with an active order and refetches every interval', async () => {
    await renderSettled();
    expect(shared.fetchCount).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(FAMILY_POLL_MS);
    });
    await flush(3);
    expect(shared.fetchCount).toBe(2);
    await act(async () => {
      vi.advanceTimersByTime(FAMILY_POLL_MS);
    });
    await flush(3);
    expect(shared.fetchCount).toBe(3);
  });

  it('shows delivered as the final state once the server reports it', async () => {
    await renderSettled();
    expect(screen.getByText('pilot.stepPreparing')).toBeTruthy();

    shared.status = 'delivered';
    await act(async () => {
      vi.advanceTimersByTime(FAMILY_POLL_MS);
    });
    await flush(5);
    expect(screen.getByText('pilot.stepDelivered')).toBeTruthy();
  });

  it('stops polling at delivered and on unmount (no leaks, no dupes)', async () => {
    const r = await renderSettled();
    const atStart = shared.fetchCount;

    shared.status = 'delivered';
    // One tick: the in-flight fetch lands, state flips, effect stops.
    await act(async () => {
      vi.advanceTimersByTime(FAMILY_POLL_MS);
    });
    await flush(5);
    const afterDelivered = shared.fetchCount;
    expect(afterDelivered - atStart).toBeLessThanOrEqual(1);

    // Further ticks: silence (effect stopped on terminal status).
    await act(async () => {
      vi.advanceTimersByTime(FAMILY_POLL_MS * 3);
    });
    await flush(3);
    expect(shared.fetchCount).toBe(afterDelivered);

    r.unmount();
    await act(async () => {
      vi.advanceTimersByTime(FAMILY_POLL_MS * 3);
    });
    await flush(3);
    expect(shared.fetchCount).toBe(afterDelivered);
  });

  it('walks pending→confirmed→preparing→delivered with no refresh', async () => {
    shared.status = 'pending';
    await renderSettled();
    expect(screen.getByText('pilot.stepReceived')).toBeTruthy();

    for (const [status, key] of [
      ['confirmed', 'pilot.stepConfirmed'],
      ['preparing', 'pilot.stepPreparing'],
      ['delivered', 'pilot.stepDelivered'],
    ] as const) {
      shared.status = status;
      await act(async () => {
        vi.advanceTimersByTime(FAMILY_POLL_MS);
      });
      await flush(5);
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it('saved-basket quick action opens the existing saved basket', async () => {
    await renderSettled(true);
    fireEvent.click(screen.getByText('pilot.familyBasketTitle'));
    expect(screen.getByTestId('screen').textContent).toBe('pilot-family-purchases');
  });
});

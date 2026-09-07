/**
 * Neighborhood Pilot — PilotMyOrdersScreen (GATE 6 customer My Orders).
 * Minimal surface test: lists the customer's orders from pilot_my_orders,
 * renders the empty state, drills into the timeline via pilot_order_timeline,
 * and subscribes a realtime feed scoped to the authenticated user.
 * Services are mocked; server-side RPC contracts are asserted in the
 * structural gate suite (pilot_my_orders / pilot_order_timeline).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';

const mock = vi.hoisted(() => ({
  fetchMyOrders: vi.fn(),
  fetchOrderTimeline: vi.fn(),
  createPilotOrderRealtime: vi.fn(),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'u1' }, error: null },
    service: {},
    researchRole: 'user',
  }),
}));

vi.mock('../../services/order-tracking-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../services/order-tracking-service')
  >('../../services/order-tracking-service');
  return {
    ...actual,
    fetchMyOrders: mock.fetchMyOrders,
    fetchOrderTimeline: mock.fetchOrderTimeline,
  };
});

vi.mock('../../services/pilot-realtime-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../services/pilot-realtime-service')
  >('../../services/pilot-realtime-service');
  return {
    ...actual,
    createPilotOrderRealtime: mock.createPilotOrderRealtime,
  };
});

import { PilotMyOrdersScreen } from '../../screens/pilot/PilotMyOrdersScreen';

const feed = {
  start: vi.fn(),
  stop: vi.fn(),
  getStatus: vi.fn(() => 'live'),
  isStale: vi.fn(() => false),
  refreshNow: vi.fn(),
  lastSyncAt: Date.now(),
};

const order = {
  order_id: 'o1',
  order_number: 'ORD-1001',
  status: 'out_for_delivery',
  total: 42.5,
  currency: 'EGP',
  store_id: 's1',
  store_name: 'Ahmed Foods',
  store_name_ar: null,
  zone_name: 'Nasr City',
  zone_name_ar: null,
  neighborhood_id: 'n1',
  neighborhood_name: 'Downtown',
  item_count: 3,
  courier_user_id: 'c9',
  created_at: '2026-09-07T10:00:00Z',
  updated_at: '2026-09-07T10:30:00Z',
};

const timeline = {
  order_id: 'o1',
  events: [
    { id: 'h1', from_status: null, new_status: 'confirmed', actor_role: 'store_operator', notes: '', created_at: '2026-09-07T10:05:00Z' },
    { id: 'h2', from_status: 'confirmed', new_status: 'out_for_delivery', actor_role: 'courier', notes: '', created_at: '2026-09-07T10:30:00Z' },
  ],
};

function renderScreen() {
  return render(
    <AppProvider>
      <PilotMyOrdersScreen />
    </AppProvider>,
  );
}

describe('PilotMyOrdersScreen — customer My Orders (GATE 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.fetchMyOrders.mockResolvedValue([order]);
    mock.fetchOrderTimeline.mockResolvedValue(timeline);
    mock.createPilotOrderRealtime.mockReturnValue(feed);
  });

  it('lists the customer orders and subscribes a user-scoped realtime feed', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('ORD-1001')).toBeTruthy());

    expect(mock.fetchMyOrders).toHaveBeenCalledOnce();
    expect(mock.createPilotOrderRealtime).toHaveBeenCalledTimes(1);
    const opts = mock.createPilotOrderRealtime.mock.calls[0]![0];
    expect(opts.table).toBe('orders');
    expect(opts.filter).toBe('user_id=eq.u1');
    expect(feed.start).toHaveBeenCalled();

    // Status label resolved through the translation mapping.
    expect(screen.getByText('pilot.status.outForDelivery')).toBeTruthy();
  });

  it('shows the empty state when the customer has no orders', async () => {
    mock.fetchMyOrders.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('pilot.myOrdersEmpty')).toBeTruthy());
  });

  it('expands the timeline through pilot_order_timeline on reveal', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('ORD-1001')).toBeTruthy());

    fireEvent.click(screen.getByText('pilot.showDetails'));

    await waitFor(() =>
      expect(mock.fetchOrderTimeline).toHaveBeenCalledWith('o1'),
    );
    await waitFor(() => expect(screen.getByText('pilot.status.confirmed')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/courier/)).toBeTruthy());
  });

  it('cleans up the feed on unmount', async () => {
    const { unmount } = renderScreen();
    await waitFor(() => expect(screen.getByText('ORD-1001')).toBeTruthy());
    unmount();
    expect(feed.stop).toHaveBeenCalled();
  });
});
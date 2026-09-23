/**
 * GATE V1.8-A — repeat-to-cart UI (mocked services).
 * Proves: reorder copies products+quantities only (prices re-resolve),
 * unavailable lines are skipped with notice, cancelled orders offer no
 * button, and navigation lands on checkout for review.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { CartProvider, useCart } from '../../core/cart/CartContext';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'u1' } },
    service: {},
    researchRole: 'user',
  }),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

const shared = vi.hoisted(() => ({
  lines: [] as Array<Record<string, unknown>>,
  catalog: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../services/order-tracking-service', () => ({
  fetchMyOrders: vi.fn(async () => [
    {
      order_id: 'o1', order_number: 'FC-1', status: 'delivered', subtotal: 300,
      delivery_fee: 0, total: 300, store_id: 's1', store_name: null, store_name_ar: null,
      zone_name: null, zone_name_ar: null, neighborhood_id: null, item_count: 2,
      courier_user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
    },
    {
      order_id: 'o2', order_number: 'FC-2', status: 'cancelled', subtotal: 0,
      delivery_fee: 0, total: 0, store_id: 's1', store_name: null, store_name_ar: null,
      zone_name: null, zone_name_ar: null, neighborhood_id: null, item_count: 1,
      courier_user_id: null, created_at: '2026-01-02', updated_at: '2026-01-02',
    },
  ]),
  fetchFamilyOrderItems: vi.fn(async () => shared.lines),
  mergeRealtimeOrderPayload: vi.fn((p: unknown) => p),
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('../../services/pilot-account-service', () => ({
  fetchMyAccount: vi.fn(async () => ({ linked: false, balance: 0, debts: [] })),
}));
vi.mock('../../services/inventory-service', () => ({
  InventoryService: { getExchangeableDevices: () => shared.catalog },
}));

import { PilotMyOrdersScreen } from '../../screens/pilot/PilotMyOrdersScreen';

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function CartProbe() {
  const { lines } = useCart();
  return (
    <div data-testid="cart">
      {JSON.stringify(lines.map((l) => [l.catalogRef, l.quantity, l.domain]))}
    </div>
  );
}

const LIVE_TOMATO = {
  id: 'v1', modelId: 'veg-tomato', brand: '', model: 'Tomato', variant: '',
  ram: '', storage: '', condition: 'New', quantity: 10, sellPrice: 120,
};

describe('MyOrders — repeat-to-cart (V1.8-A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.lines = [
      { catalog_ref: 'v1', name: 'Tomato', name_ar: 'طماطم', quantity: 1.5, unit: 'kg', unit_price: 999 },
      { catalog_ref: 'v-gone', name: 'Ghost', name_ar: '', quantity: 2, unit: 'kg', unit_price: 1 },
    ];
    shared.catalog = [LIVE_TOMATO];
  });

  function renderOrders() {
    return render(
      <AppProvider>
        <CartProvider>
          <PilotMyOrdersScreen />
          <ScreenProbe />
          <CartProbe />
        </CartProvider>
      </AppProvider>,
    );
  }

  it('copies products+quantities with live catalog data, skips the gone line', async () => {
    renderOrders();
    await screen.findByText(/FC-1/);

    fireEvent.click(screen.getAllByText('pilot.reorder')[0]!);

    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('pilot-checkout'));
    const cart = JSON.parse(screen.getByTestId('cart').textContent ?? '[]');
    // Live stock/price win (120, not the stale 999); qty preserved with kg decimals.
    expect(cart).toEqual([['v1', 1.5, 'produce']]);
    expect(screen.getByText(/pilot\.repeatSkipped/)).toBeTruthy();
  });

  it('offers no reorder button on cancelled orders', async () => {
    renderOrders();
    await screen.findByText(/FC-1/);

    expect(screen.getAllByText('pilot.reorder')).toHaveLength(1);
  });
});

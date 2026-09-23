/**
 * GATE V1.4 — admin order queue UI (PilotStoreOpsScreen, mocked services).
 * Pins the Vegetables admin flow per status: accept → prepare → ready label →
 * explicit delivered marking + cancel where allowed, settle visible without
 * any courier handoff, and the advance (never generic/courier) RPC path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';
import { PilotStoreOpsScreen } from '../../screens/pilot/PilotStoreOpsScreen';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated' } }),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

const shared = vi.hoisted(() => ({
  orders: [] as Array<Record<string, unknown>>,
  advance: vi.fn(async () => ({})),
  settle: vi.fn(async () => ({})),
}));

vi.mock('../../services/neighborhood-service', () => ({
  fetchMyStores: vi.fn(async () => [{ id: 's1', name: 'S', name_ar: 'م' }]),
  fetchStoreProducts: vi.fn(async () => []),
}));
vi.mock('../../services/order-service', () => ({
  fetchStoreOrders: vi.fn(async () => shared.orders),
  advanceStoreOrder: (...args: unknown[]) => (shared.advance as (...a: unknown[]) => Promise<unknown>)(...args),
  settleFamilyOrder: (...args: unknown[]) => (shared.settle as (...a: unknown[]) => Promise<unknown>)(...args),
}));
vi.mock('../../services/courier-service', () => ({
  fetchOrderDetail: vi.fn(async (orderId: string) => ({
    order: {
      customer_name: 'A',
      customer_phone: '05',
      zone_name: 'Z',
      address: '',
      subtotal: 100,
      delivery_fee: 0,
      total: 100,
    },
    items: [],
    orderId,
  })),
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

function order(id: string, status: string) {
  return {
    id,
    order_number: `FC-${id}`,
    customer_name: 'A',
    status,
    subtotal: 100,
    delivery_fee: 0,
    total: 100,
    created_at: '',
    store_id: 's1',
    neighborhood_id: null,
    user_id: null,
  };
}

function renderOps() {
  return render(
    <AppProvider>
      <PilotStoreOpsScreen />
    </AppProvider>,
  );
}

async function expandFirstOrder() {
  await screen.findByText(/FC-/);
  fireEvent.click(screen.getByText('pilot.showDetails'));
  await screen.findByText('pilot.subtotal');
}

beforeEach(() => {
  shared.orders = [];
  shared.advance = vi.fn(async () => ({}));
  shared.settle = vi.fn(async () => ({}));
  vi.clearAllMocks();
});

describe('PilotStoreOpsScreen — admin-owned queue (V1.4)', () => {
  it('pending offers accept + cancel, never a courier handoff', async () => {
    shared.orders = [order('p', 'pending')];
    renderOps();
    await expandFirstOrder();

    // Detail collapses after a successful advance, so presence is asserted first.
    expect(screen.getByText('pilot.cancelOrder')).toBeTruthy();
    expect(screen.queryByText('pilot.handoffToCourier')).toBeNull();
    fireEvent.click(screen.getByText('pilot.confirmOrder'));
    await waitFor(() => expect(shared.advance).toHaveBeenCalledWith('p', 'confirmed'));
  });

  it('confirmed offers start-preparing + cancel', async () => {
    shared.orders = [order('c', 'confirmed')];
    renderOps();
    await expandFirstOrder();

    expect(screen.getByText('pilot.cancelOrder')).toBeTruthy();
    fireEvent.click(screen.getByText('pilot.startPreparing'));
    await waitFor(() => expect(shared.advance).toHaveBeenCalledWith('c', 'preparing'));
  });

  it('preparing shows the ready-for-handoff label, mark-delivered and settle — no handoff', async () => {
    shared.orders = [order('r', 'preparing')];
    renderOps();
    await expandFirstOrder();

    expect(screen.getByText('pilot.readyForHandoff')).toBeTruthy();
    expect(screen.getByText('pilot.settleAndDeliver')).toBeTruthy();
    expect(screen.queryByText('pilot.handoffToCourier')).toBeNull();
    expect(screen.queryByText('pilot.cancelOrder')).toBeNull();
    fireEvent.click(screen.getByText('pilot.markDelivered'));
    await waitFor(() => expect(shared.advance).toHaveBeenCalledWith('r', 'delivered'));
  });

  it('delivered/cancelled offer no advance actions', async () => {
    shared.orders = [order('d', 'delivered')];
    renderOps();
    await expandFirstOrder();

    expect(screen.queryByText('pilot.confirmOrder')).toBeNull();
    expect(screen.queryByText('pilot.startPreparing')).toBeNull();
    expect(screen.queryByText('pilot.markDelivered')).toBeNull();
    expect(screen.queryByText('pilot.cancelOrder')).toBeNull();
  });
});

describe('PilotStoreOpsScreen — translated status labels (V1.4 i18n)', () => {
  it.each([
    ['pending', /pilot\.status\.pending/],
    ['confirmed', /pilot\.status\.confirmed/],
    ['preparing', /pilot\.status\.preparing/],
    ['out_for_delivery', /pilot\.status\.outForDelivery/],
    ['delivered', /pilot\.status\.delivered/],
    ['cancelled', /pilot\.status\.cancelled/],
  ])('status %s renders as %s, never raw', async (status, labelPattern) => {
    shared.orders = [order(`o-${status}`, status)];
    renderOps();

    await screen.findByText(labelPattern);
    expect(screen.queryByText(status, { exact: true })).toBeNull();
  });
});

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
  families: [] as Array<Record<string, unknown>>,
  fetchFamilies: vi.fn(),
  advance: vi.fn(async () => ({})),
  settle: vi.fn(async () => ({})),
}));

vi.mock('../../services/neighborhood-service', () => ({
  fetchMyStores: vi.fn(async () => [{ id: 's1', name: 'S', name_ar: 'م' }]),
  fetchStoreProducts: vi.fn(async () => []),
  fetchStoreOrderFamilies: shared.fetchFamilies,
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

function order(id: string, status: string, familyId: string | null = null) {
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
    family_id: familyId,
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
  shared.families = [];
  shared.advance = vi.fn(async () => ({}));
  shared.settle = vi.fn(async () => ({}));
  vi.clearAllMocks();
  shared.fetchFamilies.mockImplementation(async (storeId: string) => {
    if (storeId !== 's1') throw new Error(`unexpected store scope: ${storeId}`);
    return shared.families;
  });
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

  it('preparing shows the ready-for-handoff label and mark-delivered, but no settle action', async () => {
    shared.orders = [order('r', 'preparing')];
    renderOps();
    await expandFirstOrder();

    expect(screen.getByText('pilot.readyForHandoff')).toBeTruthy();
    // Settle executes only at out_for_delivery (transition-matrix scope):
    // preparing rows advance first and never offer settle.
    expect(screen.queryByText('pilot.settleAndDeliver')).toBeNull();
    expect(screen.queryByText('pilot.handoffToCourier')).toBeNull();
    expect(screen.queryByText('pilot.cancelOrder')).toBeNull();
    fireEvent.click(screen.getByText('pilot.markDelivered'));
    await waitFor(() => expect(shared.advance).toHaveBeenCalledWith('r', 'delivered'));
  });

  it('out_for_delivery offers settle in addition to advance actions', async () => {
    shared.orders = [order('f', 'out_for_delivery')];
    renderOps();
    await expandFirstOrder();

    expect(screen.getByText('pilot.settleAndDeliver')).toBeTruthy();
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

describe('PilotStoreOpsScreen — family labels (B3 store-scoped RPC)', () => {
  it('renders the family name for an order that carries a family_id', async () => {
    shared.orders = [order('f1', 'pending', 'fam-1')];
    shared.families = [{ id: 'fam-1', name: 'Al-Rayan', name_ar: 'الريان' }];
    renderOps();

    await screen.findByText(/Al-Rayan/);
    expect(screen.getByText(/FC-f1/)).toBeTruthy();
  });

  it('asks the server for the selected store only — never passes family ids', async () => {
    shared.orders = [
      order('a', 'pending', 'fam-1'),
      order('b', 'pending', 'fam-1'),
      order('c', 'pending', 'fam-2'),
    ];
    shared.families = [
      { id: 'fam-1', name: 'Al-Rayan', name_ar: 'الريان' },
      { id: 'fam-2', name: 'Al-Noor', name_ar: 'النور' },
    ];
    renderOps();

    await waitFor(() => expect(shared.fetchFamilies).toHaveBeenCalled());
    for (const call of shared.fetchFamilies.mock.calls) {
      expect(call).toEqual(['s1']);
    }
    // Both fam-1 rows and the fam-2 row resolve from the one store scope.
    expect(await screen.findAllByText(/Al-Rayan/)).toHaveLength(2);
    expect(await screen.findAllByText(/Al-Noor/)).toHaveLength(1);
  });

  it('omits the family suffix when the store RPC returns no families', async () => {
    shared.orders = [order('n1', 'pending')];
    shared.families = [];
    renderOps();

    const row = await screen.findByText(/FC-n1/);
    expect(row.textContent).not.toContain('·');
    expect(shared.fetchFamilies).toHaveBeenCalledWith('s1');
  });

  it('still renders the row when the family lookup fails', async () => {
    shared.orders = [order('e', 'pending', 'fam-1')];
    shared.fetchFamilies.mockRejectedValueOnce(new Error('FAMILY_LOOKUP_ERROR'));
    renderOps();

    expect(await screen.findByText(/FC-e/)).toBeTruthy();
  });
});

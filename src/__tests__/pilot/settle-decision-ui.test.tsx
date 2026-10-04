/**
 * Settlement decision UI (00124 frontend half).
 *
 * StoreOps insufficient-balance dialog (admin/operator), ACCEPT/REJECT
 * execution flows, AdminOrders deep-link dispatch, and StoreOps routeParams
 * preselect — all with mocked services. No database, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

const shared = vi.hoisted(() => ({
  orders: [] as Array<Record<string, unknown>>,
  families: [] as Array<Record<string, unknown>>,
  settleImpl: null as null | ((...a: unknown[]) => Promise<unknown>),
  notifyCalls: [] as Array<{ orderId: string; event: string }>,
  dispatched: [] as Array<unknown>,
  role: 'admin',
  routeParams: {} as Record<string, string>,
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { role: shared.role } },
  }),
}));

vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return {
    ...actual,
    useAppDispatch: () => (action: unknown) => {
      shared.dispatched.push(action);
    },
    useAppState: () => ({ routeParams: shared.routeParams }),
  };
});

vi.mock('../../services/neighborhood-service', () => ({
  fetchMyStores: vi.fn(async () => [{ id: 's1', name: 'S', name_ar: 'م' }]),
  fetchStoreProducts: vi.fn(async () => []),
  fetchStoreOrderFamilies: vi.fn(async () => []),
}));

vi.mock('../../services/order-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/order-service')>();
  return {
    ...actual,
    fetchStoreOrders: vi.fn(async () => shared.orders),
    advanceStoreOrder: vi.fn(async () => ({})),
    settleFamilyOrder: (...a: unknown[]) => {
      if (!shared.settleImpl) throw new Error('settle not stubbed');
      return shared.settleImpl(...a);
    },
    notifySettlePush: vi.fn(async (orderId: string, event: string) => {
      shared.notifyCalls.push({ orderId, event });
    }),
  };
});
vi.mock('../../services/courier-service', () => ({
  fetchOrderDetail: vi.fn(async (orderId: string) => ({
    order: { customer_name: 'A', customer_phone: '05', subtotal: 700, delivery_fee: 0, total: 700 },
    items: [{ id: 'i1', quantity: 2, unit_price: 350 }],
    orderId,
  })),
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

import { AppProvider } from '../../store/navigation';
import { PilotStoreOpsScreen } from '../../screens/pilot/PilotStoreOpsScreen';
import { AdminOrders } from '../../screens/admin/command-center/AdminOrders';

function order(id: string) {
  return {
    id,
    order_number: `FC-${id}`,
    customer_name: 'A',
    // out_for_delivery: the only state whose settle execution the
    // transition matrix permits (preparing must advance first).
    status: 'out_for_delivery',
    subtotal: 700,
    delivery_fee: 0,
    total: 700,
    created_at: '',
    store_id: 's1',
    neighborhood_id: null,
    user_id: null,
    family_id: 'fam-1',
  };
}

const PROBE = {
  order_id: 'o1',
  status: 'insufficient_balance',
  available_balance: 500,
  order_total: 700,
  shortfall: 200,
  requires_admin_decision: true,
};

beforeEach(() => {
  shared.orders = [];
  shared.families = [];
  shared.settleImpl = null;
  shared.notifyCalls = [];
  shared.dispatched = [];
  shared.role = 'admin';
  shared.routeParams = {};
  vi.clearAllMocks();
});

async function openOrderAndSettle() {
  shared.orders = [order('o1')];
  render(
    <AppProvider>
      <PilotStoreOpsScreen />
    </AppProvider>,
  );
  await screen.findByText(/FC-o1/);
  fireEvent.click(screen.getByText('pilot.showDetails'));
  await screen.findByText('pilot.subtotal');
  const settleBtn = screen.getByText('pilot.settleAndDeliver');
  fireEvent.click(settleBtn);
}

describe('StoreOps — insufficient-balance decision dialog', () => {
  it('opens the dialog with server figures on probe, no mutation implied', async () => {
    shared.settleImpl = vi.fn(async () => PROBE);
    await openOrderAndSettle();

    await screen.findByText('pilot.settleInsufficientTitle');
    expect(screen.getByText('pilot.settleAcceptDebt')).toBeTruthy();
    expect(screen.getByText('pilot.settleRejectOrder')).toBeTruthy();
    // Figures rendered from the probe (500 / 700 / 200).
    expect(document.body.textContent).toContain('500.00');
    expect(document.body.textContent).toContain('200.00');
  });

  it('ACCEPT_DEBT executes with the decision, notifies, and shows debt message', async () => {
    shared.settleImpl = vi
      .fn()
      .mockResolvedValueOnce(PROBE)
      .mockResolvedValueOnce({
        ...PROBE,
        status: 'delivered',
        decision_applied: 'ACCEPT_DEBT',
        final_subtotal: 700,
        debt_remaining: 200,
      });
    await openOrderAndSettle();
    await screen.findByText('pilot.settleInsufficientTitle');

    fireEvent.click(screen.getByText('pilot.settleAcceptDebt'));
    await waitFor(() => expect(shared.notifyCalls).toEqual([{ orderId: 'o1', event: 'settle_accepted' }]));
    expect(await screen.findByText('pilot.msg.SETTLE_DEBT_ACCEPTED')).toBeTruthy();
    // Second call carried ACCEPT_DEBT (first was the NORMAL probe).
    const calls = (shared.settleImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual(['o1', expect.anything(), expect.anything(), 'ACCEPT_DEBT']);
  });

  it('REJECT cancels with no items and notifies settle_rejected', async () => {
    shared.settleImpl = vi
      .fn()
      .mockResolvedValueOnce(PROBE)
      .mockResolvedValueOnce({ order_id: 'o1', status: 'cancelled', decision_applied: 'REJECT' });
    await openOrderAndSettle();
    await screen.findByText('pilot.settleInsufficientTitle');

    fireEvent.click(screen.getByText('pilot.settleRejectOrder'));
    await waitFor(() => expect(shared.notifyCalls).toEqual([{ orderId: 'o1', event: 'settle_rejected' }]));
    expect(await screen.findByText('pilot.msg.SETTLE_REJECTED')).toBeTruthy();
    const calls = (shared.settleImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls[1]).toEqual(['o1', [], expect.anything(), 'REJECT']);
  });

  it('dialog close dismisses without re-calling settle', async () => {
    shared.settleImpl = vi.fn(async () => PROBE);
    await openOrderAndSettle();
    await screen.findByText('pilot.settleInsufficientTitle');
    const callsBefore = (shared.settleImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    fireEvent.click(screen.getByText('common.cancel'));
    await waitFor(() =>
      expect(screen.queryByText('pilot.settleInsufficientTitle')).toBeNull(),
    );
    const callsAfter = (shared.settleImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    expect(callsAfter).toBe(callsBefore);
  });
});

describe('StoreOps — settle entry is scoped to out_for_delivery', () => {
  function preparingOrder(id: string) {
    return { ...order(id), status: 'preparing' };
  }

  it('preparing rows show advance actions but no Settle button or inputs', async () => {
    shared.orders = [preparingOrder('p1')];
    render(
      <AppProvider>
        <PilotStoreOpsScreen />
      </AppProvider>,
    );
    await screen.findByText(/FC-p1/);
    fireEvent.click(screen.getByText('pilot.showDetails'));
    await screen.findByText('pilot.subtotal');
    expect(screen.queryByText('pilot.settleAndDeliver')).toBeNull();
  });

  it('out_for_delivery rows show Settle', async () => {
    shared.orders = [order('f1')];
    render(
      <AppProvider>
        <PilotStoreOpsScreen />
      </AppProvider>,
    );
    await screen.findByText(/FC-f1/);
    fireEvent.click(screen.getByText('pilot.showDetails'));
    await screen.findByText('pilot.subtotal');
    expect(screen.getByText('pilot.settleAndDeliver')).toBeTruthy();
  });
});

describe('StoreOps — confirmed-order readiness probe', () => {
  function confirmedOrder(id: string) {
    return {
      id,
      order_number: `FC-${id}`,
      customer_name: 'A',
      status: 'confirmed',
      subtotal: 700,
      delivery_fee: 0,
      total: 700,
      created_at: '',
      store_id: 's1',
      neighborhood_id: null,
      user_id: null,
      family_id: 'fam-1',
    };
  }

  async function openConfirmedOrder() {
    shared.orders = [confirmedOrder('c1')];
    render(
      <AppProvider>
        <PilotStoreOpsScreen />
      </AppProvider>,
    );
    await screen.findByText(/FC-c1/);
    fireEvent.click(screen.getByText('pilot.showDetails'));
    await screen.findByText('pilot.subtotal');
  }

  it('shows the readiness affordance on confirmed orders', async () => {
    shared.settleImpl = vi.fn(async () => PROBE);
    await openConfirmedOrder();
    expect(screen.getByText('pilot.settleCheckReadiness')).toBeTruthy();
  });

  it('probe opens the dialog read-only: figures, hint, no execution buttons', async () => {
    shared.settleImpl = vi.fn(async (...args: unknown[]) => {
      // Readiness probe always passes an empty item list (zero-mutation).
      expect(args[1]).toEqual([]);
      return PROBE;
    });
    await openConfirmedOrder();
    fireEvent.click(screen.getByText('pilot.settleCheckReadiness'));

    await screen.findByText('pilot.settleInsufficientTitle');
    expect(document.body.textContent).toContain('500.00');
    expect(document.body.textContent).toContain('200.00');
    expect(screen.getByText('pilot.settleAdvanceFirstHint')).toBeTruthy();
    expect(screen.queryByText('pilot.settleAcceptDebt')).toBeNull();
    expect(screen.queryByText('pilot.settleRejectOrder')).toBeNull();
    const calls = (shared.settleImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toEqual([['c1', []]]);
  });

  it('covered probe from confirmed shows the advance hint, no dialog, no execution', async () => {
    // Covered balance cannot settle from confirmed (transition matrix);
    // the server fails closed and the UI reports readiness honestly.
    shared.settleImpl = vi.fn(async () => {
      throw new Error('TRANSITION_NOT_ALLOWED');
    });
    await openConfirmedOrder();
    fireEvent.click(screen.getByText('pilot.settleCheckReadiness'));

    expect(await screen.findByText('pilot.msg.SETTLE_READY_TO_ADVANCE')).toBeTruthy();
    expect(screen.queryByText('pilot.settleInsufficientTitle')).toBeNull();
  });
});

describe('AdminOrders — deep link to Store Operations', () => {
  it('dispatches NAVIGATE with storeId+orderId hints', async () => {
    const w = {
      orders: [order('o9')],
      ordersLoading: false,
      refreshOrders: vi.fn(async () => {}),
    };
    const d = {
      selectedOrderId: 'o9',
      openOrder: vi.fn(),
      closeDetail: vi.fn(),
      retryDetail: vi.fn(),
      detailedOrder: null,
      detailLoading: false,
    };
    render(
      <AppProvider>
        <AdminOrders
          orders={w as never}
          detail={d as never}
          stores={[]}
          storeId="s1"
          onStoreChange={() => {}}
          families={[]}
        />
      </AppProvider>,
    );
    const btn = await screen.findByText('cc.ordOpenInStoreOps');
    fireEvent.click(btn);
    expect(shared.dispatched).toContainEqual({
      type: 'NAVIGATE',
      screen: 'pilot-store-ops',
      params: { storeId: 's1', orderId: 'o9' },
    });
  });
});

describe('StoreOps — routeParams preselect', () => {
  it('loads the hinted store when arriving via deep link', async () => {
    shared.routeParams = { storeId: 's1', orderId: 'o9' };
    shared.orders = [order('o1')];
    const { fetchStoreOrders } = await import('../../services/order-service');
    render(
      <AppProvider>
        <PilotStoreOpsScreen />
      </AppProvider>,
    );
    await waitFor(() =>
      expect(vi.mocked(fetchStoreOrders)).toHaveBeenCalledWith('s1'),
    );
  });
});

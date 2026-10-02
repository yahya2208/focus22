/**
 * G2.3 Command Center — independent, read-only Orders workspace.
 *
 * Order facts:
 * - subtotal, delivery fee, and total are server values, shown verbatim and
 *   never recomputed, summed, or relabeled as revenue/sales/profit/balance/debt
 * - ordered item quantities and line totals are ordered facts; delivered
 *   actuals have no admin read path and are never shown
 * - missing optional facts render "—", never a fabricated zero
 * - detail and timeline load lazily, exactly once each, and cached detail is reused
 * - a failed timeline renders "unavailable", never an empty timeline
 *
 * Structure:
 * - Orders is its own AdminShell view (no legacy surface mounted)
 * - it renders without a prior Families or Finance visit
 * - store changes refetch the list once; search/filter/detail/navigation do not
 * - realtime refresh updates the list without rereading the catalog
 * - there is no status, preparation, delivery, settlement, or inventory control
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const mock = vi.hoisted(() => ({
  stores: [
    { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: '', slug: 's1', status: 'active', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
    { id: 's2', neighborhood_id: 'n1', name: 'S2', name_ar: '', slug: 's2', status: 'active', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
  ],
  orders: {} as Record<string, Array<Record<string, unknown>>>,
  families: [] as Array<Record<string, unknown>>,
  orderCalls: [] as string[],
  orderFails: new Set<string>(),
  orderGate: null as null | Promise<unknown>,
  productCalls: [] as string[],
  feedCalls: [] as Array<{ onPayload: () => void; onPollFetch: () => Promise<void> | void }>,
  detailCalls: [] as string[],
  detailRejects: new Set<string>(),
  detailGate: null as null | { promise: Promise<Record<string, unknown>>; resolve: (value: Record<string, unknown>) => void },
  timelineCalls: [] as string[],
  timelineRejects: new Set<string>(),
  timelineGate: null as null | { promise: Promise<Record<string, unknown>>; resolve: (value: Record<string, unknown>) => void },
  familyCalls: 0,
  memberCalls: 0,
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111',
    border: '#222', danger: '#f00', dangerText: '#f00', successText: '#0f0', warning: '#ff0',
    accentLight: '#0cf',
  }),
}));
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({ status: 'ready', courierEntry: 'none', operatorEntry: 'none', isAdmin: true }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'a1', role: 'admin' } },
    service: {},
    researchRole: 'user',
  }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => vi.fn() };
});
vi.mock('../../services/neighborhood-service', () => ({
  adminListNeighborhoods: async () => [
    { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
  ],
  adminListStores: async () => mock.stores,
  adminListOperators: vi.fn(async () => []),
  fetchMyStores: vi.fn(async () => []),
  fetchStoreProducts: async (storeId: string) => {
    mock.productCalls.push(storeId);
    return [];
  },
  adminFindUsers: vi.fn(async () => []),
  adminListFamilies: async () => {
    mock.familyCalls += 1;
    return mock.families;
  },
}));
vi.mock('../../services/courier-service', () => ({
  adminListCouriers: vi.fn(async () => []),
  fetchOrderDetail: async (orderId: string) => {
    mock.detailCalls.push(orderId);
    if (mock.detailGate) return mock.detailGate.promise;
    if (mock.detailRejects.has(orderId)) throw new Error('DETAIL_FAILED');
    return {
      order: {
        id: orderId,
        order_number: 'FC-101',
        customer_name: 'Amina',
        status: 'preparing',
        subtotal: 100,
        delivery_fee: 7.5,
        total: 250,
        notes: null,
        address: null,
        zone_id: null,
        zone_name: 'Zone 1',
        zone_name_ar: '',
        store_id: 's1',
        store_name: 'S1',
        store_name_ar: '',
        neighborhood_id: 'n1',
        neighborhood_name: 'N1',
        user_id: 'u1',
        courier_user_id: null,
        courier_assigned_at: null,
        created_at: '2026-09-29T10:00:00.000Z',
        updated_at: '2026-09-29T10:05:00.000Z',
      },
      items: [
        {
          id: 'i1',
          category_id: null,
          catalog_ref: 'veg-tomato',
          name: 'Tomatoes',
          unit_price: 50,
          quantity: 2,
          line_total: 100,
        },
      ],
    };
  },
}));
vi.mock('../../services/readiness-service', () => ({ setOperationalReady: vi.fn() }));
vi.mock('../../services/pilot-start-service', () => ({
  fetchPilotStartStatus: vi.fn(async () => null),
  startPilot: vi.fn(),
}));
vi.mock('../../services/order-service', () => ({
  PILOT_ORDER_STATUSES: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
  fetchPilotHealth: vi.fn(async () => null),
  fetchStoreOrders: async (storeId: string) => {
    mock.orderCalls.push(storeId);
    if (mock.orderGate) await mock.orderGate;
    if (mock.orderFails.has(storeId)) throw new Error('ORDER_LOAD_FAILED');
    return (mock.orders[storeId] ?? []).map((order) => ({ ...order }));
  },
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: (options: { onPayload: () => void; onPollFetch: () => Promise<void> | void }) => {
    mock.feedCalls.push(options);
    return { start: vi.fn(), stop: vi.fn() };
  },
}));
vi.mock('../../services/pilot-account-service', () => ({
  adminListFamilyMembers: async () => {
    mock.memberCalls += 1;
    return [];
  },
  adminDeposit: vi.fn(),
  adminProvisionFamilyMember: vi.fn(),
  adminUpsertFamily: vi.fn(),
  adminFamilyLedger: vi.fn(async () => []),
  adminFamilyPreferences: vi.fn(async () => null),
}));
vi.mock('../../services/pilot-invite-service', () => ({
  adminListInvitations: async () => [],
  sendFamilyInvitation: vi.fn(),
  resendFamilyInvitation: vi.fn(),
  messageKeyFor: (code: string) => code,
  successMessageKeyFor: (resent: boolean) => (resent ? 'INVITATION_RESENT' : 'INVITATION_SENT'),
  toInviteOutcome: (r: { ok: boolean }) => (r.ok ? { kind: 'sent' } : { kind: 'noop' }),
  invitationChip: () => ({ labelKey: 'invite.status.operational', canResend: false, operational: true }),
  isOperationalMember: () => false,
  invitationReasonKey: (code: string) => code,
}));
vi.mock('../../services/admin-triage-service', () => ({ composeAdminTriage: vi.fn(() => []) }));
vi.mock('../../services/order-tracking-service', () => ({
  fetchOrderTimeline: async (orderId: string) => {
    mock.timelineCalls.push(orderId);
    if (mock.timelineGate) return mock.timelineGate.promise;
    if (mock.timelineRejects.has(orderId)) throw new Error('TIMELINE_FAILED');
    return {
      order_id: orderId,
      events: [
        {
          id: 'e1',
          order_id: orderId,
          previous_status: 'confirmed',
          new_status: 'preparing',
          event_type: 'status_changed',
          actor_user_id: null,
          actor_role: 'admin',
          reason: '',
          created_at: '2026-09-29T10:02:00.000Z',
        },
      ],
    };
  },
}));
vi.mock('../../screens/pilot/Gate8bE2eProvisionHarness', () => ({ Gate8bE2eProvisionHarness: () => null }));

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';
import en from '../../i18n/translations/en';

const order = (value: Record<string, unknown>) => ({
  id: 'o1',
  order_number: 'FC-101',
  customer_name: 'Amina',
  status: 'preparing',
  subtotal: 100,
  delivery_fee: 7.5,
  total: 250,
  created_at: '2026-09-29T10:00:00.000Z',
  store_id: 's1',
  neighborhood_id: 'n1',
  user_id: 'u1',
  courier_user_id: null,
  family_id: 'f1',
  ...value,
});

const legacyMarkers = ['pilot.startPilotTitle', 'pilot.reset', 'cc-section-orders', 'cc-section-team'];

async function openOrders() {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText('cc.navOrders'));
  await screen.findByText('cc.ordTitle');
}

describe('G2.3 command orders workspace', () => {
  beforeEach(() => {
    mock.families = [
      { id: 'f1', name: 'Monouni', name_ar: '', slug: 'monouni', status: 'active', description: '', created_at: '', updated_at: '' },
    ];
    mock.orders = {
      s1: [
        order({}),
        order({
          id: 'o2',
          order_number: 'FC-102',
          customer_name: null,
          status: 'delivered',
          subtotal: 30,
          delivery_fee: 5,
          total: 35,
          family_id: null,
        }),
      ],
      s2: [order({ id: 'o3', order_number: 'FC-201', status: 'confirmed', store_id: 's2' })],
    };
    mock.orderCalls = [];
    mock.orderFails = new Set();
    mock.orderGate = null;
    mock.productCalls = [];
    mock.feedCalls = [];
    mock.detailCalls = [];
    mock.detailRejects = new Set();
    mock.detailGate = null;
    mock.timelineCalls = [];
    mock.timelineRejects = new Set();
    mock.timelineGate = null;
    mock.familyCalls = 0;
    mock.memberCalls = 0;
  });

  it('renders as an independent view with no legacy surface mounted', async () => {
    await openOrders();
    for (const marker of legacyMarkers) expect(screen.queryByText(marker)).toBeNull();
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
    expect(screen.queryByText('cc.finBalancesTitle')).toBeNull();
  });

  it('renders server money verbatim and never recomputes the total', async () => {
    await openOrders();
    // The server says 100 + 7.50 = 250 here. 107.50 would be client arithmetic.
    await screen.findByText('FC-101');
    expect(screen.getAllByText('250 دج').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('107.5');
  });

  it('shows server subtotal, delivery fee, and total in the lazy detail', async () => {
    await openOrders();
    fireEvent.click(await screen.findByText('FC-101'));
    expect(await screen.findByText('100 دج')).toBeTruthy();
    expect(await screen.findByText('7.5 دج')).toBeTruthy();
    // 250 دج is the same server fact in the selected row and the detail panel.
    await waitFor(() => expect(screen.getAllByText('250 دج').length).toBe(2));
    expect(document.body.textContent).not.toContain('107.5');
  });

  it('renders missing optional facts as unavailable, never as zero', async () => {
    await openOrders();
    const missing = screen.getByText('FC-102').closest('button') as HTMLElement;
    // null customer and the mock's missing display values become "—".
    expect(missing.textContent).toContain('—');
    expect(missing.textContent).not.toContain('NaN');
    expect(missing.textContent).not.toContain('0 دج');
  });

  it('contains no revenue, sales, profit, balance, or debt concept', async () => {
    await openOrders();
    fireEvent.click(await screen.findByText('FC-101'));
    await screen.findByText(/Tomatoes/);
    for (const label of ['revenue', 'sales', 'profit', 'balance', 'debt']) {
      expect(document.body.textContent?.toLowerCase()).not.toContain(label);
    }
    const orderCopy = Object.entries(en)
      .filter(([key]) => key.startsWith('cc.ord'))
      .map(([, value]) => value)
      .join(' ')
      .toLowerCase();
    for (const label of ['revenue', 'sales', 'profit', 'balance', 'debt']) {
      expect(orderCopy).not.toContain(label);
    }
  });

  it('refetches the list exactly once per store change', async () => {
    await openOrders();
    await screen.findByText('FC-101');
    expect(mock.orderCalls).toEqual(['s1']);

    fireEvent.change(screen.getByLabelText('cc.ordStoreLabel'), { target: { value: 's2' } });
    await screen.findByText('FC-201');
    expect(mock.orderCalls).toEqual(['s1', 's2']);
    expect(screen.queryByText('FC-101')).toBeNull();

    fireEvent.change(screen.getByLabelText('cc.ordStoreLabel'), { target: { value: 's1' } });
    await screen.findByText('FC-101');
    expect(mock.orderCalls).toEqual(['s1', 's2', 's1']);
  });

  it('searches and filters locally without additional list reads', async () => {
    await openOrders();
    await screen.findByText('FC-101');
    const calls = mock.orderCalls.length;

    fireEvent.change(screen.getByLabelText('cc.ordSearchPlaceholder'), { target: { value: 'amina' } });
    expect(screen.getByText('FC-101')).toBeTruthy();
    expect(screen.queryByText('FC-102')).toBeNull();
    fireEvent.change(screen.getByLabelText('cc.ordStatusLabel'), { target: { value: 'delivered' } });
    expect(screen.queryByText('FC-101')).toBeNull();
    expect(mock.orderCalls.length).toBe(calls);
  });

  it('loads detail and timeline lazily, exactly once each, then reuses the cache', async () => {
    await openOrders();
    await screen.findByText('FC-101');
    const detailBefore = mock.detailCalls.length;
    const timelineBefore = mock.timelineCalls.filter((id) => id === 'o1').length;

    fireEvent.click(screen.getByText('FC-101'));
    await screen.findByText(/Tomatoes/);
    expect(mock.detailCalls.length).toBe(detailBefore + 1);
    expect(mock.timelineCalls.filter((id) => id === 'o1').length).toBe(timelineBefore + 1);
    expect(mock.orderCalls.length).toBe(1);

    fireEvent.click(screen.getByText('cc.ordCloseDetail'));
    await screen.findByText('cc.ordSelectPrompt');
    fireEvent.click(screen.getByText('FC-101'));
    await screen.findByText(/Tomatoes/);
    expect(mock.detailCalls.length).toBe(detailBefore + 1);
    expect(mock.timelineCalls.filter((id) => id === 'o1').length).toBe(timelineBefore + 1);
    expect(mock.orderCalls.length).toBe(1);
  });

  it('reports a timeline failure as unavailable, not as an empty timeline', async () => {
    mock.orders.s1 = [
      order({}),
      order({ id: 'o9', order_number: 'FC-109', status: 'confirmed', total: 75 }),
    ];
    mock.timelineRejects = new Set(['o9']);
    await openOrders();
    fireEvent.click(await screen.findByText('FC-109'));
    expect(await screen.findByText('pilot.error.TIMELINE_FAILED')).toBeTruthy();
    expect(screen.queryByText('pilot.noTimeline')).toBeNull();
    expect(await screen.findByText(/Tomatoes/)).toBeTruthy();
  });

  it('reports a detail failure without hiding the timeline read path', async () => {
    mock.detailRejects = new Set(['o1']);
    await openOrders();
    fireEvent.click(await screen.findByText('FC-101'));
    expect(await screen.findByText('pilot.error.DETAIL_FAILED')).toBeTruthy();
    expect(await screen.findByText('confirmed')).toBeTruthy();
    expect(screen.queryByText('Tomatoes')).toBeNull();
  });

  it('makes list and detail loading explicit', async () => {
    mock.orderGate = new Promise(() => {});
    render(<PilotOpsAdminScreen />);
    fireEvent.click(await screen.findByText('cc.navOrders'));
    await screen.findByText('cc.ordTitle');
    expect(screen.getByText('pilot.loading')).toBeTruthy();
  });

  it('makes lazy detail loading explicit before payloads arrive', async () => {
    const detailGate = deferred<Record<string, unknown>>();
    const timelineGate = deferred<Record<string, unknown>>();
    mock.detailGate = detailGate;
    mock.timelineGate = timelineGate;
    await openOrders();
    fireEvent.click(await screen.findByText('FC-101'));
    await waitFor(() => expect(screen.getAllByText('pilot.loading').length).toBeGreaterThan(0));
    detailGate.resolve({
      order: {
        id: 'o1',
        order_number: 'FC-101',
        customer_name: 'Amina',
        status: 'preparing',
        subtotal: 100,
        delivery_fee: 7.5,
        total: 250,
      },
      items: [],
    });
    timelineGate.resolve({ order_id: 'o1', events: [] });
    await screen.findByText('cc.ordNoItems');
    expect(screen.getByText('pilot.noTimeline')).toBeTruthy();
  });

  it('renders without visiting Families or Finance first', async () => {
    await openOrders();
    await screen.findByText('FC-101');
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
    expect(screen.queryByText('cc.finBalancesTitle')).toBeNull();
  });

  it('navigates Home to Orders and back without duplicate list reads', async () => {
    render(<PilotOpsAdminScreen />);
    await screen.findByText('cc.quickOrders');
    fireEvent.click(screen.getByText('cc.quickOrders'));
    await screen.findByText('cc.ordTitle');
    await screen.findByText('FC-101');
    const calls = mock.orderCalls.length;

    fireEvent.click(screen.getByText('cc.navHome'));
    await screen.findByText('cc.quickOrders');
    fireEvent.click(screen.getByText('cc.navOrders'));
    await screen.findByText('cc.ordTitle');
    await screen.findByText('FC-101');
    expect(mock.orderCalls.length).toBe(calls);
  });

  it('applies a realtime update without rereading the catalog', async () => {
    await openOrders();
    await screen.findByText('FC-101');
    const orders = mock.orderCalls.length;
    const products = mock.productCalls.length;
    const feed = mock.feedCalls[mock.feedCalls.length - 1];
    expect(feed).toBeTruthy();

    mock.orders.s1 = (mock.orders.s1 ?? []).map((item) =>
      item.id === 'o1' ? { ...item, status: 'confirmed' } : item,
    );
    feed?.onPayload();
    await screen.findByText('confirmed');
    expect(mock.orderCalls.length).toBe(orders + 1);
    expect(mock.productCalls.length).toBe(products);
  });

  it('has no status mutation control and only the two read-only selects', async () => {
    await openOrders();
    await screen.findByText('FC-101');
    expect(screen.queryByLabelText('order status')).toBeNull();
    const labels = [...document.querySelectorAll('select')]
      .map((select) => select.getAttribute('aria-label'))
      .sort();
    expect(labels).toEqual(['cc.ordStatusLabel', 'cc.ordStoreLabel'].sort());
  });
});

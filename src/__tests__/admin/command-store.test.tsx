/**
 * G2.4 Command Center — independent, read-only Store workspace.
 *
 * Store facts:
 * - identity, status, neighborhood, description, and contact render exactly
 *   as stored; missing optional facts render "—", never a fabricated value
 * - available products come from the existing `fetchStoreProducts` read only
 * - `unit` is the unit source of truth; the derived `sell_unit` column is
 *   never read
 * - price, quantity, category, and published status are displayed verbatim;
 *   nothing is recomputed, summed, or relabeled
 * - the list is titled "available" because the source returns buyable rows
 *   only — never a full inventory
 * - a failed product read renders "unavailable", never an empty catalog
 *
 * Structure:
 * - Store is its own AdminShell view (no legacy surface mounted)
 * - `storeId` stays owned by the host: switching stores in Store also moves
 *   Orders, and switching never refetches the store catalog
 * - search filters locally without additional reads
 * - no revenue / sales / profit / balance / debt claim appears
 * - no status, order, settlement, delivery, inventory, or membership control
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  neighborhoods: [
    { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
  ],
  stores: [
    { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: 'S1-ar', slug: 's1', status: 'active', operator_user_id: null, description: 'Main store', contact_phone: '0555000000', created_at: '', updated_at: '' },
    { id: 's2', neighborhood_id: 'n1', name: 'S2', name_ar: '', slug: 's2', status: 'inactive', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
  ],
  products: {} as Record<string, Array<Record<string, unknown>>>,
  storeCalls: 0,
  productCalls: [] as string[],
  productRejects: new Set<string>(),
  productGate: null as null | Promise<unknown>,
  orderCalls: [] as string[],
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
  adminListNeighborhoods: async () => mock.neighborhoods,
  adminListStores: async () => {
    mock.storeCalls += 1;
    return mock.stores;
  },
  adminListOperators: vi.fn(async () => []),
  fetchMyStores: vi.fn(async () => []),
  fetchStoreProducts: async (storeId: string) => {
    mock.productCalls.push(storeId);
    if (mock.productGate) await mock.productGate;
    if (mock.productRejects.has(storeId)) throw new Error('PRODUCTS_UNAVAILABLE');
    return (mock.products[storeId] ?? []).map((p) => ({ ...p }));
  },
  adminFindUsers: vi.fn(async () => []),
  adminListFamilies: vi.fn(async () => []),
}));
vi.mock('../../services/courier-service', () => ({
  adminListCouriers: vi.fn(async () => []),
  fetchOrderDetail: vi.fn(),
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
    return [];
  },
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('../../services/pilot-account-service', () => ({
  adminListFamilyMembers: vi.fn(async () => []),
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
vi.mock('../../services/order-tracking-service', () => ({ fetchOrderTimeline: vi.fn() }));
vi.mock('../../screens/pilot/Gate8bE2eProvisionHarness', () => ({ Gate8bE2eProvisionHarness: () => null }));

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';
import en from '../../i18n/translations/en';

const product = (value: Record<string, unknown>) => ({
  id: 'p1',
  model_id: 'm1',
  brand: 'Atlas',
  model: 'Tomato',
  variant: 'Round',
  condition: 'fresh',
  quantity: 2.5,
  status: 'in_stock',
  sell_price: 120,
  is_published: true,
  city: null,
  description: null,
  source_key: 'pilot:veg-tomato',
  category: 'produce',
  unit: 'kg',
  ...value,
});

const legacyMarkers = ['pilot.startPilotTitle', 'pilot.reset', 'cc-section-orders', 'cc-section-team'];

async function openStore() {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText('cc.navStore'));
  await screen.findByText('cc.stIdentityTitle');
}

describe('G2.4 command store workspace', () => {
  beforeEach(() => {
    mock.products = {
      s1: [
        product({}),
        product({
          id: 'p2',
          brand: 'Basic',
          model: 'Phone',
          variant: 'X',
          quantity: 3,
          status: 'low_stock',
          sell_price: null,
          category: 'phone',
          unit: null,
          // A legacy display column the Store workspace must ignore.
          sell_unit: 'kg',
        }),
      ],
      s2: [
        product({ id: 'p3', model: 'Carrot', variant: '', quantity: 10, sell_price: 45 }),
      ],
    };
    mock.storeCalls = 0;
    mock.productCalls = [];
    mock.productRejects = new Set();
    mock.productGate = null;
    mock.orderCalls = [];
  });

  it('renders as an independent view with no legacy surface mounted', async () => {
    await openStore();
    for (const marker of legacyMarkers) expect(screen.queryByText(marker)).toBeNull();
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
    expect(screen.queryByText('cc.finBalancesTitle')).toBeNull();
    expect(screen.queryByText('cc.ordTitle')).toBeNull();
  });

  it('opens through the Store nav entry', async () => {
    render(<PilotOpsAdminScreen />);
    fireEvent.click(await screen.findByText('cc.navStore'));
    await screen.findByText('cc.stIdentityTitle');
    await screen.findByText('cc.stInventoryTitle');
    // The stale legacy target is gone: Store never lands on legacy.
    for (const marker of legacyMarkers) expect(screen.queryByText(marker)).toBeNull();
  });

  it('keeps storeId owned by the host: switching in Store also moves Orders', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    fireEvent.change(screen.getByLabelText('cc.stStoreLabel'), { target: { value: 's2' } });
    await screen.findByText(/Carrot/);

    fireEvent.click(screen.getByText('cc.navOrders'));
    await screen.findByText('cc.ordTitle');
    expect(mock.orderCalls[mock.orderCalls.length - 1]).toBe('s2');

    fireEvent.click(screen.getByText('cc.navStore'));
    await screen.findByText('cc.stIdentityTitle');
    await screen.findByText(/Carrot/);
  });

  it('fetches the catalog once per store and never refetches the store list', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    expect(mock.productCalls).toEqual(['s1']);
    const stores = mock.storeCalls;

    fireEvent.change(screen.getByLabelText('cc.stStoreLabel'), { target: { value: 's2' } });
    await screen.findByText(/Carrot/);
    expect(mock.productCalls).toEqual(['s1', 's2']);
    expect(mock.storeCalls).toBe(stores);

    const products = mock.productCalls.length;
    fireEvent.change(screen.getByLabelText('cc.stSearchPlaceholder'), { target: { value: 'tom' } });
    expect(screen.queryByText(/Carrot/)).toBeNull();
    expect(mock.productCalls.length).toBe(products);
  });

  it('renders store identity, status, and neighborhood exactly as stored', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    // Title, identity row, and the selector option all carry the stored name.
    expect(screen.getAllByText('S1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('S1-ar')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('N1')).toBeTruthy();
    expect(screen.getByText('Main store')).toBeTruthy();
    expect(screen.getByText('0555000000')).toBeTruthy();
  });

  it('renders missing optional facts as unavailable, never as zero', async () => {
    await openStore();
    fireEvent.change(screen.getByLabelText('cc.stStoreLabel'), { target: { value: 's2' } });
    await screen.findByText(/Carrot/);
    // s2 has no Arabic name, description, or contact: all three are "—".
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent).not.toContain('0 دج');
  });

  it('reads products verbatim: price, quantity, category, and published source', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    expect(screen.getAllByText(/120 دج/).length).toBe(1);
    expect(screen.getByText(/2\.5/)).toBeTruthy();
    expect(screen.getByText(/produce/)).toBeTruthy();
  });

  it('uses unit as the unit source and ignores sell_unit', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    // Only p1 (unit kg) may contribute "kg"; p2 carries sell_unit kg with a
    // null canonical unit and must render "—" instead.
    const occurrences = (document.body.textContent ?? '').split('kg').length - 1;
    expect(occurrences).toBe(1);
  });

  it('makes product loading explicit', async () => {
    mock.productGate = new Promise(() => {});
    render(<PilotOpsAdminScreen />);
    fireEvent.click(await screen.findByText('cc.navStore'));
    await screen.findByText('cc.stIdentityTitle');
    expect(screen.getByText('pilot.loading')).toBeTruthy();
  });

  it('reports an empty catalog honestly', async () => {
    mock.products.s1 = [];
    await openStore();
    expect(await screen.findByText('pilot.emptyProducts')).toBeTruthy();
  });

  it('reports a failed product read as unavailable, with a working retry', async () => {
    mock.productRejects = new Set(['s1']);
    await openStore();
    expect(await screen.findByText('cc.stProductsUnavailable')).toBeTruthy();
    expect(screen.queryByText(/Tomato/)).toBeNull();

    mock.productRejects = new Set();
    fireEvent.click(screen.getByText('cc.stRetry'));
    await screen.findByText(/Tomato/);
    expect(screen.queryByText('cc.stProductsUnavailable')).toBeNull();
  });

  it('contains no revenue, sales, profit, balance, or debt concept', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    for (const label of ['revenue', 'sales', 'profit', 'balance', 'debt']) {
      expect(document.body.textContent?.toLowerCase()).not.toContain(label);
    }
    const storeCopy = Object.entries(en)
      .filter(([key]) => key.startsWith('cc.st'))
      .map(([, value]) => value)
      .join(' ')
      .toLowerCase();
    for (const label of ['revenue', 'sales', 'profit', 'balance', 'debt']) {
      expect(storeCopy).not.toContain(label);
    }
  });

  it('has no mutation, settlement, delivery, or inventory control', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    expect(screen.queryByLabelText('order status')).toBeNull();
    const selects = [...document.querySelectorAll('select')].map((s) => s.getAttribute('aria-label'));
    expect(selects).toEqual(['cc.stStoreLabel']);
    expect(document.querySelectorAll('input[type="number"]').length).toBe(0);
    for (const key of [
      'pilot.settleAndDeliver',
      'pilot.markDelivered',
      'pilot.confirmOrder',
      'pilot.startPreparing',
      'pilot.depositAction',
    ]) {
      expect(screen.queryByText(key)).toBeNull();
    }
  });

  it('leaves Orders unaffected', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    const products = mock.productCalls.length;
    fireEvent.click(screen.getByText('cc.navOrders'));
    await screen.findByText('cc.ordTitle');
    expect(screen.getByText('pilot.noStoreOrders')).toBeTruthy();
    expect(mock.productCalls.length).toBe(products);
  });

  it('leaves Finance unaffected', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    const products = mock.productCalls.length;
    fireEvent.click(screen.getByText('cc.navFinance'));
    await screen.findByText('cc.finBalancesTitle');
    expect(mock.productCalls.length).toBe(products);
  });

  it('leaves Store Ops untouched', async () => {
    await openStore();
    await screen.findByText(/Tomato/);
    fireEvent.click(screen.getByText('cc.navOrders'));
    await screen.findByText('cc.ordTitle');
    // The operational screen is a separate route the host never renders.
    expect(screen.queryByText('pilot.storeOpsTitle')).toBeNull();
  });
});

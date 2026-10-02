/**
 * Consolidation — independent Research workspace.
 *
 * Research facts:
 * - the existing ResearchConsole renders DIRECTLY here: all 13 dashboard
 *   tabs for a research_admin, permission-filtered tabs for lesser roles
 * - dashboards, tabs, and write paths (inventory, ads, campaigns) keep their
 *   exact behavior; nothing is rebuilt or reduced to read-only
 * - the route-level permission gate (scientific/read) is preserved: denied
 *   roles see the denial screen and no dashboard content mounts
 *
 * Structure:
 * - Research is its own AdminShell view (no legacy surface mounted)
 * - no status, order, settlement, delivery, inventory-decrement, ledger, or
 *   membership control is added here; the console owns its own internals
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  role: 'admin' as string,
  researchRole: 'research_admin' as string,
  dispatch: vi.fn(),
}));

function tableStub(): unknown {
  return new Proxy(function () {}, {
    get: (_t, p) =>
      p === 'then'
        ? (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], count: 0, error: null }).then(res)
        : tableStub(),
    apply: () => tableStub(),
  });
}

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111',
    border: '#222', danger: '#f00', dangerText: '#f00', successText: '#0f0', warning: '#ff0',
    accentLight: '#0cf', accent: '#0cf',
  }),
}));
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({ status: 'ready', courierEntry: 'none', operatorEntry: 'none', isAdmin: true }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'a1', role: mock.role } },
    service: {},
    researchRole: mock.researchRole,
  }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => mock.dispatch };
});
vi.mock('../../services/neighborhood-service', () => ({
  adminListNeighborhoods: async () => [],
  adminListStores: async () => [],
  adminListOperators: vi.fn(async () => []),
  fetchMyStores: vi.fn(async () => []),
  fetchStoreProducts: vi.fn(async () => []),
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
  fetchStoreOrders: vi.fn(async () => []),
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
vi.mock('../../core/telemetry', () => ({ track: vi.fn(async () => {}) }));
vi.mock('../../core/research/api-supabase', () => ({
  // Data calls pend forever: dashboards render their headers/skeletons
  // without crashing and without any assertion on payload shapes.
  createResearchAPI: () => new Proxy({}, { get: () => () => new Promise(() => {}) }),
}));
vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => tableStub(),
    rpc: async () => ({ data: null, error: { message: 'X', code: 'X' } }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const legacyMarkers = ['pilot.startPilotTitle', 'pilot.reset', 'cc-section-orders', 'cc-section-team'];

const ALL_TABS = [
  'research.nav.overview',
  'research.nav.scientific',
  'research.nav.users',
  'research.nav.sessions',
  'research.nav.devices',
  'research.nav.system',
  'research.nav.inventory',
  'research.nav.catalog-health',
  'research.nav.variant-coverage',
  'research.nav.inventory-health',
  'research.nav.price-memory',
  'research.nav.ads',
  'research.nav.campaigns',
];

async function openResearch() {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText('cc.navResearch'));
  await screen.findByText('overview.title');
}

function consoleTabs() {
  const nav = screen.getByLabelText('Research console navigation');
  return within(nav as HTMLElement)
    .getAllByRole('button')
    .map((b) => b.textContent);
}

describe('consolidation research workspace', () => {
  beforeEach(() => {
    mock.role = 'admin';
    mock.researchRole = 'research_admin';
    mock.dispatch.mockClear();
  });

  it('renders as an independent view with no legacy surface mounted', async () => {
    await openResearch();
    for (const marker of legacyMarkers) expect(screen.queryByText(marker)).toBeNull();
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
    expect(screen.queryByText('cc.finBalancesTitle')).toBeNull();
    expect(screen.queryByText('cc.ordTitle')).toBeNull();
  });

  it('embeds the full console: all 13 dashboard tabs for super_admin', async () => {
    mock.researchRole = 'super_admin';
    await openResearch();
    const tabs = consoleTabs();
    expect(tabs).toHaveLength(13);
    for (const tab of ALL_TABS) {
      expect(tabs.some((t) => t?.includes(tab))).toBe(true);
    }
  });

  it('research_admin sees 12 tabs: devices is excluded by the permission matrix', async () => {
    await openResearch();
    const tabs = consoleTabs();
    expect(tabs).toHaveLength(12);
    expect(tabs.some((t) => t?.includes('research.nav.devices'))).toBe(false);
    expect(tabs.some((t) => t?.includes('research.nav.campaigns'))).toBe(true);
  });

  it('filters tabs by role: analyst sees neither campaigns nor devices', async () => {
    mock.researchRole = 'analyst';
    await openResearch();
    const tabs = consoleTabs();
    expect(tabs).toHaveLength(11);
    expect(tabs.some((t) => t?.includes('research.nav.campaigns'))).toBe(false);
    expect(tabs.some((t) => t?.includes('research.nav.devices'))).toBe(false);
    expect(tabs.some((t) => t?.includes('research.nav.overview'))).toBe(true);
  });

  it('denies viewer and none roles before any dashboard mounts', async () => {
    for (const role of ['viewer', 'none']) {
      mock.researchRole = role;
      const view = render(<PilotOpsAdminScreen />);
      fireEvent.click(await screen.findByText('cc.navResearch'));
      expect(await screen.findByText('accessDenied.title')).toBeTruthy();
      expect(screen.queryByText('overview.title')).toBeNull();
      view.unmount();
    }
  });

  it('preserves the console back behavior: back navigates home', async () => {
    await openResearch();
    fireEvent.click(await screen.findByText('research.back'));
    expect(mock.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'home' });
  });
});

/**
 * Consolidation — independent Telemetry workspace.
 *
 * Telemetry facts:
 * - TelemetryAnalyticsBI renders DIRECTLY here, never through the Business
 *   Intelligence Center (no Treasure Mode, no BI tab bar)
 * - aggregates only: totals, daily sparkline, top business entities, domain
 *   funnels; no raw telemetry row path exists
 * - operational event counters come from the host-owned pilot health read;
 *   a missing read renders "unavailable", never zeros
 * - telemetry.* settings reuse the existing AdminSettingsBI component scoped
 *   to the telemetry category (same rows, RPCs, audit — no second system)
 * - a failed analytics read renders rpc-failure/unauthorized/empty states,
 *   never fabricated data
 *
 * Structure:
 * - Telemetry is its own AdminShell view (no legacy surface mounted)
 * - the route-level permission gate (scientific/read) is preserved: denied
 *   roles see the denial screen and no analytics read is issued
 * - no status, order, settlement, delivery, inventory, ledger, or membership
 *   control exists here
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  role: 'admin' as string,
  researchRole: 'research_admin' as string,
  analyticsCalls: 0,
  analyticsImpl: null as null | ((filters: unknown) => Promise<unknown>),
  settings: {} as Record<string, { value: unknown }>,
  setSetting: vi.fn(async () => ({ error: null, saved: null })),
  health: null as null | { telemetry: { order_created: number; order_completed: number; order_failed: number } },
  orderCalls: [] as string[],
}));

const AGGREGATE = {
  error: null,
  totals: { total_events: 42, unique_sessions: 7, unique_visitors: 5, unique_users: 2 },
  events_by_event: [{ event: 'order_created', count: 40 }],
  events_by_domain: [{ domain: 'order', count: 40 }],
  daily: [{ date: '2026-09-01', count: 40 }],
  top_entities: [{ entity_type: 'order', entity_id: 'o1', count: 3 }],
};

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
  return { ...actual, useAppDispatch: () => vi.fn() };
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
  fetchPilotHealth: vi.fn(async () => mock.health),
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
vi.mock('../../core/telemetry', () => ({ track: vi.fn(async () => {}) }));
vi.mock('../../business-intelligence/telemetry-api', () => ({
  getTelemetryAnalytics: async (filters: unknown) => {
    mock.analyticsCalls += 1;
    if (mock.analyticsImpl) return mock.analyticsImpl(filters);
    return AGGREGATE;
  },
  // Mirrors of the real helpers (same contract, tested in telemetry suites).
  isTelemetryUnauthorized: (r: { error: unknown }) => r?.error === 'UNAUTHORIZED',
  isTelemetryEmpty: (r: { totals?: { total_events?: number } }) => (r?.totals?.total_events ?? 0) === 0,
}));
vi.mock('../../business-intelligence/settings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../business-intelligence/settings-api')>();
  return {
    ...actual,
    getSettings: async () => ({ error: null, settings: mock.settings }),
    setSetting: (...args: unknown[]) => (mock.setSetting as (...a: unknown[]) => Promise<unknown>)(...args),
    getSettingsAudit: vi.fn(async () => ({ error: null, changes: [] })),
    refreshRuntimeSettings: vi.fn(async () => {}),
  };
});

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const legacyMarkers = ['pilot.startPilotTitle', 'pilot.reset', 'cc-section-orders', 'cc-section-team'];

async function openTelemetry() {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText('cc.navTelemetry'));
  await screen.findByText('cc.navTelemetry', { selector: 'h2' });
}

describe('consolidation telemetry workspace', () => {
  beforeEach(() => {
    mock.role = 'admin';
    mock.researchRole = 'research_admin';
    mock.analyticsCalls = 0;
    mock.analyticsImpl = null;
    mock.settings = {
      'telemetry.max_batch': { value: 10 },
      'telemetry.flush_ms': { value: 5000 },
      'telemetry.max_buffer': { value: 50 },
    };
    mock.setSetting.mockClear();
    mock.health = null;
    mock.orderCalls = [];
  });

  it('renders as an independent view with no legacy surface mounted', async () => {
    await openTelemetry();
    for (const marker of legacyMarkers) expect(screen.queryByText(marker)).toBeNull();
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
    expect(screen.queryByText('cc.finBalancesTitle')).toBeNull();
    expect(screen.queryByText('cc.ordTitle')).toBeNull();
  });

  it('opens the analytics directly, never through the BI center', async () => {
    await openTelemetry();
    // Aggregated analytics content is present…
    expect(await screen.findByText('Total events')).toBeTruthy();
    expect(await screen.findByText('42')).toBeTruthy();
    // …but the BI center shell (default Treasure tab) is never mounted.
    expect(screen.queryByText('Treasure Mode')).toBeNull();
    expect(screen.queryByText('Business Intelligence Center')).toBeNull();
  });

  it('shows aggregates only: no raw identifiers anywhere', async () => {
    await openTelemetry();
    await screen.findByText('Total events');
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const forbidden of ['user_id', 'session_id', 'anonymous_id', 'telemetry_events']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('shows operational counters from the host health read, verbatim', async () => {
    mock.health = { telemetry: { order_created: 1101, order_completed: 2202, order_failed: 3303 } };
    await openTelemetry();
    await screen.findByText('cc.telHealthTitle');
    expect(screen.getByText(/1101/)).toBeTruthy();
    expect(screen.getByText(/2202/)).toBeTruthy();
    expect(screen.getByText(/3303/)).toBeTruthy();
  });

  it('renders unavailable counters when the health read is missing, never zeros', async () => {
    await openTelemetry();
    expect(await screen.findByText('cc.telHealthUnavailable')).toBeTruthy();
    expect(document.body.textContent).not.toContain('0 دج');
  });

  it('scopes settings to telemetry: same component, no second system', async () => {
    await openTelemetry();
    // Telemetry rows render…
    expect(await screen.findByText('Flush batch size')).toBeTruthy();
    expect(screen.getByText('Flush interval (ms)')).toBeTruthy();
    // …while non-telemetry categories never render.
    expect(screen.queryByText('Total rounds')).toBeNull();
    expect(screen.queryByText('Default discount (%)')).toBeNull();
    // Viewing issues no write.
    expect(mock.setSetting).not.toHaveBeenCalled();
  });

  it('reports an RPC failure as a transport error, not empty data', async () => {
    mock.analyticsImpl = async () => null;
    await openTelemetry();
    expect(await screen.findByText('RPC failure')).toBeTruthy();
    expect(screen.queryByText('No telemetry data')).toBeNull();
  });

  it('reports a denied role as unauthorized without fabricating data', async () => {
    mock.analyticsImpl = async () => ({ error: 'UNAUTHORIZED' });
    await openTelemetry();
    expect(await screen.findByText('Access denied')).toBeTruthy();
    expect(screen.queryByText('Total events')).toBeNull();
  });

  it('denies roles without the research capability before any read', async () => {
    mock.researchRole = 'none';
    // No module header renders for denied roles: navigate, then assert denial.
    render(<PilotOpsAdminScreen />);
    fireEvent.click(await screen.findByText('cc.navTelemetry'));
    expect(await screen.findByText('accessDenied.title')).toBeTruthy();
    expect(mock.analyticsCalls).toBe(0);
  });
});

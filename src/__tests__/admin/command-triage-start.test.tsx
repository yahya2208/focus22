/**
 * G0-A — Pilot Ops host safety/consistency fixes.
 *
 * Proves each Discovery item against the rendered host:
 * 1. Triage: member items (destination 'pilot-admin', i.e. the screen already
 *    mounted) now EXECUTE the existing member handlers instead of dispatching
 *    a NAVIGATE to themselves. Order/store items keep their navigation.
 * 2. Pilot START: a failed status read renders the error, never a permanent
 *    loading label.
 * 3. Reset: the danger button is admin-gated like the other admin controls.
 *    (Client-side consistency only — the authoritative guard is server-side in
 *    00065 pilot_reset/fn_admin_uid. No RPC is invoked by this suite.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  role: 'admin' as string,
  startStatus: null as unknown,
  startStatusError: false,
  dispatch: vi.fn(),
  setOperatorStatus: vi.fn(async (_storeId: string, _userId: string, _status: string) => null),
  setCourierStatus: vi.fn(async (_storeId: string, _userId: string, _status: string) => null),
  setOperationalReady: vi.fn(async (_input: { memberKind: string; storeId: string; userId: string; ready: boolean; reason: string }) => null),
  resetPilot: vi.fn(async () => null),
  triage: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111',
    border: '#222', danger: '#f00', dangerText: '#f00', successText: '#0f0',
    warning: '#fa0', accentLight: '#0cf',
  }),
}));
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({ status: 'ready', courierEntry: 'none', operatorEntry: 'none', isAdmin: true }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'a1', role: mock.role } },
    service: {},
    researchRole: 'user',
  }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => mock.dispatch };
});
vi.mock('../../services/neighborhood-service', () => ({
  adminListNeighborhoods: vi.fn(async () => [
    { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
  ]),
  adminListStores: vi.fn(async () => [
    { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: '', slug: 's1', status: 'active', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
  ]),
  adminListOperators: vi.fn(async () => []),
  adminListFamilies: vi.fn(async () => []),
  adminSetOperatorStatus: (storeId: string, userId: string, status: string) =>
    mock.setOperatorStatus(storeId, userId, status),
  adminFindUsers: vi.fn(async () => []),
}));
vi.mock('../../services/courier-service', () => ({
  adminListCouriers: vi.fn(async () => []),
  adminSetCourierStatus: (storeId: string, userId: string, status: string) =>
    mock.setCourierStatus(storeId, userId, status),
  fetchOrderDetail: vi.fn(),
}));
vi.mock('../../services/readiness-service', () => ({
  setOperationalReady: (input: { memberKind: string; storeId: string; userId: string; ready: boolean; reason: string }) =>
    mock.setOperationalReady(input),
}));
vi.mock('../../services/pilot-start-service', () => ({
  fetchPilotStartStatus: vi.fn(async () => {
    if (mock.startStatusError) throw new Error('RPC_DOWN');
    return mock.startStatus;
  }),
  startPilot: vi.fn(),
}));
vi.mock('../../services/order-service', () => ({
  fetchPilotHealth: vi.fn(async () => null),
  fetchStoreOrders: vi.fn(async () => []),
  resetPilot: () => mock.resetPilot(),
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
  adminListInvitations: vi.fn(async () => []),
  sendInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  sendFamilyInvitation: vi.fn(),
  resendFamilyInvitation: vi.fn(),
  messageKeyFor: (code: string) => code,
  successMessageKeyFor: (resent: boolean) => (resent ? 'INVITATION_RESENT' : 'INVITATION_SENT'),
  toInviteOutcome: (r: { ok: boolean }) => (r.ok ? { kind: 'sent' } : { kind: 'noop' }),
  invitationChip: () => ({ labelKey: 'invite.status.operational', canResend: false, operational: true }),
  isOperationalMember: () => false,
  invitationReasonKey: (code: string) => code,
}));
vi.mock('../../services/admin-triage-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/admin-triage-service')>();
  return { ...actual, composeAdminTriage: () => mock.triage };
});
vi.mock('../../services/order-tracking-service', () => ({ fetchOrderTimeline: vi.fn() }));
vi.mock('../../screens/pilot/Gate8bE2eProvisionHarness', () => ({ Gate8bE2eProvisionHarness: () => null }));

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

/** A minimal but SHAPE-COMPLETE not-started status (all preconditions unmet). */
const NOT_STARTED = {
  started: false,
  run: null,
  store: { id: 's1', status: 'active', operator_user_id: null, active: true, linked: true },
  operator: null,
  courier: null,
  preconditions: {
    store_active: true,
    operator_linked: false,
    operator_active: false,
    operator_ready: false,
    courier_linked: false,
    courier_active: false,
    courier_ready: false,
  },
  ready: false,
  valid: null,
  validReasons: [],
};

function triageItem(over: Record<string, unknown>) {
  return {
    entityType: 'operator',
    entityId: 'u1',
    severity: 'action-required',
    reasonKey: 'triage.memberPending',
    detail: 'd',
    destination: 'pilot-admin',
    action: { kind: 'approve-member', labelKey: 'triage.approve' },
    ...over,
  };
}

/** Open the legacy staff surface, which owns triage + START + reset. */
async function openLegacy() {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText('cc.navTeam'));
  return screen.findByText('pilot.operatorsTitle');
}

describe('G0-A Pilot Ops host', () => {
  beforeEach(() => {
    mock.role = 'admin';
    mock.startStatus = NOT_STARTED;
    mock.startStatusError = false;
    mock.triage = [];
    mock.dispatch.mockClear();
    mock.setOperatorStatus.mockClear();
    mock.setCourierStatus.mockClear();
    mock.setOperationalReady.mockClear();
    mock.resetPilot.mockClear();
  });

  it('triage: member approve calls the operator status write, not a self-Navigate', async () => {
    mock.triage = [triageItem({})];
    await openLegacy();
    fireEvent.click(await screen.findByText('triage.approve'));

    await waitFor(() => expect(mock.setOperatorStatus).toHaveBeenCalledWith('s1', 'u1', 'active'));
    expect(mock.dispatch).not.toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'pilot-admin' });
  });

  it('triage: courier approve calls the courier status write', async () => {
    mock.triage = [triageItem({ entityType: 'courier', entityId: 'c1' })];
    await openLegacy();
    fireEvent.click(await screen.findByText('triage.approve'));

    await waitFor(() => expect(mock.setCourierStatus).toHaveBeenCalledWith('s1', 'c1', 'active'));
  });

  it('triage: member set-ready calls the readiness write with its member kind', async () => {
    mock.triage = [
      triageItem({ action: { kind: 'set-ready', labelKey: 'triage.setReady' } }),
      triageItem({
        entityType: 'courier',
        entityId: 'c1',
        action: { kind: 'set-ready', labelKey: 'triage.setReady' },
      }),
    ];
    await openLegacy();
    const setReadyButtons = await screen.findAllByText('triage.setReady');
    expect(setReadyButtons).toHaveLength(2);
    for (const btn of setReadyButtons) fireEvent.click(btn);

    await waitFor(() => expect(mock.setOperationalReady).toHaveBeenCalledTimes(2));
    expect(mock.setOperationalReady).toHaveBeenCalledWith(
      expect.objectContaining({ memberKind: 'operator', userId: 'u1', ready: true }),
    );
    expect(mock.setOperationalReady).toHaveBeenCalledWith(
      expect.objectContaining({ memberKind: 'courier', userId: 'c1', ready: true }),
    );
  });

  it('triage: order items keep navigating to pilot-store-ops (writes live there)', async () => {
    mock.triage = [
      triageItem({
        entityType: 'order',
        entityId: 'o1',
        severity: 'watch',
        destination: 'pilot-store-ops',
        action: { kind: 'view-detail', labelKey: 'triage.viewDetail' },
      }),
    ];
    await openLegacy();
    fireEvent.click(await screen.findByText('triage.viewDetail'));

    await waitFor(() =>
      expect(mock.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'pilot-store-ops' }),
    );
    expect(mock.setOperatorStatus).not.toHaveBeenCalled();
    expect(mock.setCourierStatus).not.toHaveBeenCalled();
  });

  it('START: a failed status read shows the error, never a stuck loading label', async () => {
    mock.startStatusError = true;
    await openLegacy();
    // 'pilot.loading' is the loading label; the failure must replace it.
    // The key renders twice by design: the page banner and the START panel.
    await waitFor(() => expect(screen.getAllByText('pilot.error.START_STATUS_FAILED').length).toBeGreaterThan(0));
    expect(screen.queryByText('pilot.loading')).toBeNull();
  });

  it('START: a successful read still renders the honest not-started state', async () => {
    await openLegacy();
    await screen.findByText('pilot.pilotNotStarted');
    expect(screen.queryByText('pilot.error.START_STATUS_FAILED')).toBeNull();
    expect(screen.queryByText('pilot.loading')).toBeNull();
  });

  it('reset: the danger button is admin-gated', async () => {
    mock.role = 'user';
    await openLegacy();
    expect(screen.queryByText('pilot.resetPilot')).toBeNull();
  });

  it('reset: visible to admins, and never fires an RPC in this suite', async () => {
    await openLegacy();
    expect(await screen.findByText('pilot.resetPilot')).toBeTruthy();
    expect(mock.resetPilot).not.toHaveBeenCalled();
  });
});

/**
 * GATE 1B — PilotOpsAdminScreen invitation surface.
 * Chip mapping (operational / no invitation / sent / resending), send/resend
 * contract to the pilot-invite Edge Function, map-of-error-codes, admin-only
 * gating, and the manouniyahya00-style operational-member protection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';

const mock = vi.hoisted(() => ({
  adminListNeighborhoods: vi.fn(),
  adminListStores: vi.fn(),
  adminListFamilies: vi.fn(),
  adminListOperators: vi.fn(),
  adminListCouriers: vi.fn(),
  fetchPilotHealth: vi.fn(),
  fetchStoreOrders: vi.fn(),
  setOperationalReady: vi.fn(),
  fetchPilotStartStatus: vi.fn(),
  startPilot: vi.fn(),
  adminListInvitations: vi.fn(),
  sendInvitation: vi.fn(),
  resendInvitation: vi.fn(),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

let authState: { status: string; user: { role: string } | null; error: null };
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: authState,
    service: {},
    researchRole: 'user',
  }),
}));

vi.mock('../../services/neighborhood-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/neighborhood-service')>(
    '../../services/neighborhood-service',
  );
  return {
    ...actual,
    adminListNeighborhoods: mock.adminListNeighborhoods,
    adminListStores: mock.adminListStores,
    adminListFamilies: mock.adminListFamilies,
    adminListOperators: mock.adminListOperators,
  };
});

vi.mock('../../services/courier-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/courier-service')>(
    '../../services/courier-service',
  );
  return {
    ...actual,
    adminListCouriers: mock.adminListCouriers,
  };
});

vi.mock('../../services/readiness-service', () => ({
  setOperationalReady: mock.setOperationalReady,
}));

vi.mock('../../services/pilot-start-service', () => ({
  fetchPilotStartStatus: mock.fetchPilotStartStatus,
  startPilot: mock.startPilot,
}));

vi.mock('../../services/order-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/order-service')>(
    '../../services/order-service',
  );
  return {
    ...actual,
    fetchPilotHealth: mock.fetchPilotHealth,
    fetchStoreOrders: mock.fetchStoreOrders,
  };
});

vi.mock('../../services/pilot-invite-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/pilot-invite-service')>(
    '../../services/pilot-invite-service',
  );
  return {
    ...actual,
    adminListInvitations: mock.adminListInvitations,
    sendInvitation: mock.sendInvitation,
    resendInvitation: mock.resendInvitation,
  };
});

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const health = {
  neighborhoods: 1, stores: 1, families: 0, couriers: 1,
  orders: { total: 0, pending: 0, confirmed: 0, preparing: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 },
  telemetry: { order_created: 0, order_completed: 0, order_failed: 0 },
};

const NOT_STARTED = {
  started: false,
  run: null,
  store: { id: 's1', status: 'active', operator_user_id: 'u1', active: true, linked: true },
  operator: { user_id: 'u1', status: 'active', operational_ready: true, active: true, ready: true, linked: true },
  courier: { user_id: 'u4', store_id: 's1', status: 'active', operational_ready: true, linked: true, active: true, ready: true },
  preconditions: {
    store_active: true, operator_linked: true, operator_active: true, operator_ready: true,
    courier_linked: true, courier_active: true, courier_ready: true,
  },
  ready: true,
  valid: null,
  validReasons: [],
};

const operationalCourier = {
  id: 'cm1', store_id: 's1', user_id: 'u4', status: 'active', operational_ready: true,
  created_at: '2026-09-13T00:00:00Z', updated_at: '2026-09-13T00:00:00Z',
  user_email: 'opc@focus.local', user_name: 'opc@focus.local',
};

const pendingCourier = {
  id: 'cm2', store_id: 's1', user_id: 'u5', status: 'pending', operational_ready: false,
  created_at: '2026-09-13T00:00:00Z', updated_at: '2026-09-13T00:00:00Z',
  user_email: 'pend@focus.local', user_name: 'pend@focus.local',
};

const sentRow = {
  invite_email: 'pend@focus.local',
  member_kind: 'courier',
  channel: 'invite',
  status: 'SENT',
  sent_count: 1,
  first_sent_at: '2026-09-13T09:00:00Z',
  last_sent_at: '2026-09-13T09:00:00Z',
  pending_at: '2026-09-13T08:55:00Z',
  accepted_at: null,
  password_set_at: null,
  completed_at: null,
  created_at: '2026-09-13T08:55:00Z',
  updated_at: '2026-09-13T09:00:00Z',
};

function renderScreen() {
  return render(
    <AppProvider>
      <PilotOpsAdminScreen />
    </AppProvider>,
  );
}

describe('PilotOpsAdminScreen — invitation lifecycle (Gate 1B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { status: 'authenticated', user: { role: 'admin' }, error: null };
    mock.adminListNeighborhoods.mockResolvedValue([
      { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
    ]);
    mock.adminListStores.mockResolvedValue([
      { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: '', slug: 's1', status: 'active', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
    ]);
    mock.adminListFamilies.mockResolvedValue([]);
    mock.fetchPilotHealth.mockResolvedValue(health);
    mock.fetchStoreOrders.mockResolvedValue([]);
    mock.adminListOperators.mockResolvedValue([]);
    mock.adminListCouriers.mockResolvedValue([pendingCourier, operationalCourier]);
    mock.setOperationalReady.mockResolvedValue({ event_type: 'noop' });
    mock.fetchPilotStartStatus.mockResolvedValue(NOT_STARTED);
    mock.startPilot.mockResolvedValue({});
    mock.adminListInvitations.mockResolvedValue([]);
    mock.sendInvitation.mockResolvedValue({ ok: true, code: 'INVITATION_SENT' });
    mock.resendInvitation.mockResolvedValue({ ok: true, code: 'INVITATION_RESENT' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('operational members (active + ready) show the ready chip with NO send/resend affordance', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListCouriers).toHaveBeenCalled());
    expect(screen.getAllByText('invite.status.operational').length).toBeGreaterThan(0);
    // The operational member's OWN invite-control strip must render the ready
    // badge with no Send/Retry/Resend — the pendingCourier card and the
    // standalone form are separate regions and may legitimately show Send.
    const chip = screen.getAllByText('invite.status.operational')[0]!;
    const memberStrip = chip.closest('div');
    expect(memberStrip).not.toBeNull();
    const strip = within(memberStrip!);
    expect(strip.queryByText('invite.send')).toBeNull();
    expect(strip.queryByText('invite.retry')).toBeNull();
    expect(strip.queryByText('invite.resend')).toBeNull();
  });

  it('a member with no invitation row shows SEND (never operational)', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListCouriers).toHaveBeenCalled());
    // pendingCourier has no row -> noInvitation chip + send button on its card.
    expect(screen.getAllByText('invite.status.noInvitation').length).toBeGreaterThan(0);
    const sendButtons = screen.getAllByText('invite.send');
    // Card send (before the standalone form button).
    fireEvent.click(sendButtons[0]!);
    await waitFor(() =>
      expect(mock.sendInvitation).toHaveBeenCalledWith({
        storeId: 's1',
        role: 'courier',
        email: 'pend@focus.local',
      }),
    );
    await waitFor(() => expect(screen.getByText('pilot.msg.INVITE_SENT_OK')).toBeTruthy());
  });

  it('a SENT row renders resend and calls the resend contract', async () => {
    mock.adminListInvitations.mockResolvedValue([sentRow]);
    renderScreen();
    await waitFor(() => expect(mock.adminListInvitations).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('invite.status.sent').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText('invite.resend')[0]!);
    await waitFor(() =>
      expect(mock.resendInvitation).toHaveBeenCalledWith({
        storeId: 's1',
        role: 'courier',
        email: 'pend@focus.local',
      }),
    );
    expect(mock.sendInvitation).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('pilot.msg.INVITE_RESENT_OK')).toBeTruthy());
  });

  it('sends from the standalone invite form for an email with no membership yet', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListCouriers).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('invite.emailPlaceholder'), {
      target: { value: 'new@focus.local' },
    });
    const sendButtons = screen.getAllByText('invite.send');
    fireEvent.click(sendButtons[sendButtons.length - 1]!);
    await waitFor(() =>
      expect(mock.sendInvitation).toHaveBeenCalledWith({
        storeId: 's1',
        role: 'courier',
        email: 'new@focus.local',
      }),
    );
  });

  it('maps an EF cooldown code to the existing pilot.error namespace', async () => {
    mock.resendInvitation.mockResolvedValue({ ok: false, code: 'COOLDOWN_ACTIVE' });
    mock.adminListInvitations.mockResolvedValue([sentRow]);
    renderScreen();
    await waitFor(() => expect(screen.getAllByText('invite.resend').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText('invite.resend')[0]!);
    await waitFor(() => expect(screen.getByText('pilot.error.INVITE_COOLDOWN')).toBeTruthy());
  });

  it('hides every invitation affordance for non-admin roles', async () => {
    authState = { status: 'authenticated', user: { role: 'user' }, error: null };
    renderScreen();
    await waitFor(() => expect(mock.adminListCouriers).toHaveBeenCalled());
    expect(screen.queryByText('invite.send')).toBeNull();
    expect(screen.queryByText('invite.resend')).toBeNull();
    expect(screen.queryByText('invite.retry')).toBeNull();
    expect(mock.sendInvitation).not.toHaveBeenCalled();
  });
});
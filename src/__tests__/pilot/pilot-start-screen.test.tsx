/**
 * GATE 8B Step 4 — PilotOpsAdminScreen PILOT START surface (00086).
 * Precondition checklist → READY TO START / BLOCKED aggregate → admin-only
 * START action → read-only STARTED run view (Run #N, started_at, Option A
 * drift validity). Failure to confirm or non-admin role never mutates.
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

const STARTED = {
  ...NOT_STARTED,
  started: true,
  run: {
    run_id: 'r1', run_index: 1, store_id: 's1', operator_user_id: 'u1', courier_user_id: 'u4',
    actor_user_id: 'a1', actor_role: 'admin', started_at: '2026-09-08T00:00:00Z', created_at: '2026-09-08T00:00:00Z',
  },
  valid: true,
  validReasons: [],
};

const BLOCKED = {
  ...NOT_STARTED,
  preconditions: { ...NOT_STARTED.preconditions, operator_ready: false },
  ready: false,
};

const pendingCourier = {
  id: 'cm1', store_id: 's1', user_id: 'u3', status: 'pending', operational_ready: false,
  created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T00:00:00Z',
  user_email: 'co@focus.local', user_name: 'co@focus.local',
};
const readyCourier = {
  id: 'cm2', store_id: 's1', user_id: 'u4', status: 'active', operational_ready: true,
  created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T00:00:00Z',
  user_email: 'co2@focus.local', user_name: 'co2@focus.local',
};

let started = false;

function renderScreen() {
  return render(
    <AppProvider>
      <PilotOpsAdminScreen />
    </AppProvider>,
  );
}

describe('PilotOpsAdminScreen — pilot START surface (00086)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    started = false;
    authState = { status: 'authenticated', user: { role: 'admin' }, error: null };
    mock.adminListNeighborhoods.mockResolvedValue([
      { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
    ]);
    mock.adminListStores.mockResolvedValue([
      { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: '', slug: 's1', status: 'active', operator_user_id: 'u1', description: '', contact_phone: '', created_at: '', updated_at: '' },
    ]);
    mock.adminListFamilies.mockResolvedValue([]);
    mock.fetchPilotHealth.mockResolvedValue(health);
    mock.fetchStoreOrders.mockResolvedValue([]);
    mock.adminListOperators.mockResolvedValue([
      { id: 'om1', store_id: 's1', user_id: 'u1', status: 'active', operational_ready: true, approved_by: 'a1', approved_at: '2026-09-08T00:00:00Z', created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T00:00:00Z', user_email: 'op@focus.local', user_name: 'op@focus.local' },
    ]);
    mock.adminListCouriers.mockResolvedValue([pendingCourier, readyCourier]);
    mock.setOperationalReady.mockResolvedValue({ event_type: 'noop' });
    mock.adminListInvitations.mockResolvedValue([]);
    mock.fetchPilotStartStatus.mockImplementation(() =>
      Promise.resolve(started ? STARTED : NOT_STARTED),
    );
    mock.startPilot.mockImplementation(async () => {
      started = true;
      return {
        run_id: 'r1', run_index: 1, store_id: 's1', operator_user_id: 'u1', courier_user_id: 'u4', actor_user_id: 'a1', actor_role: 'admin', status: 'started', started_at: '2026-09-08T00:00:00Z', event_type: 'pilot_started',
      };
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('pre-START: shows the precondition checklist and READY TO START for admins', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('pilot.readyToStart')).toBeTruthy());
    const panel = screen.getByText('pilot.readyToStart').closest('div')!;
    for (const check of ['store_active', 'operator_linked', 'operator_active', 'operator_ready', 'courier_linked', 'courier_active', 'courier_ready']) {
      expect(within(panel).getByText((c) => c.includes(`pilot.check.${check}`))).toBeTruthy();
    }
    expect(screen.getByText('pilot.startPilot')).toBeTruthy();
  });

  it('STARTS with the designated courier and then renders the read-only Started view', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('pilot.readyToStart')).toBeTruthy());

    fireEvent.click(screen.getByText('pilot.startPilot'));
    expect(window.confirm).toHaveBeenCalledWith('pilot.startPilotConfirm');
    await waitFor(() =>
      expect(mock.startPilot).toHaveBeenCalledWith({ storeId: 's1', courierUserId: 'u4' }),
    );
    await waitFor(() => expect(screen.getByText('pilot.msg.START_OK')).toBeTruthy());
    // Read-only Started view: Run #1, started_at, validity, and NO START button.
    await waitFor(() =>
      expect(screen.getByText((c) => c.includes('pilot.pilotStarted') && c.includes('pilot.runLabel') && c.includes('#1'))).toBeTruthy(),
    );
    expect(screen.getByText((c) => c.includes('pilot.startedAt'))).toBeTruthy();
    expect(screen.getByText((c) => c.includes('pilot.startValid'))).toBeTruthy();
    expect(screen.queryByText('pilot.startPilot')).toBeNull();
  });

  it('BLOCKED: aggregate is NOT ready, START is disabled, nothing mutates', async () => {
    mock.fetchPilotStartStatus.mockReturnValue(Promise.resolve(BLOCKED));
    renderScreen();
    await waitFor(() => expect(screen.getByText('pilot.blockedToStart')).toBeTruthy());
    const btn = screen.getByText('pilot.startPilot').closest('button')!;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByText('pilot.startPilot'));
    expect(mock.startPilot).not.toHaveBeenCalled();
  });

  it('declined confirm never mutates (no START, no re-fetch to started)', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderScreen();
    await waitFor(() => expect(screen.getByText('pilot.readyToStart')).toBeTruthy());
    fireEvent.click(screen.getByText('pilot.startPilot'));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mock.startPilot).not.toHaveBeenCalled();
    expect(screen.queryByText('pilot.msg.START_OK')).toBeNull();
  });

  it('already-started store renders the Started view read-only from the start', async () => {
    started = true;
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText((c) => c.includes('pilot.pilotStarted') && c.includes('#1'))).toBeTruthy(),
    );
    expect(screen.queryByText('pilot.startPilot')).toBeNull();
    expect(screen.queryByText('pilot.blockedToStart')).toBeNull();
  });

  it('surfaces ALREADY_STARTED from the RPC without re-mutating', async () => {
    mock.startPilot.mockRejectedValue(new Error('ALREADY_STARTED'));
    renderScreen();
    await waitFor(() => expect(screen.getByText('pilot.readyToStart')).toBeTruthy());
    fireEvent.click(screen.getByText('pilot.startPilot'));
    await waitFor(() => expect(screen.getByText('pilot.error.ALREADY_STARTED')).toBeTruthy());
  });

  it('hides the pilot START controls for non-admin roles', async () => {
    authState = { status: 'authenticated', user: { role: 'user' }, error: null };
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    expect(screen.queryByText('pilot.startPilot')).toBeNull();
    expect(screen.queryByText('pilot.readyToStart')).toBeNull();
    expect(screen.queryByText('pilot.blockedToStart')).toBeNull();
  });
});
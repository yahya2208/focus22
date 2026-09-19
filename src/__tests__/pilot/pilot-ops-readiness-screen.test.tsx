/**
 * GATE 8B Step 2C — PilotOpsAdminScreen operational readiness controls.
 * Admin-only Mark ready / Clear ready surface: distinct ACTIVE + READY/NOT
 * READY display, server-truth refresh after mutation, confirmation on clear,
 * no controls for non-ready-eligible members, no controls for non-admin roles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

function renderScreen() {
  return render(
    <AppProvider>
      <PilotOpsAdminScreen />
    </AppProvider>,
  );
}

const readyOperator = {
  id: 'om1', store_id: 's1', user_id: 'u1', status: 'active', operational_ready: true,
  approved_by: 'a1', approved_at: '2026-09-08T00:00:00Z',
  created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T00:00:00Z',
  user_email: 'op@focus.local', user_name: 'op@focus.local',
};
const notReadyOperator = { ...readyOperator, id: 'om2', user_id: 'u2', operational_ready: false };
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

describe('PilotOpsAdminScreen — operational readiness (00085)', () => {
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
    mock.adminListOperators.mockResolvedValue([notReadyOperator, readyOperator]);
    mock.adminListCouriers.mockResolvedValue([pendingCourier, readyCourier]);
    mock.setOperationalReady.mockResolvedValue({ event_type: 'noop' });
    mock.adminListInvitations.mockResolvedValue([]);
    mock.fetchPilotStartStatus.mockResolvedValue({
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
    });
    mock.startPilot.mockResolvedValue({ run_id: 'r1', run_index: 1, store_id: 's1', operator_user_id: 'u1', courier_user_id: 'u4', actor_user_id: 'a1', actor_role: 'admin', status: 'started', started_at: '2026-09-08T00:00:00Z', event_type: 'pilot_started' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('displays ACTIVE + READY/NOT READY distinctly (not conflated)', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    await waitFor(() => expect(mock.adminListCouriers).toHaveBeenCalled());
    // READY and NOT READY chips both render for the active members (span text is
    // "<status> · <readiness>" so two dimensions are shown independently).
    expect(screen.getAllByText(/pilot\.ready/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/pilot\.notReady/).length).toBeGreaterThan(0);
  });

  it('shows Mark ready only for ACTIVE + NOT READY members', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('pilot.markReady').length).toBeGreaterThan(0));
    // Pending courier must NOT show any readiness control.
    expect(screen.queryAllByText('pilot.markReady').length).toBe(1);
    expect(screen.queryAllByText('pilot.clearReady').length).toBe(2);
  });

  it('Mark ready calls the readiness RPC for the right member and refreshes lists', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListOperators).toHaveBeenCalled());

    fireEvent.click(screen.getAllByText('pilot.markReady')[0]!);
    await waitFor(() =>
      expect(mock.setOperationalReady).toHaveBeenCalledWith({
        memberKind: 'operator', storeId: 's1', userId: 'u2', ready: true, reason: '',
      }),
    );
    // Refresh after mutation (server truth).
    await waitFor(() => expect(mock.adminListOperators).toHaveBeenCalledTimes(2));
  });

  it('Clear ready requires an explicit confirm (declined -> no mutation)', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('pilot.clearReady').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText('pilot.clearReady')[0]!);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mock.setOperationalReady).not.toHaveBeenCalled();
  });

  it('Clear ready proceeds after confirmation and maps the clear contract', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('pilot.clearReady').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText('pilot.clearReady')[0]!);
    await waitFor(() =>
      expect(mock.setOperationalReady).toHaveBeenCalledWith({
        memberKind: 'operator', storeId: 's1', userId: 'u1', ready: false, reason: 'admin manual clear',
      }),
    );
    expect(window.confirm).toHaveBeenCalledWith('pilot.clearReadyConfirm');
  });

  it('surfaces a failed readiness mutation', async () => {
    mock.setOperationalReady.mockRejectedValue(new Error('22023'));
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('pilot.markReady').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText('pilot.markReady')[0]!);
    await waitFor(() => expect(screen.getByText('pilot.error.READY_FAILED')).toBeTruthy());
  });

  it('hides readiness controls for non-admin roles (user/guest)', async () => {
    authState = { status: 'authenticated', user: { role: 'user' }, error: null };
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    await waitFor(() => expect(mock.adminListCouriers).toHaveBeenCalled());
    expect(screen.queryByText('pilot.markReady')).toBeNull();
    expect(screen.queryByText('pilot.clearReady')).toBeNull();
  });
});
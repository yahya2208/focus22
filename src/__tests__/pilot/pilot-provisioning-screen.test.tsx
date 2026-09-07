/**
 * Neighborhood Pilot — PilotOpsAdminScreen provisioning flow (00081).
 * Minimal surface test: find a user by email, add as operator / courier with
 * pending status, and surface the admin-only errors. Services are mocked; the
 * server-side RPC contract (pilot_admin_set_*_status(…, 'pending')) is asserted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';

const mock = vi.hoisted(() => ({
  adminListNeighborhoods: vi.fn(),
  adminListStores: vi.fn(),
  adminListFamilies: vi.fn(),
  adminListOperators: vi.fn(),
  adminSetOperatorStatus: vi.fn(),
  adminFindUsers: vi.fn(),
  adminListCouriers: vi.fn(),
  adminSetCourierStatus: vi.fn(),
  fetchStoreOrders: vi.fn(),
  fetchPilotHealth: vi.fn(),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
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
    adminSetOperatorStatus: mock.adminSetOperatorStatus,
    adminFindUsers: mock.adminFindUsers,
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
    adminSetCourierStatus: mock.adminSetCourierStatus,
  };
});

vi.mock('../../services/order-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/order-service')>(
    '../../services/order-service',
  );
  return {
    ...actual,
    fetchStoreOrders: mock.fetchStoreOrders,
    fetchPilotHealth: mock.fetchPilotHealth,
  };
});

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const health = {
  neighborhoods: 1,
  stores: 1,
  families: 0,
  couriers: 1,
  orders: {
    total: 1,
    pending: 1,
    confirmed: 0,
    preparing: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
  },
  telemetry: { order_created: 1, order_completed: 0, order_failed: 0 },
};

const lookup = {
  user_id: 'u9',
  email: 'candidate@focus.local',
  display_name: 'Candidate',
  role: 'user',
  is_anonymous: false,
  created_at: '2026-09-05T00:00:00Z',
  operator_memberships: [],
  courier_memberships: [],
};

function renderScreen() {
  return render(
    <AppProvider>
      <PilotOpsAdminScreen />
    </AppProvider>,
  );
}

describe('PilotOpsAdminScreen — provisioning (00081)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.adminListNeighborhoods.mockResolvedValue([
      { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
    ]);
    mock.adminListStores.mockResolvedValue([
      { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: '', slug: 's1', status: 'active', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
    ]);
    mock.adminListFamilies.mockResolvedValue([]);
    mock.fetchPilotHealth.mockResolvedValue(health);
    mock.adminListOperators.mockResolvedValue([]);
    mock.adminListCouriers.mockResolvedValue([]);
    mock.fetchStoreOrders.mockResolvedValue([]);
    mock.adminFindUsers.mockResolvedValue([lookup]);
    mock.adminSetOperatorStatus.mockResolvedValue({ status: 'pending' });
    mock.adminSetCourierStatus.mockResolvedValue({ status: 'pending' });
  });

  it('finds a user by email and adds them as a pending operator', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('pilot.emailPlaceholder'), { target: { value: 'candidate@focus.local' } });
    fireEvent.click(screen.getByText('pilot.findUser'));

    await waitFor(() =>
      expect(mock.adminFindUsers).toHaveBeenCalledWith('candidate@focus.local', 20),
    );
    await waitFor(() => expect(screen.getByText('candidate@focus.local')).toBeTruthy());

    fireEvent.click(screen.getByText('pilot.addOperator'));
    await waitFor(() =>
      expect(mock.adminSetOperatorStatus).toHaveBeenCalledWith('s1', 'u9', 'pending'),
    );
    expect(mock.adminSetCourierStatus).not.toHaveBeenCalled();
  });

  it('adds a new courier through pending (never instant-active)', async () => {
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('pilot.emailPlaceholder'), { target: { value: 'candidate@focus.local' } });
    fireEvent.click(screen.getByText('pilot.findUser'));
    await waitFor(() => expect(screen.getByText('pilot.addCourier')).toBeTruthy());

    fireEvent.click(screen.getByText('pilot.addCourier'));
    await waitFor(() =>
      expect(mock.adminSetCourierStatus).toHaveBeenCalledWith('s1', 'u9', 'pending'),
    );
    expect(mock.adminSetOperatorStatus).not.toHaveBeenCalled();
  });

  it('hides provisioning controls until a store exists', async () => {
    mock.adminListStores.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());
    expect(screen.getByText('pilot.provisionStoreHint')).toBeTruthy();
    expect(screen.queryByPlaceholderText('pilot.emailPlaceholder')).toBeNull();
  });

  it('surfaces an admin-only search failure', async () => {
    mock.adminFindUsers.mockRejectedValue(new Error('PERMISSION_DENIED'));
    renderScreen();
    await waitFor(() => expect(mock.adminListStores).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('pilot.emailPlaceholder'), { target: { value: 'x@focus.local' } });
    fireEvent.click(screen.getByText('pilot.findUser'));

    await waitFor(() => expect(screen.getByText('pilot.error.SEARCH_FAILED')).toBeTruthy());
  });
});
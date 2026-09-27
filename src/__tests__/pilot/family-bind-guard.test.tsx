/**
 * Family bind guard (Gate: silent cross-family move).
 * 1. Unlinked user → provision called once, PROVISION_OK, no confirm panel.
 * 2. Same-family user → NO provision call, already-linked info.
 * 3. Other-family user → confirm panel (from → to + financial notice), NO provision yet.
 * 4. Confirm → provision called once with (userId, targetFamilyId).
 * 5. Cancel / family switch → provision never called, panel cleared.
 * 6. Stale membership at confirm time → FAMILY_MOVE_STALE, no provision.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockBox = vi.hoisted(() => ({
  families: [
    { id: 'fam-b', name: 'Family B', name_ar: '', slug: 'fam-b', status: 'active', description: '', created_at: '', updated_at: '' },
    { id: 'fam-a', name: 'Family A', name_ar: '', slug: 'fam-a', status: 'active', description: '', created_at: '', updated_at: '' },
  ],
  members: [] as Array<Record<string, unknown>>,
  searchResults: [] as Array<Record<string, unknown>>,
  provision: vi.fn(async (_userId: string, _familyId: string, _status: string) => ({})),
}));

vi.mock('../../services/neighborhood-service', () => ({
  adminListNeighborhoods: async () => [],
  adminListStores: async () => [],
  adminListFamilies: async () => mockBox.families,
  adminListOperators: async () => [],
  adminSetOperatorStatus: async () => ({}),
  adminFindUsers: async () => mockBox.searchResults,
  fetchStoreProducts: async () => [],
}));
vi.mock('../../services/courier-service', () => ({
  adminListCouriers: async () => [],
  adminSetCourierStatus: async () => ({}),
}));
vi.mock('../../services/readiness-service', () => ({
  setOperationalReady: async () => ({}),
}));
vi.mock('../../services/pilot-start-service', () => ({
  fetchPilotStartStatus: async () => ({}),
  startPilot: async () => ({}),
}));
vi.mock('../../services/order-service', () => ({
  fetchStoreOrders: async () => [],
  updateStoreOrderStatus: async () => ({}),
  resetPilot: async () => ({}),
  fetchPilotHealth: async () => ({
    neighborhoods: 0, stores: 0, families: 0, couriers: 0,
    orders: { total: 0, pending: 0, confirmed: 0, preparing: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 },
    telemetry: { order_created: 0, order_completed: 0, order_failed: 0 },
  }),
  PILOT_ORDER_STATUSES: [],
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: () => {}, stop: () => {}, unsubscribe: () => {} }),
}));
vi.mock('../../services/pilot-account-service', () => ({
  adminListFamilyMembers: async () => mockBox.members,
  adminDeposit: async () => ({}),
  adminProvisionFamilyMember: (userId: string, familyId: string, status: string) =>
    mockBox.provision(userId, familyId, status),
  adminUpsertFamily: async () => ({}),
  adminFamilyLedger: async () => [],
  adminFamilyPreferences: async () => null,
}));
vi.mock('../../services/admin-triage-service', () => ({
  composeAdminTriage: () => [],
}));
vi.mock('../../services/order-tracking-service', () => ({
  fetchOrderTimeline: async () => [],
}));
vi.mock('./Gate8bE2eProvisionHarness', () => ({
  Gate8bE2eProvisionHarness: () => null,
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { id: 'admin1', role: 'admin' } }, service: {} }),
}));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' as const }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({ text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111', border: '#222', danger: '#f00', successText: '#0f0' }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => vi.fn() };
});
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({ status: 'ready', courierEntry: 'none', operatorEntry: 'none', isAdmin: true }),
}));

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const MEMBER_A = {
  member_id: 'm1', family_id: 'fam-a', family_name: 'Family A', user_id: 'u1',
  user_email: 'u1@x.test', role: 'principal', status: 'active', created_at: '', balance: 0,
};
const SEARCH_U1 = { user_id: 'u1', email: 'u1@x.test', display_name: 'U One', role: 'user', is_anonymous: false, created_at: null, operator_memberships: [], courier_memberships: [] };

async function openBindRow() {
  render(<PilotOpsAdminScreen />);
  const select = await screen.findByLabelText('pilot.selectFamily');
  fireEvent.change(select, { target: { value: 'fam-b' } });
  fireEvent.change(screen.getByLabelText('pilot.emailPlaceholder'), { target: { value: 'u1@x.test' } });
  fireEvent.click(screen.getByText('pilot.findUser'));
  await screen.findByText('U One');
  fireEvent.click(screen.getByText('pilot.bindToFamily'));
}

beforeEach(() => {
  mockBox.members = [];
  mockBox.searchResults = [SEARCH_U1];
  mockBox.provision.mockClear();
});

describe('family bind guard', () => {
  it('1: unlinked user provisions directly with success message', async () => {
    mockBox.members = [];
    await openBindRow();
    await waitFor(() => expect(mockBox.provision).toHaveBeenCalledTimes(1));
    expect(mockBox.provision).toHaveBeenCalledWith('u1', 'fam-b', 'active');
    expect(await screen.findByText('pilot.msg.PROVISION_OK')).toBeTruthy();
    expect(screen.queryByText('pilot.familyMoveTitle')).toBeNull();
  });

  it('2: same-family user shows already-linked info, no RPC', async () => {
    mockBox.members = [{ ...MEMBER_A, family_id: 'fam-b', family_name: 'Family B' }];
    await openBindRow();
    expect(await screen.findByText('pilot.msg.FAMILY_ALREADY_LINKED')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockBox.provision).not.toHaveBeenCalled();
  });

  it('3: other-family user opens the confirm panel with names + notice, no RPC', async () => {
    mockBox.members = [MEMBER_A];
    await openBindRow();
    expect(await screen.findByText('pilot.familyMoveTitle')).toBeTruthy();
    expect(screen.getByText('pilot.familyMoveNotice')).toBeTruthy();
    expect(screen.getByText(/Family A → Family B/)).toBeTruthy();
    expect(mockBox.provision).not.toHaveBeenCalled();
  });

  it('4: confirm provisions exactly once with the target family', async () => {
    mockBox.members = [MEMBER_A];
    await openBindRow();
    await screen.findByText('pilot.familyMoveTitle');
    fireEvent.click(screen.getByText('pilot.confirmMove'));
    await waitFor(() => expect(mockBox.provision).toHaveBeenCalledTimes(1));
    expect(mockBox.provision).toHaveBeenCalledWith('u1', 'fam-b', 'active');
    expect(await screen.findByText('pilot.msg.PROVISION_OK')).toBeTruthy();
  });

  it('5: cancel and family-switch never provision', async () => {
    mockBox.members = [MEMBER_A];
    render(<PilotOpsAdminScreen />);
    const select = await screen.findByLabelText('pilot.selectFamily');
    fireEvent.change(select, { target: { value: 'fam-b' } });
    fireEvent.change(screen.getByLabelText('pilot.emailPlaceholder'), { target: { value: 'u1@x.test' } });
    fireEvent.click(screen.getByText('pilot.findUser'));
    await screen.findByText('U One');
    fireEvent.click(screen.getByText('pilot.bindToFamily'));
    await screen.findByText('pilot.familyMoveTitle');
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('pilot.familyMoveTitle')).toBeNull();
    expect(mockBox.provision).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'fam-a' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockBox.provision).not.toHaveBeenCalled();
  });

  it('6: stale membership at confirm time refuses with FAMILY_MOVE_STALE', async () => {
    mockBox.members = [MEMBER_A];
    await openBindRow();
    await screen.findByText('pilot.familyMoveTitle');
    mockBox.members = [];
    fireEvent.click(screen.getByText('pilot.confirmMove'));
    expect(await screen.findByText('pilot.error.FAMILY_MOVE_STALE')).toBeTruthy();
    expect(mockBox.provision).not.toHaveBeenCalled();
  });
});

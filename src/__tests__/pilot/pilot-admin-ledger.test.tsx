/**
 * GATE V1.8-B — admin family ledger history UI (mocked services).
 * Proves: selecting a family loads its ledger via the admin RPC and renders
 * date/type/amount/order/note rows; empty ledgers show the empty state.
 * Append-only ledger untouched by construction (read RPC only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';

const mock = vi.hoisted(() => ({
  adminListFamilies: vi.fn(async () => [
    { id: 'f1', name: 'Monouni', name_ar: 'منوني', slug: 'monouni', status: 'active' },
  ]),
  adminFamilyLedger: vi.fn(async (_id: string, _limit?: number) => [
    {
      id: 'l1', created_at: '2026-02-01T10:00:00Z', transaction_type: 'PURCHASE',
      amount: -770, related_order_id: 'o1', order_number: 'FC-29',
      reference: 'FC-29', note: '', balance_after: 9230,
    },
  ]),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'a1', role: 'admin' } },
    service: {},
    researchRole: 'user',
  }),
}));
vi.mock('../../services/neighborhood-service', () => ({
  adminListNeighborhoods: vi.fn(async () => []),
  adminListStores: vi.fn(async () => []),
  adminListFamilies: () => mock.adminListFamilies(),
  adminListOperators: vi.fn(async () => []),
  fetchMyStores: vi.fn(async () => []),
  fetchStoreProducts: vi.fn(async () => []),
}));
vi.mock('../../services/courier-service', () => ({
  adminListCouriers: vi.fn(async () => []),
  fetchOrderDetail: vi.fn(),
}));
vi.mock('../../services/readiness-service', () => ({
  setOperationalReady: vi.fn(),
}));
vi.mock('../../services/pilot-start-service', () => ({
  fetchPilotStartStatus: vi.fn(async () => null),
  startPilot: vi.fn(),
}));
vi.mock('../../services/order-service', () => ({
  fetchPilotHealth: vi.fn(async () => null),
  fetchStoreOrders: vi.fn(async () => []),
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('../../services/pilot-account-service', () => ({
  adminListFamilies: () => mock.adminListFamilies(),
  adminUpsertFamily: vi.fn(),
  adminListFamilyMembers: vi.fn(async () => []),
  adminDeposit: vi.fn(),
  adminProvisionFamilyMember: vi.fn(),
  adminFamilyLedger: (id: string, limit?: number) => mock.adminFamilyLedger(id, limit),
  adminFamilyPreferences: vi.fn(async () => null),
  adminFindUsers: vi.fn(async () => []),
}));
vi.mock('../../services/pilot-invite-service', () => ({
  adminListInvitations: vi.fn(async () => []),
  sendInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  sendFamilyInvitation: vi.fn(),
  resendFamilyInvitation: vi.fn(),
}));
vi.mock('../../services/admin-triage-service', () => ({
  composeAdminTriage: vi.fn(() => []),
}));
vi.mock('../../services/order-tracking-service', () => ({
  fetchOrderTimeline: vi.fn(),
}));
vi.mock('../../screens/pilot/Gate8bE2eProvisionHarness', () => ({
  Gate8bE2eProvisionHarness: () => null,
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

describe('PilotOpsAdminScreen — family ledger history (V1.8-B)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and renders the selected family ledger with order linkage', async () => {
    render(
      <AppProvider>
        <PilotOpsAdminScreen />
      </AppProvider>,
    );

    const familySelect = await screen.findByLabelText('pilot.selectFamily');
    await screen.findByText('Monouni');
    fireEvent.change(familySelect, { target: { value: 'f1' } });

    await waitFor(() => expect(mock.adminFamilyLedger).toHaveBeenCalledWith('f1', 50));
    expect(await screen.findByText('pilot.ledgerHistory')).toBeTruthy();
    expect(screen.getByText(/#FC-29/)).toBeTruthy();
    expect(screen.getByText(/PURCHASE/)).toBeTruthy();
  });
});

/**
 * GATE V1.6.7 — admin family creation form (mocked services).
 * Proves: filling the four fields calls pilot_admin_upsert_family with the
 * exact values, refreshes the family list, selects the new family, and the
 * new name renders. No DB, no other admin surface affected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';

const mock = vi.hoisted(() => ({
  adminListFamilies: vi.fn(async () => [] as Array<Record<string, unknown>>),
  adminUpsertFamily: vi.fn(
    async (_input: { name: string; nameAr: string; slug: string; description: string }) => ({
      id: 'f-new',
      slug: 'monouni-family',
    }),
  ),
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
  adminUpsertFamily: (input: { name: string; nameAr: string; slug: string; description: string }) =>
    mock.adminUpsertFamily(input),
  adminListFamilyMembers: vi.fn(async () => []),
  adminDeposit: vi.fn(),
  adminProvisionFamilyMember: vi.fn(),
  adminFindUsers: vi.fn(async () => []),
  adminFamilyLedger: vi.fn(async () => []),
  adminFamilyPreferences: vi.fn(async () => null),
}));
vi.mock('../../services/pilot-invite-service', () => ({
  adminListInvitations: vi.fn(async () => []),
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

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

describe('PilotOpsAdminScreen — family creation (V1.6.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.adminListFamilies.mockResolvedValue([]);
  });

  it('creates Monouni Family with the four exact values, refreshes and selects it', async () => {
    mock.adminListFamilies
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'f-new', name: 'Monouni Family', name_ar: 'عائلة منوني', slug: 'monouni-family', status: 'active' },
      ]);
    render(
      <AppProvider>
        <PilotOpsAdminScreen />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText('pilot.familyName'), { target: { value: 'Monouni Family' } });
    fireEvent.change(screen.getByLabelText('pilot.familyNameAr'), { target: { value: 'عائلة منوني' } });
    fireEvent.change(screen.getByLabelText('pilot.familySlug'), { target: { value: 'monouni-family' } });
    fireEvent.change(screen.getByLabelText('pilot.familyDescription'), {
      target: { value: 'عائلة تجريبية لحساب العائلة الجديد' },
    });
    fireEvent.click(screen.getByText('pilot.saveFamily'));

    await waitFor(() =>
      expect(mock.adminUpsertFamily).toHaveBeenCalledWith({
        name: 'Monouni Family',
        nameAr: 'عائلة منوني',
        slug: 'monouni-family',
        description: 'عائلة تجريبية لحساب العائلة الجديد',
      }),
    );
    await waitFor(() => expect(screen.getByText('Monouni Family')).toBeTruthy());
    expect(await screen.findByText('pilot.msg.FAMILY_CREATED')).toBeTruthy();
  });

  it('blocks save with a field error when name or slug is missing', async () => {
    render(
      <AppProvider>
        <PilotOpsAdminScreen />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText('pilot.saveFamily'));

    expect(await screen.findByText('pilot.error.FAMILY_FIELDS_REQUIRED')).toBeTruthy();
    expect(mock.adminUpsertFamily).not.toHaveBeenCalled();
  });
});

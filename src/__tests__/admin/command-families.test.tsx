/**
 * G2.1 Command Center — Families section.
 * Proves the family domain is an independent page, not a legacy anchor:
 * - sidebar entry renders AdminFamilies without mounting the legacy surface
 * - finance/deposit/invite all resolve to the same family page
 * - family balance is the canonical family-level value (no per-member multiply)
 * - empty state is honest; writes flow only through existing admin RPCs
 * - returning home keeps the workspace mounted (no refetch storm, no state loss)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  families: [] as Array<Record<string, unknown>>,
  members: [] as Array<Record<string, unknown>>,
  ledger: [] as Array<Record<string, unknown>>,
  invitations: [] as Array<Record<string, unknown>>,
  deposit: vi.fn(async (_familyId: string, _amount: number, _note: string) => null),
  upsert: vi.fn(async (_input: { name: string; nameAr: string; slug: string; description: string }) => ({
    id: 'f-new',
    slug: 'new-family',
  })),
  sendInvite: vi.fn(async (_input: { storeId: string; email: string }) => ({
    ok: true,
    code: 'INVITATION_SENT',
  })),
  listCalls: 0,
  dispatch: vi.fn(),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111',
    border: '#222', danger: '#f00', dangerText: '#f00', successText: '#0f0',
    accentLight: '#0cf',
  }),
}));
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({ status: 'ready', courierEntry: 'none', operatorEntry: 'none', isAdmin: true }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'a1', role: 'admin' } },
    service: {},
    researchRole: 'user',
  }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => mock.dispatch };
});
vi.mock('../../services/neighborhood-service', () => ({
  adminListNeighborhoods: async () => [
    { id: 'n1', name: 'N1', name_ar: '', slug: 'n1', status: 'active', description: '', created_at: '', updated_at: '' },
  ],
  adminListStores: async () => [
    { id: 's1', neighborhood_id: 'n1', name: 'S1', name_ar: '', slug: 's1', status: 'active', operator_user_id: null, description: '', contact_phone: '', created_at: '', updated_at: '' },
  ],
  adminListOperators: vi.fn(async () => []),
  fetchMyStores: vi.fn(async () => []),
  fetchStoreProducts: vi.fn(async () => []),
  adminFindUsers: vi.fn(async () => []),
  adminListFamilies: async () => {
    mock.listCalls += 1;
    return mock.families;
  },
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
  fetchPilotHealth: vi.fn(async () => null),
  fetchStoreOrders: vi.fn(async () => []),
}));
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: () => ({ start: vi.fn(), stop: vi.fn() }),
}));
vi.mock('../../services/pilot-account-service', () => ({
  adminListFamilyMembers: async () => mock.members,
  adminDeposit: (familyId: string, amount: number, note: string) => mock.deposit(familyId, amount, note),
  adminProvisionFamilyMember: vi.fn(),
  adminUpsertFamily: (input: { name: string; nameAr: string; slug: string; description: string }) =>
    mock.upsert(input),
  adminFamilyLedger: async () => mock.ledger,
  adminFamilyPreferences: vi.fn(async () => null),
}));
vi.mock('../../services/pilot-invite-service', () => ({
  adminListInvitations: async () => mock.invitations,
  sendFamilyInvitation: (input: { storeId: string; email: string }) => mock.sendInvite(input),
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

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const FAMILY = {
  id: 'f1', name: 'Monouni', name_ar: 'منوني', slug: 'monouni',
  status: 'active', description: '', created_at: '', updated_at: '',
};

const legacyMarkers = [
  'pilot.startPilotTitle',
  'pilot.reset',
  'cc-section-orders',
  'cc-section-team',
];

async function openFamilies(nav = 'cc.navFamilies') {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText(nav));
  await screen.findByText('pilot.familyListTitle');
}

describe('G2.1 command families section', () => {
  beforeEach(() => {
    mock.families = [{ ...FAMILY }];
    mock.members = [];
    mock.ledger = [];
    mock.invitations = [];
    mock.listCalls = 0;
    mock.deposit.mockClear();
    mock.dispatch.mockClear();
    mock.upsert.mockClear();
    mock.sendInvite.mockClear();
  });

  it('opens as an independent page and never mounts the legacy surface', async () => {
    await openFamilies();
    expect(screen.getByText('pilot.families')).toBeTruthy();
    for (const marker of legacyMarkers) {
      expect(screen.queryByText(marker)).toBeNull();
    }
  });

  it('finance and the deposit quick action now open Finance, not Families (G2.2)', async () => {
    for (const nav of ['cc.navFinance']) {
      const view = render(<PilotOpsAdminScreen />);
      fireEvent.click(await screen.findByText(nav));
      await screen.findByText('cc.finBalancesTitle');
      expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
      for (const marker of legacyMarkers) {
        expect(screen.queryByText(marker)).toBeNull();
      }
      view.unmount();
    }
  });

  it('home quick action for deposit opens Finance, while invite stays on Families', async () => {
    render(<PilotOpsAdminScreen />);
    fireEvent.click(await screen.findByText('cc.quickDeposit'));
    await screen.findByText('cc.finBalancesTitle');
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();

    fireEvent.click(screen.getByText('cc.navHome'));
    await screen.findByText('cc.quickInvite');
    fireEvent.click(screen.getByText('cc.quickInvite'));
    await screen.findByText('pilot.familyListTitle');
    expect(screen.queryByText('cc.finBalancesTitle')).toBeNull();
  });

  it('shows an honest empty state when no family exists', async () => {
    mock.families = [];
    await openFamilies();
    expect(screen.getAllByText('pilot.noFamilies').length).toBeGreaterThan(0);
  });

  it('shows the family balance once, not once per member', async () => {
    mock.members = [
      { member_id: 'm1', family_id: 'f1', family_name: 'Monouni', user_id: 'u1', user_email: 'u1@x.test', role: 'principal', status: 'active', created_at: '', balance: 6085 },
      { member_id: 'm2', family_id: 'f1', family_name: 'Monouni', user_id: 'u2', user_email: 'u2@x.test', role: 'principal', status: 'active', created_at: '', balance: 6085 },
    ];
    await openFamilies();
    fireEvent.click(await screen.findByText('Monouni'));
    await waitFor(() => expect(mock.ledger).not.toBeUndefined());
    // Canonical family balance only — the repeated per-member value is not summed.
    expect(screen.getAllByText(/6,085\.00|6085\.00/).length).toBe(1);
  });

  it('filters the family list without touching the network', async () => {
    mock.families = [{ ...FAMILY }, { ...FAMILY, id: 'f2', name: 'Berrada', slug: 'berrada' }];
    await openFamilies();
    const callsAfterLoad = mock.listCalls;
    fireEvent.change(screen.getByLabelText('pilot.familySearchPlaceholder'), { target: { value: 'berr' } });
    expect(screen.getByText('Berrada')).toBeTruthy();
    expect(screen.queryByText('Monouni')).toBeNull();
    expect(mock.listCalls).toBe(callsAfterLoad);
  });

  it('deposit writes through the existing admin RPC with exact values', async () => {
    await openFamilies();
    fireEvent.click(await screen.findByText('Monouni'));
    fireEvent.change(await screen.findByLabelText('pilot.depositAmountPlaceholder'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('pilot.depositAction'));
    await waitFor(() => expect(mock.deposit).toHaveBeenCalledWith('f1', 500, ''));
    expect(await screen.findByText('pilot.msg.DEPOSIT_OK')).toBeTruthy();
  });

  it('rejects a non-positive deposit before any RPC call', async () => {
    await openFamilies();
    fireEvent.click(await screen.findByText('Monouni'));
    fireEvent.change(await screen.findByLabelText('pilot.depositAmountPlaceholder'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('pilot.depositAction'));
    expect(await screen.findByText('pilot.error.DEPOSIT_INVALID')).toBeTruthy();
    expect(mock.deposit).not.toHaveBeenCalled();
  });

  it('sends a family invitation through the existing service and refreshes rows', async () => {
    mock.invitations = [
      { invite_email: 'a@x.test', member_kind: 'family', status: 'SENT' },
      { invite_email: 'op@x.test', member_kind: 'courier', status: 'SENT' },
    ];
    await openFamilies();
    fireEvent.click(await screen.findByText('Monouni'));
    fireEvent.change(await screen.findByLabelText('invite.familyEmailPlaceholder'), {
      target: { value: 'new@x.test' },
    });
    fireEvent.click(screen.getByText('invite.send'));
    await waitFor(() => expect(mock.sendInvite).toHaveBeenCalled());
    expect(mock.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.test' }));
    // Only family rows belong to this page; staff rows stay in the legacy team surface.
    expect(screen.getByText('a@x.test')).toBeTruthy();
    expect(screen.queryByText('op@x.test')).toBeNull();
  });

  it('keeps the workspace mounted across home navigation without refetching', async () => {
    await openFamilies();
    fireEvent.click(await screen.findByText('Monouni'));
    await screen.findByText('pilot.depositTitle');
    const callsBefore = mock.listCalls;

    fireEvent.click(screen.getByText('cc.navHome'));
    await screen.findByText('cc.kpiBalances');
    fireEvent.click(screen.getByText('cc.navFamilies'));

    // Selection and catalog survive; no duplicate catalog read is issued.
    await waitFor(() => expect(screen.getByText('pilot.depositTitle')).toBeTruthy());
    expect(mock.listCalls).toBe(callsBefore);
  });

  it('home Settings button navigates to the existing settings screen', async () => {
    render(<PilotOpsAdminScreen />);
    // Home is the default view: the Admin tools section is already visible.
    fireEvent.click(await screen.findByText('home.settings'));
    expect(mock.dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'settings' });
  });
});

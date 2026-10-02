/**
 * G2.2 Command Center — independent Finance workspace.
 *
 * Financial correctness:
 * - a family balance is the server SUM(ledger.amount), shown once and never
 *   summed across the repeated per-member rows
 * - a family with no members renders "—", never 0.00
 * - the total excludes families with no value and says how many
 * - balance_after is labeled as an audit snapshot
 * - deposits validate before any RPC and never simulate FIFO debt pay-down
 * - a failed ledger read renders "unavailable", never an empty ledger
 *
 * Structure:
 * - Finance is its own AdminShell view (no legacy surface mounted)
 * - it renders without a prior Families visit or a family selection
 * - it issues no queries of its own (no duplicate catalog/ledger reads)
 * - no revenue / sales / profit claim appears
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  families: [] as Array<Record<string, unknown>>,
  members: [] as Array<Record<string, unknown>>,
  ledger: {} as Record<string, Array<Record<string, unknown>>>,
  ledgerFails: new Set<string>(),
  ledgerCalls: [] as string[],
  memberCalls: 0,
  familyCalls: 0,
  deposit: vi.fn(
    async (_familyId: string, _amount: number, _note: string): Promise<{
      family_id: string;
      deposited: number;
      balance_after: number;
    }> => ({ family_id: '', deposited: 0, balance_after: 0 }),
  ),
  role: 'admin' as string,
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111',
    border: '#222', danger: '#f00', dangerText: '#f00', successText: '#0f0', accentLight: '#0cf',
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
  return { ...actual, useAppDispatch: () => vi.fn() };
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
    mock.familyCalls += 1;
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
  adminListFamilyMembers: async () => {
    mock.memberCalls += 1;
    return mock.members;
  },
  adminDeposit: (familyId: string, amount: number, note: string) => mock.deposit(familyId, amount, note),
  adminProvisionFamilyMember: vi.fn(),
  adminUpsertFamily: vi.fn(),
  adminFamilyLedger: async (familyId: string) => {
    mock.ledgerCalls.push(familyId);
    if (mock.ledgerFails.has(familyId)) throw new Error('PGRST202');
    return mock.ledger[familyId] ?? [];
  },
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

import { PilotOpsAdminScreen } from '../../screens/pilot/PilotOpsAdminScreen';

const fam = (id: string, name: string, slug: string) => ({
  id, name, name_ar: '', slug, status: 'active', description: '', created_at: '', updated_at: '',
});

const member = (mid: string, familyId: string, balance: number, status = 'active') => ({
  member_id: mid, family_id: familyId, family_name: familyId, user_id: `u-${mid}`,
  user_email: `${mid}@x.test`, role: 'principal', status, created_at: '', balance,
});

const legacyMarkers = ['pilot.startPilotTitle', 'pilot.reset', 'cc-section-orders', 'cc-section-team'];

async function openFinance() {
  render(<PilotOpsAdminScreen />);
  fireEvent.click(await screen.findByText('cc.navFinance'));
  await screen.findByText('cc.finBalancesTitle');
}

describe('G2.2 command finance workspace', () => {
  beforeEach(() => {
    mock.families = [fam('f1', 'Monouni', 'monouni'), fam('f2', 'Berrada', 'berrada')];
    mock.members = [member('m1', 'f1', 6085), member('m2', 'f1', 6085)];
    mock.ledger = { f1: [] };
    mock.ledgerFails = new Set();
    mock.ledgerCalls = [];
    mock.memberCalls = 0;
    mock.familyCalls = 0;
    mock.deposit.mockClear();
    mock.role = 'admin';
  });

  it('renders as its own view with no legacy surface mounted', async () => {
    await openFinance();
    for (const marker of legacyMarkers) expect(screen.queryByText(marker)).toBeNull();
    expect(screen.queryByText('pilot.familyListTitle')).toBeNull();
  });

  it('shows a family balance once, never multiplied by member count', async () => {
    await openFinance();
    // 6085 is the family value (row + aggregate), NEVER doubled to 12170 by
    // the two member rows the server repeats the balance on.
    await waitFor(() => expect(screen.getAllByText('6,085 دج').length).toBe(2));
    expect(screen.queryByText('12,170 دج')).toBeNull();
    expect(document.body.textContent).not.toContain('12,170');
  });

  it('renders — for a family with no members, never 0.00', async () => {
    mock.members = [member('m1', 'f1', 6085)];
    await openFinance();
    const rows = screen.getAllByRole('button');
    const berrada = rows.find((b) => b.textContent?.includes('Berrada'));
    expect(berrada).toBeTruthy();
    expect(berrada?.textContent).toContain('—');
    expect(berrada?.textContent).not.toContain('0.00');
  });

  it('total covers only families with a value and states the exclusions', async () => {
    mock.members = [member('m1', 'f1', 6085)];
    await openFinance();
    await screen.findByText('cc.finTotalsPartial');
    expect(screen.getAllByText('6,085 دج').length).toBe(2);
    expect(screen.queryByText('450 دج')).toBeNull();
  });

  it('excludes inactive-only families from the balance and the total', async () => {
    mock.members = [member('m1', 'f1', 6085), member('m2', 'f2', 450, 'inactive')];
    await openFinance();
    const berrada = screen.getAllByRole('button').find((b) => b.textContent?.includes('Berrada'));
    expect(berrada?.textContent).toContain('—');
    // Total is 6085 only; the inactive family's 450 is never counted.
    expect(screen.getAllByText('6,085 دج').length).toBe(2);
    expect(screen.queryByText('6,535 دج')).toBeNull();
  });

  it('filters families by search with no extra catalog query', async () => {
    await openFinance();
    await waitFor(() => expect(mock.familyCalls).toBeGreaterThan(0));
    const calls = mock.familyCalls;
    fireEvent.change(screen.getByLabelText('cc.finSearchPlaceholder'), { target: { value: 'berr' } });
    expect(screen.getByText('Berrada')).toBeTruthy();
    expect(screen.queryByText('Monouni')).toBeNull();
    expect(mock.familyCalls).toBe(calls);
  });

  it('renders the selected family ledger and labels balance_after as an audit snapshot', async () => {
    mock.ledger = {
      f1: [
        { id: 'l1', created_at: '', transaction_type: 'CASH_DEPOSIT', amount: 1000, related_order_id: null, order_number: null, reference: 'deposit', note: 'cash', balance_after: 7085 },
        { id: 'l2', created_at: '', transaction_type: 'PURCHASE', amount: -575, related_order_id: 'o1', order_number: 'FC-29', reference: '', note: '', balance_after: 6510 },
      ],
    };
    await openFinance();
    fireEvent.click(await screen.findByText('Monouni'));
    await screen.findByText('CASH_DEPOSIT');
    expect(screen.getByText(/PURCHASE · #FC-29/)).toBeTruthy();
    expect(screen.getByText('cc.finAuditSnapshotNote')).toBeTruthy();
    const occurrences = (needle: string) => (document.body.textContent ?? '').split(needle).length - 1;
    expect(occurrences('cc.finAuditAfter')).toBe(2);
    // Audit snapshot values are present and are NOT the family balance.
    expect(occurrences('7,085 دج')).toBeGreaterThan(0);
  });

  it('filters movement types from already-fetched rows without refetching', async () => {
    mock.ledger = {
      f1: [
        { id: 'l1', created_at: '', transaction_type: 'CASH_DEPOSIT', amount: 1000, related_order_id: null, order_number: null, reference: '', note: '', balance_after: 1000 },
        { id: 'l2', created_at: '', transaction_type: 'PURCHASE', amount: -575, related_order_id: 'o1', order_number: 'FC-29', reference: '', note: '', balance_after: 425 },
      ],
    };
    await openFinance();
    fireEvent.click(await screen.findByText('Monouni'));
    await screen.findByText('CASH_DEPOSIT');
    const callsBefore = mock.ledgerCalls.length;

    // Filter the rendered rows (ignore the <option> list itself).
    const entryTexts = () =>
      screen
        .getAllByText(/^(CASH_DEPOSIT|PURCHASE|REFUND|REVERSAL)/)
        .filter((n) => n.tagName !== 'OPTION')
        .map((n) => n.textContent ?? '');
    expect(entryTexts().some((t) => t?.startsWith('CASH_DEPOSIT'))).toBe(true);
    fireEvent.change(screen.getByLabelText('cc.finTypeFilter'), { target: { value: 'PURCHASE' } });
    expect(entryTexts().some((t) => t?.startsWith('PURCHASE'))).toBe(true);
    expect(entryTexts().some((t) => t?.startsWith('CASH_DEPOSIT'))).toBe(false);
    expect(mock.ledgerCalls.length).toBe(callsBefore);
  });

  it('shows a ledger RPC failure as unavailable, never as an empty ledger', async () => {
    mock.ledgerFails = new Set(['f1']);
    await openFinance();
    fireEvent.click(await screen.findByText('Monouni'));
    await screen.findByText('cc.finLedgerUnavailable');
    expect(screen.queryByText('pilot.ledgerEmpty')).toBeNull();
  });

  it('keeps loading explicit and shows an empty state only for a real empty ledger', async () => {
    await openFinance();
    expect(screen.getAllByText('cc.finSelectFamily').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByText('Monouni'));
    await screen.findByText('pilot.ledgerEmpty');
  });

  it('deposit validates before any RPC and never runs FIFO math client-side', async () => {
    await openFinance();
    fireEvent.click(await screen.findByText('Monouni'));
    const amount = await screen.findByLabelText('pilot.depositAmountPlaceholder');

    fireEvent.change(amount, { target: { value: '0' } });
    fireEvent.click(screen.getByText('pilot.depositAction'));
    expect(await screen.findByText('pilot.error.DEPOSIT_INVALID')).toBeTruthy();

    fireEvent.change(amount, { target: { value: '-5' } });
    fireEvent.click(screen.getByText('pilot.depositAction'));
    expect(mock.deposit).not.toHaveBeenCalled();

    fireEvent.change(amount, { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('pilot.depositAction'));
    expect(mock.deposit).not.toHaveBeenCalled();
  });

  it('deposit posts exact values through the existing admin RPC', async () => {
    mock.deposit.mockResolvedValue({ family_id: 'f1', deposited: 500, balance_after: 6585 });
    await openFinance();
    fireEvent.click(await screen.findByText('Monouni'));
    fireEvent.change(await screen.findByLabelText('pilot.depositAmountPlaceholder'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('pilot.depositNotePlaceholder'), { target: { value: 'cash at desk' } });
    fireEvent.click(screen.getByText('pilot.depositAction'));
    await waitFor(() => expect(mock.deposit).toHaveBeenCalledWith('f1', 500, 'cash at desk'));
    expect(await screen.findByText('pilot.msg.DEPOSIT_OK')).toBeTruthy();
  });

  it('hides the deposit form from non-admin users', async () => {
    mock.role = 'user';
    await openFinance();
    expect(screen.queryByText('cc.finDepositTitle')).toBeNull();
    expect(screen.queryByLabelText('pilot.depositAmountPlaceholder')).toBeNull();
    // Balances remain visible: read access is unchanged.
    await waitFor(() => expect(screen.getAllByText('6,085 دج').length).toBe(2));
  });

  it('makes no revenue, sales or profit claim anywhere on the page', async () => {
    await openFinance();
    const text = document.body.textContent ?? '';
    for (const forbidden of ['revenue', 'Revenue', 'sales', 'Sales', 'profit', 'Profit']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('does not add its own catalog or members queries and shares the ledger read', async () => {
    await openFinance();
    await waitFor(() => expect(mock.memberCalls).toBeGreaterThan(0));
    // One catalog read and one members read for the whole session.
    expect(mock.familyCalls).toBe(1);
    expect(mock.memberCalls).toBe(1);

    fireEvent.click(await screen.findByText('Monouni'));
    await waitFor(() => expect(mock.ledgerCalls).toEqual(['f1']));

    // Navigating away and back must not re-read either the catalog or members.
    fireEvent.click(screen.getByText('cc.navHome'));
    await screen.findByText('cc.kpiBalances');
    fireEvent.click(screen.getByText('cc.navFinance'));
    await screen.findByText('cc.finBalancesTitle');
    expect(mock.familyCalls).toBe(1);
    expect(mock.memberCalls).toBe(1);
  });

  it('renders without any prior Families visit and without a selection', async () => {
    await openFinance();
    // Balances are present with no family ever selected.
    await waitFor(() => expect(screen.getAllByText('6,085 دج').length).toBe(2));
    expect(screen.getAllByText('cc.finSelectFamily').length).toBeGreaterThan(0);
  });
});

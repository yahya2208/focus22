/**
 * G1 Command Center home (read-only landing composition).
 * - KPI math deduplicates families; debts show unavailable (no source).
 * - No fake numbers anywhere; empty states render honestly.
 * - Quick actions delegate (no business logic in presentation).
 * - Sidebar renders nav with home active first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'ar', dir: 'rtl' as const }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111',
    border: '#222', dangerText: '#f00', accentLight: '#0ff',
  }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { id: 'admin1', displayName: 'يحيى' } }, service: {} }),
}));
import { AdminHome } from '../../screens/admin/command-center/AdminHome';
import { AdminShell } from '../../screens/admin/command-center/AdminShell';

const ORDERS = [
  { id: 'o1', order_number: 'FC-1', status: 'preparing', created_at: new Date().toISOString() },
  { id: 'o2', order_number: 'FC-2', status: 'delivered', created_at: new Date().toISOString() },
] as never;

const INVITES = [
  { invite_email: 'a@x.test', member_kind: 'family', status: 'SENT' },
] as never;

const MEMBERS = [
  { member_id: 'm1', family_id: 'f1', family_name: 'Ff1', user_id: 'u1', user_email: 'u1@x.test', role: 'principal', status: 'active', created_at: '', balance: 6000 },
  { member_id: 'm2', family_id: 'f1', family_name: 'Ff1', user_id: 'u2', user_email: 'u2@x.test', role: 'principal', status: 'active', created_at: '', balance: 6000 },
  { member_id: 'm3', family_id: 'f2', family_name: 'Ff2', user_id: 'u3', user_email: 'u3@x.test', role: 'principal', status: 'active', created_at: '', balance: 450 },
  { member_id: 'm4', family_id: 'f3', family_name: 'Ff3', user_id: 'u4', user_email: 'u4@x.test', role: 'principal', status: 'inactive', created_at: '', balance: 99999 },
];

function renderHome(onQuickAction = vi.fn(), onOpenSettings = vi.fn()) {
  return render(
    <AdminShell active="home" onNavigate={() => {}}>
      <AdminHome
        data={{ members: MEMBERS, orders: ORDERS, ordersScopeLabel: 'Store', invitations: INVITES }}
        onQuickAction={onQuickAction}
        onOpenSettings={onOpenSettings}
      />
    </AdminShell>,
  );
}

describe('G1 command home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('totals balances once per family (no per-member double count)', async () => {
    renderHome();
    // 6000 (f1 once, not ×2) + 450 (f2); inactive f3 excluded.
    await screen.findByText('6,450 دج');
  });

  it('shows debts as unavailable, never a fabricated zero', async () => {
    renderHome();
    expect(await screen.findByText('cc.kpiDebtsSrc')).toBeTruthy();
  });

  it('lists real attention items and honest empty activity', async () => {
    renderHome();
    expect(await screen.findByText(/a@x.test/)).toBeTruthy();
    expect(await screen.findByText('cc.activityEmpty')).toBeTruthy();
  });

  it('quick actions delegate outward with stable ids', async () => {
    const onQuickAction = vi.fn();
    renderHome(onQuickAction);
    fireEvent.click(await screen.findByText('cc.quickDeposit'));
    expect(onQuickAction).toHaveBeenCalledWith('deposit');
  });

  it('sidebar lists home first with all eight sections', async () => {
    const { container } = renderHome();
    const nav = container.querySelector('aside');
    expect(nav).toBeTruthy();
    const buttons = [...(nav as HTMLElement).querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons[0]).toContain('cc.navHome');
    expect(buttons).toHaveLength(8);
  });

  it('renders a separate Admin tools section with a Settings button', async () => {
    renderHome();
    expect(await screen.findByText('cc.toolsLabel')).toBeTruthy();
    expect(await screen.findByText('home.settings')).toBeTruthy();
  });

  it('Settings button delegates outward without touching quick actions', async () => {
    const onOpenSettings = vi.fn();
    const onQuickAction = vi.fn();
    renderHome(onQuickAction, onOpenSettings);
    fireEvent.click(await screen.findByText('home.settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onQuickAction).not.toHaveBeenCalled();
  });
});

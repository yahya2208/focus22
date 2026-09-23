import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider, useAppState } from '../../../store/navigation';
import { PilotFamilyHomeScreen } from '../../../screens/pilot/PilotFamilyHomeScreen';

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ar', dir: 'rtl' }),
}));
vi.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated' } }),
}));
vi.mock('../../../services/pilot-account-service', () => ({
  fetchMyFamily: vi.fn(async () => ({ family_id: 'f1', family_name: 'Al-Haddad', family_name_ar: 'عائلة الحداد' })),
  fetchMyAccount: vi.fn(async () => ({ linked: true, balance: 10000, debts: [] })),
  fetchMyFamilyContact: vi.fn(async () => null),
  saveMyFamilyContact: vi.fn(async (i: unknown) => i),
}));
vi.mock('../../../services/order-tracking-service', () => ({
  fetchMyOrders: vi.fn(async () => [
    { order_id: 'o1', order_number: 'FC-31', status: 'preparing', total: 770, created_at: '2026-09-01', item_count: 2 },
  ]),
  mergeRealtimeOrderPayload: vi.fn((p: unknown) => p),
}));

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function renderHome() {
  return render(
    <AppProvider>
      <PilotFamilyHomeScreen />
      <ScreenProbe />
    </AppProvider>,
  );
}

describe('PilotFamilyHomeScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('greets with the family name and tagline', async () => {
    renderHome();
    expect(await screen.findByText('pilot.familyWelcome')).toBeTruthy();
    expect(screen.getByText('عائلة الحداد')).toBeTruthy();
    expect(screen.getByText('pilot.familyTagline')).toBeTruthy();
  });

  it('offers a hero order CTA into the storefront', async () => {
    renderHome();
    await screen.findByText('pilot.familyWelcome');
    fireEvent.click(screen.getByLabelText('pilot.orderYourVeg'));
    expect(screen.getByTestId('screen').textContent).toBe('pilot-storefront');
  });

  it('shows the active order with a visual timeline', async () => {
    renderHome();
    expect(await screen.findByText('pilot.currentOrder')).toBeTruthy();
    expect(screen.getByText('#FC-31', { exact: true })).toBeTruthy();
    expect(screen.getByText('pilot.stepPreparing')).toBeTruthy();
    expect(screen.queryByText('preparing', { exact: true })).toBeNull();
  });

  it('shows balance plus recent activity with no ledger jargon', async () => {
    renderHome();
    await screen.findByText('pilot.accountTitle');
    expect(screen.getByText(/10,000/)).toBeTruthy();
    expect(screen.getByText('pilot.availableForOrders')).toBeTruthy();
    expect(screen.getByText('pilot.recentActivity')).toBeTruthy();
    expect(screen.queryByText(/SUM|ledger/i)).toBeNull();
  });

  it('links quick actions to orders, reorder and the delivery profile', async () => {
    renderHome();
    await screen.findByText('pilot.familyWelcome');
    fireEvent.click(screen.getByText('pilot.myOrdersTitle'));
    expect(screen.getByTestId('screen').textContent).toBe('pilot-my-orders');
  });
});

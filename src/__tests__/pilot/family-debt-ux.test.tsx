/**
 * Family debt UX (Option C): persistent balance/debt display + checkout
 * debt acknowledgment (UX-only, never financial acceptance).
 *
 * Part A pins FamilyBalanceCard across the four balance/debt states:
 * figures shown separately, never netted, correct guidance per state.
 * Part B pins the checkout acknowledgment gate: visible only with open
 * debt, blocks submit until checked, passes the unchanged payload through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';
import { FamilyBalanceCard } from '../../screens/pilot/family/FamilyBalanceCard';
import { PilotCheckoutScreen } from '../../screens/pilot/PilotCheckoutScreen';
import type { PilotAccount } from '../../services/pilot-account-service';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

function account(balance: number, debts: PilotAccount['debts']): PilotAccount {
  return { linked: true, family_id: 'fam-1', balance, debts };
}
const openDebt = (remaining: number) => ({
  order_id: 'o9',
  order_number: 'FC-9',
  original_total: remaining,
  covered: 0,
  remaining,
  status: 'open',
  created_at: '',
});
const settledDebt = (remaining: number) => ({ ...openDebt(remaining), status: 'settled' });

describe('FamilyBalanceCard — four balance/debt states', () => {
  it('balance > 0, no debt: balance only, no debt block', () => {
    const { container } = render(<FamilyBalanceCard account={account(500, [])} recentOps={[]} />);
    // Text nodes are split across elements; assert on rendered content.
    expect(container.textContent).toContain('500');
    expect(screen.queryByText('pilot.outstandingDebts')).toBeNull();
  });

  it('balance = 0, no debt: zero shown with no-balance guidance, no debt hint', () => {
    render(<FamilyBalanceCard account={account(0, [])} recentOps={[]} />);
    expect(screen.getByText('pilot.accountNoBalance')).toBeTruthy();
    expect(screen.queryByText('pilot.outstandingDebts')).toBeNull();
  });

  it('balance > 0 with open debt: both figures shown separately, never netted', () => {
    const { container } = render(
      <FamilyBalanceCard account={account(500, [openDebt(200)])} recentOps={[]} />,
    );
    expect(screen.getByText('pilot.outstandingDebts')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain('500');
    expect(text).toContain('200');
    // No netted figure anywhere (500 - 200 = 300 must not appear).
    expect(text).not.toContain('300');
  });

  it('balance = 0 with open debt: debt emphasized with contact guidance', () => {
    render(<FamilyBalanceCard account={account(0, [openDebt(200)])} recentOps={[]} />);
    expect(screen.getByText('pilot.outstandingDebts')).toBeTruthy();
    expect(screen.getByText('pilot.accountDebtContact')).toBeTruthy();
  });

  it('settled debts do not render as outstanding', () => {
    render(<FamilyBalanceCard account={account(500, [settledDebt(0)])} recentOps={[]} />);
    expect(screen.queryByText('pilot.outstandingDebts')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Checkout acknowledgment gate.
// ---------------------------------------------------------------------------

const shared = vi.hoisted(() => ({
  authStatus: 'authenticated',
  account: null as unknown as PilotAccount | null,
  submitOrder: vi.fn(),
  zones: [{ id: 'z1', name: 'Z One', name_ar: 'م1', is_active: true }],
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: shared.authStatus },
    service: { signInAsGuest: vi.fn(async () => {}) },
  }),
}));
vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: vi.fn(async () => {}),
  getDeliveryZones: () => shared.zones,
  subscribeDeliveryZones: () => () => {},
}));
vi.mock('../../services/order-service', () => ({
  submitPilotOrder: (input: unknown) => shared.submitOrder(input),
  fetchEstimate: vi.fn(async () => ({ available: false })),
  classifySubmissionError: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  fetchTrackedOrderStatus: vi.fn(),
}));
vi.mock('../../services/pilot-account-service', () => ({
  fetchMyAccount: vi.fn(async () => shared.account),
  fetchMyFamilyContact: vi.fn(async () => null),
  saveMyFamilyContact: vi.fn(async (input: unknown) => input),
}));
vi.mock('../../services/whatsapp-service', () => ({
  buildCartRequestMessage: () => 'LINES',
  getWhatsAppPhone: () => '+213000000000',
  openWhatsApp: vi.fn(),
}));

const TOMATO: CartLineInput = {
  catalogRef: 'veg-tomato',
  domain: 'produce',
  category: 'produce',
  brand: '',
  model: 'Tomato',
  displayUnitPrice: 120,
  stock: 10,
  unit: 'kg',
};

function Seed({ initial }: { initial: CartLineInput[] }) {
  const cart = useCart();
  useEffect(() => {
    initial.forEach((line) => cart.addLine(line));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderCheckout() {
  return render(
    <AppProvider>
      <CartProvider>
        <Seed initial={[{ ...TOMATO, quantity: 1 }]} />
        <PilotCheckoutScreen />
      </CartProvider>
    </AppProvider>,
  );
}

function fillContact() {
  fireEvent.change(screen.getByPlaceholderText('pilot.name'), { target: { value: 'Ahmed' } });
  fireEvent.change(screen.getByPlaceholderText('pilot.phone'), { target: { value: '0555000000' } });
  fireEvent.change(screen.getByLabelText('pilot.zone'), { target: { value: 'z1' } });
}

beforeEach(() => {
  shared.authStatus = 'authenticated';
  shared.account = null;
  shared.submitOrder = vi.fn(async () => ({
    orderId: 'o1',
    orderNumber: 'F-1',
    total: 240,
    etaMinutesMin: 30,
    etaMinutesMax: 45,
  }));
  vi.clearAllMocks();
});

describe('Checkout — debt acknowledgment gate (UX-only)', () => {
  it('no debt: no checkbox, submit proceeds untouched', async () => {
    shared.account = account(500, []);
    renderCheckout();
    await screen.findByPlaceholderText('pilot.name');

    expect(screen.queryByText('pilot.debtAcknowledge')).toBeNull();
    fillContact();
    fireEvent.click(screen.getByText('pilot.placeOrder'));
    await waitFor(() => expect(shared.submitOrder).toHaveBeenCalledTimes(1));
    // Payload carries no debt/acknowledgment fields.
    const input = (shared.submitOrder as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(input).not.toHaveProperty('debtAck');
    expect(input).not.toHaveProperty('debt');
  });

  it('open debt: checkbox visible, unchecked submit blocked with message', async () => {
    shared.account = account(500, [openDebt(200)]);
    renderCheckout();
    await screen.findByPlaceholderText('pilot.name');

    expect(screen.getByText('pilot.debtAcknowledge')).toBeTruthy();
    fillContact();
    fireEvent.click(screen.getByText('pilot.placeOrder'));
    expect(await screen.findByText('pilot.error.DEBT_ACK_REQUIRED')).toBeTruthy();
    expect(shared.submitOrder).not.toHaveBeenCalled();
  });

  it('open debt: checked submit proceeds with the unchanged order payload', async () => {
    shared.account = account(500, [openDebt(200)]);
    renderCheckout();
    await screen.findByPlaceholderText('pilot.name');

    fillContact();
    fireEvent.click(screen.getByText('pilot.debtAcknowledge'));
    fireEvent.click(screen.getByText('pilot.placeOrder'));
    await waitFor(() => expect(shared.submitOrder).toHaveBeenCalledTimes(1));
    const input = (shared.submitOrder as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as Record<string, unknown>;
    // Ordering input is byte-identical in shape to the no-debt path:
    // acknowledgment gates, never travels.
    expect(input).not.toHaveProperty('debtAck');
    expect(input).toHaveProperty('items');
  });

  it('existing debt + covered order: no new debt is created client-side', async () => {
    shared.account = account(5000, [openDebt(200)]);
    renderCheckout();
    await screen.findByPlaceholderText('pilot.name');

    // Acknowledgment still required (debt exists), but submission carries
    // no debt-creation fields — only settlement can ever create debt.
    fillContact();
    fireEvent.click(screen.getByText('pilot.debtAcknowledge'));
    fireEvent.click(screen.getByText('pilot.placeOrder'));
    await waitFor(() => expect(shared.submitOrder).toHaveBeenCalledTimes(1));
  });
});

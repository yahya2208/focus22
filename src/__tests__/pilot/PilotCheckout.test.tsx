import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';
import { PilotCheckoutScreen } from '../../screens/pilot/PilotCheckoutScreen';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

const shared = vi.hoisted(() => ({
  authStatus: 'guest',
  signInAsGuest: vi.fn(async () => {}),
  contact: null as null | {
    family_id: string;
    contact_name: string | null;
    contact_phone: string | null;
    contact_address: string | null;
    contact_notes: string | null;
  },
  openWhatsApp: vi.fn(),
  saveContact: vi.fn(async (input: unknown) => input),
  submitOrder: vi.fn(async () => ({
    orderId: 'o1',
    orderNumber: 'F-1',
    total: 240,
    etaMinutesMin: 30,
    etaMinutesMax: 45,
  })),
  zones: [
    { id: 'z1', name: 'Z One', name_ar: 'م1', is_active: true },
    { id: 'z2', name: 'Z Two', name_ar: 'م2', is_active: true },
  ],
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: shared.authStatus },
    service: { signInAsGuest: shared.signInAsGuest },
  }),
}));
vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: vi.fn(async () => {}),
  getDeliveryZones: () => shared.zones,
  subscribeDeliveryZones: () => () => {},
}));
vi.mock('../../services/order-service', () => ({
  submitPilotOrder: (input: unknown) => (shared.submitOrder as (i: unknown) => Promise<unknown>)(input),
  fetchEstimate: vi.fn(async () => ({ available: false })),
  classifySubmissionError: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
  fetchTrackedOrderStatus: vi.fn(),
}));
vi.mock('../../services/pilot-account-service', () => ({
  fetchMyAccount: vi.fn(async () => null),
  fetchMyFamilyContact: vi.fn(async () => shared.contact),
  saveMyFamilyContact: (input: unknown) => shared.saveContact(input),
}));
vi.mock('../../services/whatsapp-service', () => ({
  buildCartRequestMessage: (lines: Array<{ name: string }>, customer: { phone: string }) =>
    `LINES:${lines.length}:PHONE:${customer.phone}`,
  getWhatsAppPhone: () => '+213556254007',
  openWhatsApp: (...args: unknown[]) => shared.openWhatsApp(...(args as [string, string])),
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

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function CartProbe() {
  const { lines } = useCart();
  return (
    <div data-testid="cart">{JSON.stringify(lines.map((l) => [l.catalogRef, l.quantity]))}</div>
  );
}

function renderCheckout(initial: CartLineInput[] = []) {
  return render(
    <AppProvider>
      <CartProvider>
        <Seed initial={initial} />
        <PilotCheckoutScreen />
        <ScreenProbe />
        <CartProbe />
      </CartProvider>
    </AppProvider>,
  );
}

function fillContact(name = 'Ahmed', phone = '0555000000') {
  fireEvent.change(screen.getByPlaceholderText('pilot.name'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText('pilot.phone'), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText('pilot.zone'), { target: { value: 'z1' } });
}

beforeEach(() => {
  shared.authStatus = 'guest';
  shared.contact = null;
  shared.saveContact = vi.fn(async (input: unknown) => input);
  shared.submitOrder = vi.fn(async () => ({
    orderId: 'o1',
    orderNumber: 'F-1',
    total: 240,
    etaMinutesMin: 30,
    etaMinutesMax: 45,
  }));
  vi.clearAllMocks();
});

describe('PilotCheckoutScreen — contact prefill (V1.3)', () => {
  it('fills empty fields from the saved family contact on open', async () => {
    shared.authStatus = 'authenticated';
    shared.contact = {
      family_id: 'fA',
      contact_name: 'Ahmed',
      contact_phone: '0555000000',
      contact_address: 'Rue 12',
      contact_notes: 'Ring twice',
    };
    renderCheckout([{ ...TOMATO, quantity: 1 }]);

    await waitFor(() =>
      expect((screen.getByPlaceholderText('pilot.name') as HTMLInputElement).value).toBe('Ahmed'),
    );
    expect((screen.getByPlaceholderText('pilot.phone') as HTMLInputElement).value).toBe('0555000000');
    expect((screen.getByPlaceholderText('pilot.address') as HTMLInputElement).value).toBe('Rue 12');
    expect((screen.getByPlaceholderText('pilot.notes') as HTMLInputElement).value).toBe('Ring twice');
  });

  it('leaves fields empty when the family has no saved contact', async () => {
    shared.authStatus = 'authenticated';
    shared.contact = null;
    renderCheckout([{ ...TOMATO, quantity: 1 }]);

    await screen.findByPlaceholderText('pilot.name');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((screen.getByPlaceholderText('pilot.name') as HTMLInputElement).value).toBe('');
  });
});

describe('PilotCheckoutScreen — missing-field validation', () => {
  it('shows the review-data error without calling the order RPC', async () => {
    shared.authStatus = 'authenticated';
    renderCheckout([{ ...TOMATO, quantity: 1 }]);
    await screen.findByPlaceholderText('pilot.name');

    fireEvent.click(screen.getByText('pilot.placeOrder'));

    expect(await screen.findByText('pilot.error.INVALID_ARGUMENTS')).toBeTruthy();
    expect(shared.submitOrder).not.toHaveBeenCalled();
  });
});

describe('PilotCheckoutScreen — successful order persists contact', () => {
  it('submits the order, then saves the used contact (order never waits on it)', async () => {
    shared.authStatus = 'authenticated';
    renderCheckout([{ ...TOMATO, quantity: 2 }]);
    await screen.findByPlaceholderText('pilot.name');

    fillContact('Ahmed', '0555000000');
    fireEvent.change(screen.getByPlaceholderText('pilot.address'), { target: { value: 'Rue 12' } });
    fireEvent.click(screen.getByText('pilot.placeOrder'));

    await screen.findByText('pilot.orderReceived');
    expect(shared.submitOrder).toHaveBeenCalledTimes(1);
    expect(shared.saveContact).toHaveBeenCalledWith({
      name: 'Ahmed',
      phone: '0555000000',
      address: 'Rue 12',
      notes: '',
    });
  });

  it('a contact-save failure after success keeps the order successful with a separate notice', async () => {
    shared.authStatus = 'authenticated';
    shared.saveContact = vi.fn(async () => {
      throw new Error('CONTACT_RPC_DOWN');
    });
    renderCheckout([{ ...TOMATO, quantity: 1 }]);
    await screen.findByPlaceholderText('pilot.name');

    fillContact();
    fireEvent.click(screen.getByText('pilot.placeOrder'));

    await screen.findByText('pilot.orderReceived');
    expect(await screen.findByText('pilot.contactSaveFailed')).toBeTruthy();
  });

  it('cart quantity edits do not clear contact fields', async () => {
    shared.authStatus = 'authenticated';
    renderCheckout([{ ...TOMATO, quantity: 1 }]);
    await screen.findByPlaceholderText('pilot.name');

    fillContact('Ahmed', '0555000000');
    const qty = screen.getByLabelText('quantity');
    fireEvent.change(qty, { target: { value: '2' } });
    fireEvent.blur(qty);

    expect((screen.getByPlaceholderText('pilot.name') as HTMLInputElement).value).toBe('Ahmed');
    expect((screen.getByPlaceholderText('pilot.phone') as HTMLInputElement).value).toBe('0555000000');
    expect(JSON.parse(screen.getByTestId('cart').textContent ?? '[]')).toEqual([['veg-tomato', 2]]);
  });
});

describe('PilotCheckoutScreen — zone selection (V1.7.1 City Center)', () => {
  const CITY_ZONES = [
    { id: 'z-city', name: 'City Center', name_ar: 'وسط المدينة', is_active: true },
    { id: 'z-sub', name: 'Suburbs', name_ar: 'الضواحي', is_active: true },
    { id: 'z-out', name: 'Outskirts', name_ar: 'الأطراف', is_active: true },
  ];
  const DEFAULT_ZONES = [
    { id: 'z1', name: 'Z One', name_ar: 'م1', is_active: true },
    { id: 'z2', name: 'Z Two', name_ar: 'م2', is_active: true },
  ];

  it('shows a placeholder and preselects nothing (first zone is not a choice)', async () => {
    shared.zones = CITY_ZONES;
    try {
      renderCheckout([{ ...TOMATO, quantity: 1 }]);
      await screen.findByPlaceholderText('pilot.name');

      const select = screen.getByLabelText('pilot.zone') as HTMLSelectElement;
      expect(select.value).toBe('');
      expect(screen.getByText('pilot.selectZone')).toBeTruthy();
    } finally {
      shared.zones = DEFAULT_ZONES;
    }
  });

  it('an explicit City Center choice flows through exactly like other zones', async () => {
    shared.zones = CITY_ZONES;
    try {
      shared.authStatus = 'authenticated';
      renderCheckout([{ ...TOMATO, quantity: 1 }]);
      await screen.findByPlaceholderText('pilot.name');

      fireEvent.change(screen.getByLabelText('pilot.zone'), { target: { value: 'z-city' } });
      fireEvent.change(screen.getByPlaceholderText('pilot.name'), { target: { value: 'Ahmed' } });
      fireEvent.change(screen.getByPlaceholderText('pilot.phone'), { target: { value: '0555000000' } });
      fireEvent.click(screen.getByText('pilot.placeOrder'));

      await screen.findByText('pilot.orderReceived');
      expect(shared.submitOrder).toHaveBeenCalledTimes(1);
      const input = (shared.submitOrder as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as {
        zoneId: string;
      };
      expect(input.zoneId).toBe('z-city');
    } finally {
      shared.zones = DEFAULT_ZONES;
    }
  });
});
describe('PilotCheckoutScreen — forgot-something returns to the same cart', () => {
  it('navigates back to the produce list without touching cart lines', async () => {
    renderCheckout([{ ...TOMATO, quantity: 2 }]);

    expect(screen.getByTestId('cart').textContent).toContain('veg-tomato');
    fireEvent.click(screen.getByText('pilot.forgotSomething'));

    expect(screen.getByTestId('screen').textContent).toBe('pilot-storefront');
    expect(screen.getByTestId('cart').textContent).toContain('veg-tomato');
  });
});

describe('PilotCheckoutScreen — WhatsApp order summary (notify-only)', () => {
  it('offers a CTA built from the official placed order (number + lines + total)', async () => {
    shared.authStatus = 'authenticated';
    renderCheckout([{ ...TOMATO, quantity: 2 }]);
    await screen.findByPlaceholderText('pilot.name');

    fillContact('Ahmed', '0555000000');
    fireEvent.click(screen.getByText('pilot.placeOrder'));
    await screen.findByText('pilot.orderReceived');

    fireEvent.click(screen.getByText('pilot.sendOrderWhatsApp'));
    expect(shared.openWhatsApp).toHaveBeenCalledTimes(1);
    const [phone, message] = (shared.openWhatsApp as unknown as { mock: { calls: string[][] } }).mock
      .calls[0] as string[];
    expect(phone).toBe('+213556254007');
    expect(message).toContain('F-1');
    expect(message).toContain('240');
    expect(message).toContain('LINES:1:PHONE:0555000000');
  });

  it('does not render the CTA before an order succeeds', async () => {
    renderCheckout([{ ...TOMATO, quantity: 1 }]);
    await screen.findByPlaceholderText('pilot.name');

    expect(screen.queryByText('pilot.sendOrderWhatsApp')).toBeNull();
  });
});

describe('PilotCheckoutScreen — success experience hierarchy (V1.6)', () => {
  async function placeOrder() {
    shared.authStatus = 'authenticated';
    renderCheckout([{ ...TOMATO, quantity: 2 }]);
    await screen.findByPlaceholderText('pilot.name');
    fillContact('Ahmed', '0555000000');
    fireEvent.click(screen.getByText('pilot.placeOrder'));
    await screen.findByText('pilot.orderReceived');
  }

  it('shows hero, number, totals, receipt and timeline — no raw data', async () => {
    await placeOrder();

    expect(screen.getByText('pilot.orderPreparingNow')).toBeTruthy();
    expect(screen.getByText(/#F-1/)).toBeTruthy();
    expect(screen.getByText('Tomato')).toBeTruthy();
    expect(screen.getByText('2 كغ')).toBeTruthy();
    expect(screen.getByText('pilot.stepConfirmed')).toBeTruthy();
    expect(screen.queryByText('confirmed', { exact: true })).toBeNull();
  });

  it('orders CTAs primary-track, secondary-WhatsApp, quiet-home', async () => {
    await placeOrder();

    fireEvent.click(screen.getByText('pilot.trackMyOrder'));
    expect(screen.getByTestId('screen').textContent).toBe('pilot-my-orders');
  });
});

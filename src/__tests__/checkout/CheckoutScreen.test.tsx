import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';
import { CheckoutScreen } from '../../screens/checkout/CheckoutScreen';
import { resetPendingOrder } from '../../core/order/confirmation-state';
import type { DeliveryEstimate, DeliveryOrderResult, DeliveryZone } from '../../services/delivery-service';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

const mocks = vi.hoisted(() => ({
  zones: [
    { id: 'z1', name: 'City Center', name_ar: 'وسط المدينة', is_active: true },
  ] as DeliveryZone[],
  estimateDelivery: vi.fn(),
  createDeliveryOrder: vi.fn(),
  signInAsGuest: vi.fn(),
}));

const ESTIMATE: DeliveryEstimate = { available: true, fee: 350, minutesMin: 30, minutesMax: 45 };
const RESULT: DeliveryOrderResult = {
  orderId: 'o-1',
  orderNumber: 'FC-000001',
  status: 'pending',
  subtotal: 2000,
  deliveryFee: 350,
  total: 2350,
  etaMinutesMin: 30,
  etaMinutesMax: 45,
};

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated';
let authStatusSetter: (s: AuthStatus) => void;

vi.mock('../../core/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/auth/AuthProvider')>();
  return {
    ...actual,
    useAuth: () => {
      const [status, setStatus] = useState<AuthStatus>('unauthenticated');
      useEffect(() => {
        authStatusSetter = setStatus;
      }, []);
      const user = status === 'authenticated' ? { id: 'u-1' } : null;
      const service = { signInAsGuest: mocks.signInAsGuest, getCurrentUser: () => user } as never;
      return { state: { status, user, error: null as string | null }, service, researchRole: 'none' };
    },
  };
});

vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: vi.fn().mockResolvedValue(undefined),
  getDeliveryZones: () => mocks.zones,
  estimateDelivery: mocks.estimateDelivery,
  createDeliveryOrder: mocks.createDeliveryOrder,
}));

const phone: CartLineInput = {
  catalogRef: 'd1',
  categoryId: 'm1',
  domain: 'phone',
  category: 'phone',
  brand: 'Samsung',
  model: 'Galaxy S23',
  displayUnitPrice: 1000,
  stock: 5,
};

function GoToCheckout() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'checkout' });
  }, [dispatch]);
  return null;
}

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function Seed({ initial }: { initial: CartLineInput[] }) {
  const cart = useCart();
  useEffect(() => {
    initial.forEach((line) => cart.addLine(line));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderCheckout(initial: CartLineInput[] = [{ ...phone, quantity: 2 }]) {
  return render(
    <AppProvider>
      <CartProvider>
        <GoToCheckout />
        <Seed initial={initial} />
        <CheckoutScreen />
        <ScreenProbe />
      </CartProvider>
    </AppProvider>,
  );
}

describe('CheckoutScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPendingOrder();
    mocks.estimateDelivery.mockResolvedValue(ESTIMATE);
    mocks.createDeliveryOrder.mockResolvedValue(RESULT);
    mocks.signInAsGuest.mockResolvedValue({ id: 'u-guest' });
    authStatusSetter = () => {};
  });

  it('renders delivery customer fields', () => {
    renderCheckout();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByPlaceholderText('delivery.fullName')).toBeTruthy();
    expect(screen.getByPlaceholderText('delivery.phone')).toBeTruthy();
  });

  it('computes the estimate for the cart subtotal when a zone is chosen', async () => {
    renderCheckout();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    await waitFor(() => expect(mocks.estimateDelivery).toHaveBeenCalled());
    expect(mocks.estimateDelivery.mock.calls[0]![0]).toBe('z1');
    expect(mocks.estimateDelivery.mock.calls[0]![1]).toBe(2000);
  });

  it('shows the guest gate when unauthenticated and places order via guest', async () => {
    renderCheckout();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.fullName'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.phone'), { target: { value: '0555' } });
    fireEvent.click(screen.getByText('checkout.placeOrder'));
    expect(screen.getByText('delivery.guestPromptTitle')).toBeTruthy();
    fireEvent.click(screen.getByText('delivery.continueAsGuest'));
    await waitFor(() => expect(mocks.signInAsGuest).toHaveBeenCalled());
    await waitFor(() => expect(mocks.createDeliveryOrder).toHaveBeenCalledTimes(1));
    const call = mocks.createDeliveryOrder.mock.calls[0]!;
    expect(call[0]).toMatchObject({ name: 'Ali', phone: '0555', zoneId: 'z1' });
    expect(call[1]).toHaveLength(1);
    expect(call[1][0].catalogRef).toBe('d1');
    expect(call[1][0].quantity).toBe(2);
  });

  it('passes every cart line as an order item (multi-item)', async () => {
    const second = { ...phone, catalogRef: 'd2', model: 'Galaxy A54' };
    renderCheckout([{ ...phone, quantity: 1 }, { ...second, quantity: 1 }]);
    act(() => authStatusSetter('authenticated'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.fullName'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.phone'), { target: { value: '0555' } });
    fireEvent.click(screen.getByText('checkout.placeOrder'));
    await waitFor(() => expect(mocks.createDeliveryOrder).toHaveBeenCalledTimes(1));
    const items = mocks.createDeliveryOrder.mock.calls[0]![1];
    expect(items).toHaveLength(2);
  });

  it('navigates to order-confirmation via REPLACE on success', async () => {
    renderCheckout();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.fullName'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.phone'), { target: { value: '0555' } });
    act(() => authStatusSetter('authenticated'));
    fireEvent.click(screen.getByText('checkout.placeOrder'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('order-confirmation'));
  });

  it('surfaces a stale-listing error (ITEM_NOT_ORDERABLE / ITEM_NOT_FOUND)', async () => {
    mocks.createDeliveryOrder.mockRejectedValue(new Error('ITEM_NOT_FOUND'));
    renderCheckout();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.fullName'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByPlaceholderText('delivery.phone'), { target: { value: '0555' } });
    act(() => authStatusSetter('authenticated'));
    fireEvent.click(screen.getByText('checkout.placeOrder'));
    await waitFor(() => expect(screen.getByText('delivery.listingUnavailable')).toBeTruthy());
  });
});

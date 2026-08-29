import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';
import { OrderConfirmationScreen } from '../../screens/checkout/OrderConfirmationScreen';
import { setPendingOrder, resetPendingOrder } from '../../core/order/confirmation-state';
import type { DeliveryOrderResult } from '../../services/delivery-service';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

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

const phone: CartLineInput = {
  catalogRef: 'd1',
  domain: 'phone',
  category: 'phone',
  brand: 'Samsung',
  model: 'Galaxy S23',
  displayUnitPrice: 1000,
  stock: 5,
};

function GoToConfirmation() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'order-confirmation' });
  }, [dispatch]);
  return null;
}

function ScreenProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function CartCount() {
  const cart = useCart();
  return <div data-testid="cart-count">{cart.itemCount}</div>;
}

function Seed() {
  const cart = useCart();
  useEffect(() => {
    cart.addLine({ ...phone, quantity: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderConfirmation() {
  return render(
    <AppProvider>
      <CartProvider>
        <GoToConfirmation />
        <Seed />
        <OrderConfirmationScreen />
        <CartCount />
        <ScreenProbe />
      </CartProvider>
    </AppProvider>,
  );
}

describe('OrderConfirmationScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPendingOrder();
  });

  it('renders the order receipt from the transient order result', () => {
    setPendingOrder(RESULT);
    renderConfirmation();
    expect(screen.getByText('FC-000001')).toBeTruthy();
    expect(screen.getByText('delivery.orderPlaced')).toBeTruthy();
  });

  it('clears the cart after confirming', async () => {
    setPendingOrder(RESULT);
    renderConfirmation();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('0'));
  });

  it('navigates to home via REPLACE on the ghost CTA', async () => {
    setPendingOrder(RESULT);
    renderConfirmation();
    fireEvent.click(screen.getByText('category.backToHome'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('home'));
  });
});

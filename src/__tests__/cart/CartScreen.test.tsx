import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';
import { CartScreen } from '../../screens/cart/CartScreen';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
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

const car: CartLineInput = {
  catalogRef: 'c1',
  domain: 'car',
  category: 'car',
  brand: 'Tesla Model 3',
  model: '2024',
  displayUnitPrice: 8000000,
  stock: 1,
};

function GoToCart() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'cart' });
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

function renderCart(initial: CartLineInput[] = []) {
  return render(
    <AppProvider>
      <CartProvider>
        <GoToCart />
        <Seed initial={initial} />
        <CartScreen />
        <ScreenProbe />
      </CartProvider>
    </AppProvider>,
  );
}

describe('CartScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when the cart has no lines', () => {
    renderCart([]);
    expect(screen.getByText('cart.empty')).toBeTruthy();
    expect(screen.getByText('cart.continueShopping')).toBeTruthy();
  });

  it('lists seeded lines with brand + model', () => {
    renderCart([{ ...phone, quantity: 2 }]);
    expect(screen.getByText('Samsung Galaxy S23')).toBeTruthy();
  });

  it('increments and decrements a line quantity', () => {
    renderCart([{ ...phone, quantity: 1 }]);
    fireEvent.click(screen.getByLabelText('increase'));
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('decrease'));
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('removes a line', () => {
    renderCart([{ ...phone, quantity: 1 }, { ...car, quantity: 1 }]);
    const removeButtons = screen.getAllByLabelText('cart.remove');
    fireEvent.click(removeButtons[0]!);
    expect(screen.queryByText('Samsung Galaxy S23')).toBeNull();
    expect(screen.getByText('Tesla Model 3 2024')).toBeTruthy();
  });

  it('navigates to the request form when proceeding', async () => {
    renderCart([{ ...phone, quantity: 1 }]);
    fireEvent.click(screen.getByText(/cart\.sendRequest/));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('request'));
  });
});

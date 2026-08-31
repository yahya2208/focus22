import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';
import { CartProvider, useCart, type CartLineInput } from '../../core/cart/CartContext';
import { RequestScreen } from '../../screens/request/RequestScreen';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: vi.fn().mockResolvedValue(undefined),
  getDeliveryZones: () => [],
}));

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('../../providers/WhatsAppProvider', () => ({
  useWhatsApp: () => ({ send: mocks.send }),
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

const produce: CartLineInput = {
  catalogRef: 'p1',
  domain: 'produce',
  category: 'produce',
  brand: 'بطاطا',
  model: 'بلدي',
  displayUnitPrice: 120,
  stock: 20,
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

function CartCount() {
  const cart = useCart();
  return <div data-testid="cart-count">{cart.itemCount}</div>;
}

function renderRequest(initial: CartLineInput[] = [{ ...phone, quantity: 2 }]) {
  return render(
    <AppProvider>
      <CartProvider>
        <Seed initial={initial} />
        <RequestScreen />
        <CartCount />
      </CartProvider>
    </AppProvider>,
  );
}

describe('RequestScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders contact + delivery-area fields', () => {
    renderRequest();
    expect(screen.getByPlaceholderText('request.phone')).toBeTruthy();
    expect(screen.getByPlaceholderText('request.address')).toBeTruthy();
    expect(screen.getByPlaceholderText('request.notes')).toBeTruthy();
  });

  it('requires a phone number before sending', () => {
    renderRequest();
    fireEvent.click(screen.getByText('request.submitWhatsApp'));
    expect(screen.getByText('request.phoneRequired')).toBeTruthy();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not send when the phone is empty (no partial handoff)', () => {
    renderRequest();
    fireEvent.click(screen.getByText('request.submitWhatsApp'));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends via WhatsApp with every cart line + customer data and clears the cart', async () => {
    renderRequest([{ ...phone, quantity: 2 }, { ...produce, quantity: 3 }]);
    fireEvent.change(screen.getByPlaceholderText('request.phone'), { target: { value: '0550 12 34 56' } });
    fireEvent.change(screen.getByPlaceholderText('request.address'), { target: { value: 'حي السلام' } });
    fireEvent.click(screen.getByText('request.submitWhatsApp'));

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const message = mocks.send.mock.calls[0]![0] as string;
    expect(message).toContain('FOCUS — طلب جديد');
    expect(message).toContain('Samsung Galaxy S23');
    expect(message).toContain('الكمية: 2');
    expect(message).toContain('بطاطا');
    expect(message).toContain('الهاتف: 0550 12 34 56');
    expect(message).toContain('حي السلام');
    expect(mocks.send.mock.calls[0]![1]).toMatchObject({ action: 'inquiry' });
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('0'));
  });

  it('includes the produce unit and displayed price as information only', async () => {
    renderRequest([{ ...produce, quantity: 3 }]);
    fireEvent.change(screen.getByPlaceholderText('request.phone'), { target: { value: '0550' } });
    fireEvent.click(screen.getByText('request.submitWhatsApp'));
    const message = mocks.send.mock.calls[0]![0] as string;
    expect(message).toContain('بطاطا');
    expect(message).toContain('السعر المعروض: 120 د.ج');
    expect(message).toContain('الكمية: 3 كغ');
  });
});
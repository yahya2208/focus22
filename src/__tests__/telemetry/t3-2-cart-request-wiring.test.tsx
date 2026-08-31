import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { AppProvider } from '../../store/navigation';
import {
  CartProvider,
  useCart,
  type CartLineInput,
} from '../../core/cart/CartContext';
import { CartScreen } from '../../screens/cart/CartScreen';
import { RequestScreen } from '../../screens/request/RequestScreen';
import type { TelemetryEventName } from '../../core/telemetry';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../core/telemetry', () => ({ track: mockTrack }));

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

const waSend = vi.hoisted(() => vi.fn());
vi.mock('../../providers/WhatsAppProvider', () => ({
  useWhatsApp: () => ({ send: waSend }),
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

function wrapper({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}

function events(): Array<Record<string, unknown>> {
  return (mockTrack.mock.calls as Array<[Record<string, unknown>]>).map((c) => c[0]);
}

function eventsOf(name: TelemetryEventName): Array<Record<string, unknown>> {
  return events().filter((e) => e.event === name);
}

const FORBIDDEN = ['phone', 'address', 'notes', 'message', 'token', 'code', 'email', 'name', 'brand', 'model', 'body', 'text', 'description', 'title'];

function assertNoPii() {
  // Serialize every event payload and assert none of the forbidden/PII keys or
  // values appear on the wire.
  for (const evt of events()) {
    expect(evt.entityId ?? '').not.toMatch(/055|Samsung|Galaxy|بطاطا/);
    const keys = Object.keys(evt.properties ?? {}).map((k) => k.toLowerCase());
    for (const k of keys) {
      expect(FORBIDDEN).not.toContain(k);
      expect(k).not.toContain('phone');
    }
    const values = Object.values(evt.properties ?? {}).map((v) => String(v).toLowerCase());
    for (const v of values) {
      expect(v).not.toMatch(/055|samsung|galaxy|بطاطا|007|password|secret/);
    }
  }
}

describe('T3.2 — Cart wiring (CartContext provider)', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    waSend.mockReset();
  });

  it('cart_quantity_change fires with entityId=catalogRef and qty', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    mockTrack.mockClear();
    act(() => result.current.setQuantity('d1', 3));
    const evt = eventsOf('cart_quantity_change');
    expect(evt).toHaveLength(1);
    expect(evt[0]).toMatchObject({ event: 'cart_quantity_change', entityType: 'product', entityId: 'd1', properties: { qty: 3 } });
  });

  it('cart_quantity_change clamps to stock and reports the actual qty', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    mockTrack.mockClear();
    act(() => result.current.setQuantity('d1', 99));
    expect(eventsOf('cart_quantity_change')[0]).toMatchObject({ entityId: 'd1', properties: { qty: 5 } });
  });

  it('cart_remove fires with entityId only and no properties', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    act(() => result.current.addLine(produce));
    mockTrack.mockClear();
    act(() => result.current.removeLine('d1'));
    const evt = eventsOf('cart_remove');
    expect(evt).toHaveLength(1);
    expect(evt[0]).toMatchObject({ event: 'cart_remove', entityType: 'product', entityId: 'd1' });
    expect(evt[0]).not.toHaveProperty('properties');
  });

  it('cart_clear fires with count = lines before wipe', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    act(() => result.current.addLine(produce));
    mockTrack.mockClear();
    act(() => result.current.clear());
    const evt = eventsOf('cart_clear');
    expect(evt).toHaveLength(1);
    expect(evt[0]).toMatchObject({ event: 'cart_clear', properties: { count: 2 } });
    expect(result.current.isEmpty).toBe(true);
  });

  it('does NOT fire cart_add from addLine (avoids duplicate with screen wiring)', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    mockTrack.mockClear();
    act(() => result.current.addLine(phone));
    expect(eventsOf('cart_add')).toHaveLength(0);
  });

  it('sends no PII on cart mutation events', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addLine(phone));
    mockTrack.mockClear();
    act(() => result.current.setQuantity('d1', 2));
    act(() => result.current.removeLine('d1'));
    act(() => result.current.addLine(produce));
    act(() => result.current.clear());
    assertNoPii();
  });
});

describe('T3.2 — Cart view (CartScreen)', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    waSend.mockReset();
  });

  function Seed({ initial }: { initial: CartLineInput[] }) {
    const cart = useCart();
    useEffect(() => {
      initial.forEach((line) => cart.addLine(line));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  function renderCart(initial: CartLineInput[] = [phone]) {
    return render(
      <AppProvider>
        <CartProvider>
          <Seed initial={initial} />
          <CartScreen />
        </CartProvider>
      </AppProvider>,
    );
  }

  it('cart_view fires once with line count on a non-empty cart', async () => {
    renderCart([phone]);
    await waitFor(() => expect(eventsOf('cart_view').length).toBeGreaterThan(0));
    const view = eventsOf('cart_view');
    expect(view[0]).toMatchObject({ event: 'cart_view', properties: { count: 1 } });
    expect(view.length).toBe(1);
  });

  it('does NOT fire cart_view for an empty cart', async () => {
    renderCart([]);
    await new Promise((r) => setTimeout(r, 50));
    expect(eventsOf('cart_view')).toHaveLength(0);
  });

  it('does not send PII in cart_view', () => {
    renderCart([phone]);
    assertNoPii();
  });
});

describe('T3.2 — Request lifecycle (RequestScreen)', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    waSend.mockReset();
  });

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

  it('request_start fires once when the terminal opens with a non-empty cart', async () => {
    renderRequest();
    await waitFor(() => expect(eventsOf('request_start').length).toBe(1));
    expect(eventsOf('request_start')[0]).toMatchObject({ event: 'request_start' });
    expect(eventsOf('request_start')[0]).not.toHaveProperty('properties');
  });

  it('request_submit + request_success + whatsapp_open fire only after validation passes and send runs', async () => {
    renderRequest();
    fireEvent.change(screen.getByPlaceholderText('request.phone'), { target: { value: '0550' } });
    mockTrack.mockClear();
    fireEvent.click(screen.getByText('request.submitWhatsApp'));
    expect(waSend).toHaveBeenCalledTimes(1);
    expect(eventsOf('request_submit')).toHaveLength(1);
    expect(eventsOf('request_success')).toHaveLength(1);
    const wa = eventsOf('whatsapp_open');
    expect(wa).toHaveLength(1);
    expect(wa[0]).toMatchObject({ event: 'whatsapp_open', properties: { method: 'wa.me' } });
  });

  it('request_failed + no request_submit on validation failure', () => {
    renderRequest();
    mockTrack.mockClear();
    fireEvent.click(screen.getByText('request.submitWhatsApp'));
    expect(waSend).not.toHaveBeenCalled();
    expect(eventsOf('request_failed')).toHaveLength(1);
    expect(eventsOf('request_failed')[0]).toMatchObject({ event: 'request_failed', properties: { error_code: 'validation' } });
    expect(eventsOf('request_submit')).toHaveLength(0);
    expect(eventsOf('request_success')).toHaveLength(0);
  });

  it('no PII reaches track() across the full submit lifecycle', async () => {
    renderRequest([{ ...phone, quantity: 2 }, { ...produce, quantity: 3 }]);
    fireEvent.change(screen.getByPlaceholderText('request.phone'), { target: { value: '0550 12 34 56' } });
    fireEvent.change(screen.getByPlaceholderText('request.address'), { target: { value: 'حي السلام' } });
    fireEvent.click(screen.getByText('request.submitWhatsApp'));
    await waitFor(() => expect(waSend).toHaveBeenCalledTimes(1));
    assertNoPii();
  });

  it('request_start does not spam on rerenders', async () => {
    const { rerender } = renderRequest();
    await waitFor(() => expect(eventsOf('request_start').length).toBe(1));
    rerender(
      <AppProvider>
        <CartProvider>
          <Seed initial={[{ ...phone, quantity: 2 }]} />
          <RequestScreen />
          <CartCount />
        </CartProvider>
      </AppProvider>,
    );
    // Same cart instance held the ref; no duplicate request_start.
    expect(eventsOf('request_start').length).toBe(1);
  });
});

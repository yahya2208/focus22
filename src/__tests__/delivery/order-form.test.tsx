/**
 * OrderForm tests — delivery end-to-end (00050).
 *
 * Covers the marketplace checkout rules:
 *   OF-01: authenticated user can place an order directly
 *   OF-02: logged-out user can fill the form without any account creation
 *   OF-03: Place Order while logged out shows the explicit guest/sign-in gate
 *   OF-04: Continue as guest creates the anonymous session only after explicit
 *          consent, then submits successfully
 *   OF-05: Sign in requests navigation (draft preserved by parent)
 *   OF-06: Cancelling the prompt creates no account and no order
 *   OF-07: quantity is capped by stock; out-of-stock cannot submit
 *   OF-08: the fee/ETA always come from estimateDelivery (RPC), never client-calculated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { OrderForm, toOrderable, type DeliveryCustomerDraft } from '../../components/delivery/OrderForm';
import type { InventoryRecord } from '../../services/inventory-service';
import type { DeliveryEstimate, DeliveryOrderResult, DeliveryZone } from '../../services/delivery-service';

const mocks = vi.hoisted(() => ({
  zones: [
    { id: 'z1', name: 'City Center', name_ar: 'وسط المدينة', is_active: true },
    { id: 'z2', name: 'Suburbs', name_ar: 'الضواحي', is_active: true },
  ],
  signInAsGuest: vi.fn(),
  createDeliveryOrder: vi.fn(),
  estimateDelivery: vi.fn(),
  onRequestSignIn: vi.fn(),
  onDraftChange: vi.fn(),
}));

const ZONES: DeliveryZone[] = mocks.zones;
const mockSignInAsGuest = mocks.signInAsGuest;
const mockCreateDeliveryOrder = mocks.createDeliveryOrder;
const mockEstimateDelivery = mocks.estimateDelivery;
const mockOnRequestSignIn = mocks.onRequestSignIn;
const mockOnDraftChange = mocks.onDraftChange;

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated';
let authStatusSetter: (s: AuthStatus) => void;

vi.mock('../../core/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/auth/AuthProvider')>();
  const { useState, useEffect } = await import('react');
  return {
    ...actual,
    useAuth: () => {
      const [status, setStatus] = useState<AuthStatus>('unauthenticated');
      useEffect(() => {
        authStatusSetter = setStatus;
      }, []);
      const user = status === 'unauthenticated' || status === 'loading' ? null : { id: 'u-1' };
      return {
        state: { status, user, error: null },
        service: { signInAsGuest: mocks.signInAsGuest, getCurrentUser: () => user },
        researchRole: 'none',
      };
    },
  };
});

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#f0f0f6', textSecondary: '#a8a8c0', textMuted: '#6868a0', textFaint: '#3c3c68',
    bgCard: 'rgba(16,16,28,0.85)', bgHover: '#1c1c38', bg: '#0a0a12', glass: 'rgba(255,255,255,0.03)',
    glassBorder: 'rgba(255,255,255,0.07)', borderLight: '#24243e', accent: '#00e4b8',
    success: '#b8f24c', successBg: 'rgba(184,242,76,0.10)', successText: '#b8f24c',
    warning: '#ffc244', warningBg: 'rgba(255,194,68,0.10)', warningText: '#ffd06a',
    danger: '#ff6b7a', dangerBg: 'rgba(255,107,122,0.10)', dangerText: '#ff9aa5',
  }),
}));

const ESTIMATE: DeliveryEstimate = { available: true, fee: 350, minutesMin: 30, minutesMax: 45 };

const RESULT: DeliveryOrderResult = {
  orderId: 'o-1',
  orderNumber: 'FC-000001',
  status: 'pending',
  subtotal: 1000,
  deliveryFee: 350,
  total: 1350,
  etaMinutesMin: 30,
  etaMinutesMax: 45,
};

const DEVICE: InventoryRecord = {
  id: 'd1', modelId: 'm1', brand: 'Samsung', model: 'Galaxy S23', variant: '128GB',
  ram: '8GB', storage: '128GB', condition: 'New', quantity: 5, sellPrice: 1000,
  createdAt: '2024-01-01', updatedAt: '2024-01-01', totalPurchased: 5, totalSold: 0,
};

vi.mock('../../services/inventory-service', () => ({
  InventoryService: { getExchangeableDevices: () => [DEVICE] },
}));

vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: vi.fn().mockResolvedValue(undefined),
  getDeliveryZones: () => ZONES,
  estimateDelivery: mocks.estimateDelivery,
  createDeliveryOrder: mocks.createDeliveryOrder,
}));

function Harness({ draft }: { draft?: DeliveryCustomerDraft }) {
  const [open, setOpen] = useState(true);
  return (
    <OrderForm
      open={open}
      item={toOrderable(DEVICE)}
      initialQuantity={1}
      draft={draft}
      onClose={() => setOpen(false)}
      onDraftChange={mockOnDraftChange}
      onRequestSignIn={mockOnRequestSignIn}
    />
  );
}

function renderForm(draft?: DeliveryCustomerDraft) {
  return render(<Harness draft={draft} />);
}

function fillCustomer() {
  const fields = screen.getAllByRole('textbox');
  const nameInput = fields.find((el) => (el as HTMLInputElement).placeholder === 'delivery.fullName');
  const phoneInput = fields.find((el) => (el as HTMLInputElement).placeholder === 'delivery.phone');
  if (nameInput) fireEvent.change(nameInput, { target: { value: 'Yahya' } });
  if (phoneInput) fireEvent.change(phoneInput, { target: { value: '0555' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEstimateDelivery.mockResolvedValue(ESTIMATE);
  mockCreateDeliveryOrder.mockResolvedValue(RESULT);
  mockSignInAsGuest.mockResolvedValue({ id: 'u-guest' });
  authStatusSetter = () => {};
});

describe('OrderForm — authenticated user', () => {
  it('OF-01: places the order directly via delivery_create_order (RPC only)', async () => {
    renderForm();
    act(() => authStatusSetter('authenticated'));
    await act(async () => { await Promise.resolve(); });

    const zone = screen.getByRole('combobox');
    fireEvent.change(zone, { target: { value: 'z1' } });
    fillCustomer();

    const orderBtn = Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.orderButton');
    expect(orderBtn).toBeTruthy();
    fireEvent.click(orderBtn!);

    await waitFor(() => {
      expect(mockCreateDeliveryOrder).toHaveBeenCalledTimes(1);
    });
    const call = mockCreateDeliveryOrder.mock.calls[0]!;
    const items = call[1];
    expect(items).toHaveLength(1);
    expect(items[0].catalogRef).toBe('d1');
    expect(items[0].quantity).toBe(1);
    expect(screen.getByText('delivery.orderPlaced')).toBeTruthy();
  });
});

describe('OrderForm — logged-out user (P3)', () => {
  it('OF-02: can fill the whole form with NO account creation', async () => {
    act(() => authStatusSetter('unauthenticated'));
    renderForm();
    await act(async () => { await Promise.resolve(); });
    const zone = screen.getByRole('combobox');
    fireEvent.change(zone, { target: { value: 'z1' } });
    fillCustomer();
    expect(mockSignInAsGuest).not.toHaveBeenCalled();
    expect(mockCreateDeliveryOrder).not.toHaveBeenCalled();
  });

  it('OF-03: Place Order while logged out shows the explicit guest/sign-in gate (no submit yet)', async () => {
    act(() => authStatusSetter('unauthenticated'));
    renderForm();
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fillCustomer();

    const orderBtn = Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.orderButton');
    fireEvent.click(orderBtn!);

    expect(screen.getByText('delivery.guestPromptTitle')).toBeTruthy();
    expect(mockSignInAsGuest).not.toHaveBeenCalled();
    expect(mockCreateDeliveryOrder).not.toHaveBeenCalled();
  });

  it('OF-04: Continue as guest creates the anonymous session ONLY on explicit consent, then submits', async () => {
    act(() => authStatusSetter('unauthenticated'));
    renderForm();
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fillCustomer();

    const orderBtn = Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.orderButton');
    fireEvent.click(orderBtn!);
    expect(mockSignInAsGuest).not.toHaveBeenCalled();

    fireEvent.click(Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.continueAsGuest')!);

    expect(mockSignInAsGuest).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockCreateDeliveryOrder).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('delivery.orderPlaced')).toBeTruthy();
  });

  it('OF-05: Sign in requests navigation without creating any account', async () => {
    act(() => authStatusSetter('unauthenticated'));
    renderForm();
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fillCustomer();

    const orderBtn = Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.orderButton');
    fireEvent.click(orderBtn!);

    fireEvent.click(Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.signIn')!);
    expect(mockOnRequestSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignInAsGuest).not.toHaveBeenCalled();
    expect(mockCreateDeliveryOrder).not.toHaveBeenCalled();
  });

  it('OF-06: cancelling the prompt creates no account and no order', async () => {
    act(() => authStatusSetter('unauthenticated'));
    renderForm();
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    fillCustomer();

    const orderBtn = Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.orderButton');
    fireEvent.click(orderBtn!);

    fireEvent.click(Array.from(screen.getAllByRole('button')).find((b) => b.textContent === 'delivery.cancel')!);
    expect(mockSignInAsGuest).not.toHaveBeenCalled();
    expect(mockCreateDeliveryOrder).not.toHaveBeenCalled();
  });
});

describe('OrderForm — quantity + stock safety', () => {
  it('OF-07: does not submit when the item is out of stock', async () => {
    act(() => authStatusSetter('authenticated'));
    render(
      <OrderForm
        open
        item={toOrderable({ ...DEVICE, quantity: 0 })}
        initialQuantity={1}
        onClose={() => {}}
        onRequestSignIn={mocks.onRequestSignIn}
      />,
    );
    const orderBtn = Array.from(screen.queryAllByRole('button') ?? []).find((b) => b.textContent === 'delivery.orderButton');
    expect(orderBtn).toBeTruthy();
    expect((orderBtn as HTMLButtonElement).disabled).toBe(true);
    expect(mockCreateDeliveryOrder).not.toHaveBeenCalled();
  });
});

describe('OrderForm — estimate is RPC-only', () => {
  it('OF-08: fee/ETA come from estimateDelivery (delivery_estimate), not client math', async () => {
    act(() => authStatusSetter('authenticated'));
    renderForm();
    await act(async () => { await Promise.resolve(); });

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'z1' } });
    await waitFor(() => {
      expect(mockEstimateDelivery).toHaveBeenCalledWith('z1', 1000);
    });

    // Fee comes from the RPC estimate result (350), not client-side math.
    expect(screen.getAllByText(/350/).length).toBeGreaterThan(0);
  });
});

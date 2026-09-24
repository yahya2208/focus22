import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderAlertBanner } from '../../components/order/OrderAlertBanner';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

const dispatch = vi.fn();
vi.mock('../../store/navigation', () => ({
  useAppDispatch: () => dispatch,
}));

describe('OrderAlertBanner — global NEW_ORDER alert', () => {
  beforeEach(() => dispatch.mockClear());

  it('renders nothing without alerts', () => {
    const { container } = render(<OrderAlertBanner alerts={[]} onDismiss={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('shows order reference + total and opens Store Ops on click', () => {
    render(
      <OrderAlertBanner
        alerts={[{ orderId: 'order-abcdef-1234', storeId: 's1', total: 440, createdAt: '2026-09-24' }]}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('pilot.newOrderAlertTitle')).toBeTruthy();
    expect(screen.getByText(/#order-ab/)).toBeTruthy();
    fireEvent.click(screen.getByText('pilot.openOrder'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'NAVIGATE',
      screen: 'pilot-store-ops',
      params: { orderId: 'order-abcdef-1234' },
    });
  });

  it('dismisses without touching the order', () => {
    const onDismiss = vi.fn();
    render(
      <OrderAlertBanner
        alerts={[{ orderId: 'o1', storeId: null, total: null, createdAt: '' }]}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByLabelText('pilot.dismissAlert'));
    expect(onDismiss).toHaveBeenCalledWith('o1');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('renders minimal content when total is unknown', () => {
    render(
      <OrderAlertBanner
        alerts={[{ orderId: 'o2', storeId: null, total: null, createdAt: '' }]}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId('order-alert-o2')).toBeTruthy();
  });

  it('announces politely without blocking (non-modal live region)', async () => {
    const { container } = render(
      <OrderAlertBanner
        alerts={[{ orderId: 'o3', storeId: 's1', total: 10, createdAt: '' }]}
        onDismiss={() => {}}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    });
  });
});

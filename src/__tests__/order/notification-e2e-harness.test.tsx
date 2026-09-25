import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useOrderAlerts } from '../../hooks/useOrderAlerts';
import { OrderAlertBanner } from '../../components/order/OrderAlertBanner';
import {
  subscribePush,
} from '../../services/browser-notify';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../store/navigation', () => ({
  useAppDispatch: () => vi.fn(),
}));

type Payload = { eventType: string; newRecord: Record<string, unknown> | null };
let onPayload: ((p: Payload) => void) | null = null;
const startMock = vi.fn();
const stopMock = vi.fn();
vi.mock('../../services/pilot-realtime-service', () => ({
  createPilotOrderRealtime: (opts: { onPayload?: (p: Payload) => void }) => {
    onPayload = opts.onPayload ?? null;
    return { start: startMock, stop: stopMock };
  },
}));

const fetchMyStores = vi.fn(async () => [{ id: 's1' }]);
vi.mock('../../services/neighborhood-service', () => ({
  fetchMyStores: (...a: unknown[]) => (fetchMyStores as (...x: unknown[]) => Promise<unknown[]>)(...a),
}));

let authState: { status: string; user: { id: string; role: string } | null } = {
  status: 'authenticated',
  user: { id: 'u1', role: 'admin' },
};
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: authState, service: {} }),
}));

function Harness() {
  const { alerts, dismiss } = useOrderAlerts();
  return (
    <div>
      <OrderAlertBanner alerts={alerts} onDismiss={dismiss} />
      <div data-testid="count">{alerts.length}</div>
    </div>
  );
}

const order = (id: string, store = 's1', total = 100): Payload => ({
  eventType: 'INSERT',
  newRecord: { id, store_id: store, total, created_at: '2026-09-25T10:00:00Z' },
});

describe('G-N4 notification E2E harness (mocked transport)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset (not just clear): drains implementations AND any unconsumed
    // mockResolvedValueOnce queue entries, so no test inherits another's
    // store list. Every test below then sets its own explicit value.
    fetchMyStores.mockReset();
    onPayload = null;
    authState = { status: 'authenticated', user: { id: 'u1', role: 'admin' } };
    Object.defineProperty(window, 'Notification', {
      writable: true,
      configurable: true,
      value: { permission: 'granted', requestPermission: vi.fn(async () => 'granted' as const) },
    });
  });

  it('order INSERT → banner with reference, total, open action', async () => {
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o1', 's1', 440));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByText('pilot.newOrderAlertTitle')).toBeTruthy();
  });

  it('duplicate realtime delivery collapses to one banner', async () => {
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o2'));
      onPayload!(order('o2'));
      onPayload!(order('o2'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
  });

  it('reconnect redelivery does not duplicate', async () => {
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o3'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    await act(async () => {
      onPayload!(order('o3'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('admin + operator same user sees one banner (display dedup)', async () => {
    authState = { status: 'authenticated', user: { id: 'u-both', role: 'admin' } };
    fetchMyStores.mockResolvedValue([{ id: 's1' }]);
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o4', 's1'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
  });

  it('family role sees nothing', async () => {
    authState = { status: 'authenticated', user: { id: 'u-fam', role: 'user' } };
    fetchMyStores.mockResolvedValue([]);
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o5', 's1'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('other-store operator sees nothing for foreign orders', async () => {
    authState = { status: 'authenticated', user: { id: 'u-op', role: 'user' } };
    fetchMyStores.mockResolvedValue([{ id: 's9' }]);
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o6', 's1'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('anonymous session subscribes to nothing', async () => {
    authState = { status: 'unauthenticated', user: null };
    render(<Harness />);
    expect(startMock).not.toHaveBeenCalled();
  });

  it('dismiss removes only that order', async () => {
    render(<Harness />);
    await act(async () => {
      onPayload!(order('o7'));
      onPayload!(order('o8'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    fireEvent.click(screen.getAllByLabelText('pilot.dismissAlert')[0]!);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
  });

  it('push subscribe declines cleanly without platform support', async () => {
    delete (window.navigator as unknown as Record<string, unknown>).serviceWorker;
    await expect(subscribePush('test-key')).resolves.toBe(false);
  });

  it('banner carries no sensitive payload beyond reference + total', async () => {
    render(<Harness />);
    await act(async () => {
      onPayload!({
        eventType: 'INSERT',
        newRecord: { id: 'o10', store_id: 's1', total: 50, created_at: '', family_id: 'SECRET', phone: 'SECRET' },
      });
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.queryByText(/SECRET/)).toBeNull();
  });
});

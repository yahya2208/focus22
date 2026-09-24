import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useOrderAlerts } from '../../hooks/useOrderAlerts';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
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
  user: { id: 'u-admin', role: 'admin' },
};
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: authState, service: {} }),
}));

function Probe() {
  const { alerts, dismiss } = useOrderAlerts();
  return (
    <div>
      <div data-testid="count">{alerts.length}</div>
      <div data-testid="ids">{alerts.map((a) => a.orderId).join(',')}</div>
      <button type="button" onClick={() => dismiss('o1')}>
        dismiss
      </button>
    </div>
  );
}

const order = (id: string, store = 's1', total = 440): Payload => ({
  eventType: 'INSERT',
  newRecord: { id, store_id: store, total, created_at: '2026-09-24T10:00:00Z' },
});

describe('useOrderAlerts — global listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onPayload = null;
    authState = { status: 'authenticated', user: { id: 'u-admin', role: 'admin' } };
  });

  it('shows one alert per new order for admins (dedup on repeat delivery)', async () => {
    render(<Probe />);
    expect(startMock).toHaveBeenCalled();
    await act(async () => {
      onPayload!(order('o1'));
      onPayload!(order('o1'));
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByTestId('ids').textContent).toBe('o1');
  });

  it('ignores non-INSERT events', async () => {
    render(<Probe />);
    await act(async () => {
      onPayload!({ eventType: 'UPDATE', newRecord: { id: 'o9', store_id: 's1', total: 1, created_at: '' } });
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('shows nothing for family roles', async () => {
    authState = { status: 'authenticated', user: { id: 'u-fam', role: 'user' } };
    fetchMyStores.mockResolvedValueOnce([]);
    render(<Probe />);
    await act(async () => {
      onPayload!(order('o2'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('shows store-scoped orders to operators of that store', async () => {
    authState = { status: 'authenticated', user: { id: 'u-op', role: 'user' } };
    fetchMyStores.mockResolvedValueOnce([{ id: 's1' }]);
    render(<Probe />);
    await act(async () => {
      onPayload!(order('o3', 's1'));
      onPayload!(order('o4', 's2'));
    });
    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('o3'));
  });

  it('stays silent without a session', async () => {
    authState = { status: 'unauthenticated', user: null };
    render(<Probe />);
    expect(startMock).not.toHaveBeenCalled();
  });
});

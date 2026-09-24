import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useBackgroundNotify, getNotifyPermission, subscribePush } from '../../services/browser-notify';
import { NotificationPermissionCta } from '../../components/order/NotificationPermissionCta';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated', user: { id: 'u1', role: 'admin' } }, service: {} }),
}));

function Harness({ alerts }: { alerts: { orderId: string; storeId: string | null; total: number | null; createdAt: string }[] }) {
  useBackgroundNotify(alerts, (a) => ({ title: 'T', body: a.orderId }));
  return null;
}

describe('background notify layer (G-N2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'Notification', {
      writable: true,
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn(async () => 'granted' as const) },
    });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).Notification;
  });

  it('does nothing without granted permission', () => {
    expect(getNotifyPermission()).toBe('default');
    render(<Harness alerts={[{ orderId: 'o1', storeId: null, total: null, createdAt: '' }]} />);
    expect(screen.queryByText(/o1/)).toBeNull();
  });

  it('permission CTA asks once and persists dismissal', async () => {
    const { unmount } = render(<NotificationPermissionCta />);
    expect(screen.getByText('pilot.notifyPermissionHint')).toBeTruthy();
    fireEvent.click(screen.getByText('✕'));
    unmount();
    render(<NotificationPermissionCta />);
    expect(screen.queryByText('pilot.notifyPermissionHint')).toBeNull();
  });

  it('subscribePush declines without service worker support', async () => {
    await expect(subscribePush('test-key')).resolves.toBe(false);
  });
});

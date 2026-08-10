import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import type { InventoryRecord } from '../../services/inventory-service';

interface MockAd {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
}

const mock = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let state: MockAd = { enabled: false, image: '', link: '', alt: '' };
  return {
    __setState: (next: MockAd) => {
      state = next;
    },
    __emit: () => {
      for (const listener of [...listeners]) listener();
    },
    getAd: vi.fn(() => state),
    ensureAdsLoaded: vi.fn(async () => {}),
    subscribeAds: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
});

const mockSend = vi.hoisted(() => vi.fn());
const mockRecordIntent = vi.hoisted(() => vi.fn());

vi.mock('../../services/ads-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/ads-service')>('../../services/ads-service');
  return {
    ...actual,
    getAd: mock.getAd,
    ensureAdsLoaded: mock.ensureAdsLoaded,
    subscribeAds: mock.subscribeAds,
  };
});

vi.mock('../../providers/WhatsAppProvider', () => ({
  useWhatsApp: () => ({
    send: mockSend,
    modal: null,
    retryOpen: vi.fn(),
    copyMessage: vi.fn(async () => true),
    closeModal: vi.fn(),
  }),
}));

vi.mock('../../services/intent-tracking', () => ({
  recordIntent: mockRecordIntent,
}));

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  private readonly callback: IntersectionObserverCallback;
  private readonly options: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options ?? {};
    MockIntersectionObserver.instances.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = () => [];

  trigger(entry: Partial<IntersectionObserverEntry>) {
    this.callback(
      [entry as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  get root() {
    return this.options.root ?? null;
  }

  get rootMargin() {
    return this.options.rootMargin ?? '';
  }

  get thresholds() {
    return this.options.threshold ?? 0;
  }
}

const DEVICE: InventoryRecord = {
  id: 'rec_abcdef12',
  modelId: 'apple-iphone-13',
  brand: 'Apple',
  model: 'iPhone 13',
  variant: '128GB',
  ram: '4GB',
  storage: '128GB',
  condition: 'New',
  quantity: 1,
  sellPrice: 98000,
  city: 'الجزائر',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  totalPurchased: 1,
  totalSold: 0,
};

vi.mock('../../services/inventory-service', () => ({
  InventoryService: {
    getExchangeableDevices: () => [DEVICE],
  },
}));

const DISABLED: MockAd = { enabled: false, image: '', link: '', alt: '' };
const PHONE_AD: MockAd = {
  enabled: true,
  image: 'https://cdn/banner.png',
  link: '#/phone-details?device=rec_abcdef12',
  alt: 'Contact for this phone',
};
const EXTERNAL_AD: MockAd = {
  enabled: true,
  image: 'https://cdn/banner.png',
  link: 'https://go.example',
  alt: 'Special offer',
};

function ParamProbe() {
  const state = useAppState();
  return (
    <div>
      <span data-testid="probe-screen">{state.screen}</span>
      <span data-testid="probe-device">{state.routeParams.device ?? ''}</span>
    </div>
  );
}

function renderBanner(placement: 'home' | 'showroom') {
  return render(
    <AppProvider>
      <ParamProbe />
      <AdContactBanner placement={placement} />
    </AppProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  MockIntersectionObserver.instances = [];
});

describe('AdContactBanner (PHASE C — Ad Click → guarded WhatsApp handoff + view counting)', () => {
  beforeEach(() => {
    mock.__setState(DISABLED);
    vi.clearAllMocks();
    MockIntersectionObserver.instances = [];
  });

  it('renders nothing when the ad is disabled', async () => {
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('banner')).toBeNull();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('renders a normal ad anchor for a non-phone link (no WhatsApp overlay)', async () => {
    mock.__setState(EXTERNAL_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('A');
    expect(banner.getAttribute('href')).toBe('https://go.example');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('PHASE C — phone-linked ad click starts the guarded WhatsApp handoff with the ad context and never navigates', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    fireEvent.click(overlay);

    // Both fire-and-forget intents are recorded in order: ad_click then handoff.
    expect(mockRecordIntent).toHaveBeenCalledWith({
      kind: 'click',
      ctaType: 'ad_click',
      placement: 'home',
      deviceId: DEVICE.id,
    });
    expect(mockRecordIntent).toHaveBeenCalledWith({
      kind: 'whatsapp_handoff_started',
      ctaType: 'inquiry',
      placement: 'home',
      deviceId: DEVICE.id,
    });
    expect(mockRecordIntent).toHaveBeenCalledTimes(2);

    // WhatsApp send was invoked exactly once with the message + context.
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message, context] = mockSend.mock.calls[0] as [string, unknown];
    // The 6-field device contract is intact.
    expect(message).toContain('Apple iPhone 13');
    expect(message).toContain('الكود: rec_abcd');
    expect(message).toContain('السعر: 98,000 دج');
    expect(message).toContain('المدينة: الجزائر');
    expect(message).toContain('رابط الإعلان:');
    // The ad context is included: image + placement.
    expect(message).toContain('صورة الإعلان: https://cdn/banner.png');
    expect(message).toContain('الموضع: home');
    expect(context).toEqual({ action: 'inquiry', deviceId: DEVICE.id });

    // Navigation contract: NOTHING navigates — the handoff is same-tab wa.me.
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
  });

  it('PHASE C — tracking failure never blocks the WhatsApp handoff (fire-and-forget)', async () => {
    mock.__setState(PHONE_AD);
    mockRecordIntent.mockImplementation(() => {
      throw new Error('tracking down');
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    expect(() => fireEvent.click(overlay)).not.toThrow();
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message] = mockSend.mock.calls[0] as [string];
    expect(message).toContain('الموضع: home');
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
  });

  it('keeps the ad banner visible underneath the navigation overlay', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('BATCH 2 — the phone-linked ad renders NO zoom / NO image viewer / NO lightbox', async () => {
    mock.__setState(PHONE_AD);
    const { container } = renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[style*="zoom-in"]')).toBeNull();
    expect(container.querySelector('[style*="zoom-out"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toMatch(/lightbox|viewer|magnif/i);
    // The image is NOT an independent control: the ONLY interactive element is
    // the overlay button, and clicking it navigates — it cannot open zoom.
    const interactive = container.querySelectorAll('a, button, [role="link"], [tabindex]:not([tabindex="-1"])');
    expect(interactive.length).toBe(1);
    expect(interactive[0]!.tagName).toBe('BUTTON');
  });

  it('PHASE C — showroom placement: view and click carry placement "showroom"; click hands off (no navigate)', async () => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    mock.__setState(PHONE_AD);
    renderBanner('showroom');
    await act(async () => {
      await Promise.resolve();
    });

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeTruthy();
    act(() => {
      observer!.trigger({ isIntersecting: true, intersectionRatio: 0.8 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'view', placement: 'showroom', deviceId: DEVICE.id });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    fireEvent.click(overlay);
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'showroom', deviceId: DEVICE.id });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'showroom', deviceId: DEVICE.id });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message] = mockSend.mock.calls[0] as [string];
    expect(message).toContain('الموضع: showroom');
    // No navigation happened — the app screen is untouched.
    expect(screen.getByTestId('probe-screen').textContent).not.toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
  });

  it('records a view only after the banner stays ≥ 0.6 visible for ≥ 1 s', async () => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeTruthy();

    act(() => {
      observer!.trigger({ isIntersecting: true, intersectionRatio: 0.8 });
    });
    // Not yet 1 s — no view yet.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockRecordIntent).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'view', placement: 'home', deviceId: DEVICE.id });
  });

  it('does NOT record a view when the banner drops below 0.6 before 1 s', async () => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeTruthy();
    act(() => {
      observer!.trigger({ isIntersecting: true, intersectionRatio: 0.8 });
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      observer!.trigger({ isIntersecting: false, intersectionRatio: 0.1 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('phone-linked ad exposes exactly ONE focusable target (no duplicate link/button)', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // No link remains underneath the overlay — the banner is non-interactive.
    expect(screen.queryByRole('link')).toBeNull();
    const interactive = document.querySelectorAll('a, button, [role="link"], [tabindex]:not([tabindex="-1"])');
    expect(interactive.length).toBe(1);
    expect(interactive[0]!.tagName).toBe('BUTTON');
    expect(screen.getByRole('button', { name: 'Contact for this phone' })).toBeTruthy();
  });

  it('the single focusable target receives keyboard focus and hands off exactly once', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    overlay.focus();
    expect(document.activeElement).toBe(overlay);
    fireEvent.click(overlay);
    // Exactly one click → exactly one pair of intents + exactly one WhatsApp send.
    expect(mockRecordIntent).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
  });

  it('BATCH 4A — phone link with an unresolvable device renders a NON-interactive banner (no dead link, no navigation)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '#/phone-details?device=ghost-device',
      alt: 'Ghost phone',
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();
    // No overlay button, no focusable target — never a dead <a>, never a nav attempt.
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelectorAll('a, button, [role="link"], [tabindex]:not([tabindex="-1"])').length).toBe(0);
    // Navigation contract: NOTHING navigates for an unresolved phone link.
    expect(screen.getByTestId('probe-screen').textContent).not.toBe('phone-details');
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });
});

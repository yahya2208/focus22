import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import type { AdImage } from '../../services/ads-service';
import type { InventoryRecord } from '../../services/inventory-service';

interface MockAd {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
  images: AdImage[];
}

function adImage(path: string, overrides: Partial<AdImage> = {}): AdImage {
  return { id: `id-${path}`, path, url: `https://cdn/${path}`, position: 0, isCover: false, deviceId: '', ...overrides };
}

const mock = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let state: MockAd = { enabled: false, image: '', link: '', alt: '', images: [] };
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

const DISABLED: MockAd = { enabled: false, image: '', link: '', alt: '', images: [] };
const PHONE_AD: MockAd = {
  enabled: true,
  image: 'https://cdn/banner.png',
  link: '#/phone-details?device=rec_abcdef12',
  alt: 'Contact for this phone',
  images: [],
};
const EXTERNAL_AD: MockAd = {
  enabled: true,
  image: 'https://cdn/banner.png',
  link: 'https://go.example',
  alt: 'Special offer',
  images: [],
};
const PHONE_GALLERY_AD: MockAd = {
  enabled: true,
  image: 'https://cdn/cover.jpg',
  link: '#/phone-details?device=rec_abcdef12',
  alt: 'Contact for this phone',
  images: [
    adImage('cover.jpg', { position: 0, isCover: true }),
    adImage('second.jpg', { position: 1 }),
  ],
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

  it('FOCUS-AD-DETAILS — phone-linked ad: main image opens device details (never WhatsApp)', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // The full-frame overlay is the details surface.
    const overlay = screen.getByTestId('ad-contact-details');
    expect(overlay.getAttribute('aria-label')).toBe('Contact for this phone — عرض التفاصيل');
    fireEvent.click(overlay);

    // Navigation happens — to the device's details page, never a handoff.
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('PHASE C — the corner "تواصل" button starts the guarded WhatsApp handoff with the ad context and never navigates', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const cta = screen.getByTestId('ad-contact-cta');
    expect(cta.getAttribute('aria-label')).toBe('Contact for this phone — فتح المحادثة');
    fireEvent.click(cta);

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

    // Navigation contract: the corner CTA is a same-tab wa.me handoff — nothing navigates.
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

    const cta = screen.getByTestId('ad-contact-cta');
    expect(() => fireEvent.click(cta)).not.toThrow();
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
    // The image is NOT an independent control and there is NO full-frame CTA
    // overlay covering the ad: only the details overlay + the small corner
    // WhatsApp button are interactive, and neither opens zoom.
    const interactive = container.querySelectorAll('a, button, [role="link"], [tabindex]:not([tabindex="-1"])');
    expect(interactive.length).toBe(2);
    expect(interactive[0]!.tagName).toBe('BUTTON');
    expect(interactive[1]!.tagName).toBe('BUTTON');
    expect(screen.getByTestId('ad-contact-details')).toBeTruthy();
    expect(screen.getByTestId('ad-contact-cta')).toBeTruthy();
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

    const cta = screen.getByTestId('ad-contact-cta');
    fireEvent.click(cta);
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
    expect(interactive.length).toBe(2);
    expect(interactive[0]!.tagName).toBe('BUTTON');
    expect(interactive[1]!.tagName).toBe('BUTTON');
    expect(screen.getByTestId('ad-contact-details')).toBeTruthy();
    expect(screen.getByTestId('ad-contact-cta')).toBeTruthy();
  });

  it('the corner CTA receives keyboard focus and hands off exactly once', async () => {
    mock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const cta = screen.getByTestId('ad-contact-cta');
    cta.focus();
    expect(document.activeElement).toBe(cta);
    fireEvent.click(cta);
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
      images: [],
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

  it('multi-image phone-linked ad: carousel owns the interaction — NO full-frame overlay covering the ad', async () => {
    mock.__setState(PHONE_GALLERY_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // The carousel is rendered with the placement's gallery images.
    expect(screen.getByTestId('ad-carousel')).toBeTruthy();
    expect(screen.getByTestId('ad-carousel-current').getAttribute('src')).toBe('https://cdn/cover.jpg');

    // CRITICAL: no whole-banner overlay exists over a carousel — the slides and
    // thumbnails must stay reachable. The carousel owns the interaction.
    expect(screen.queryByTestId('ad-contact-details')).toBeNull();
    expect(screen.queryByTestId('ad-contact-cta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contact for this phone' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();

    // Slides carry no device_id → the ad-level phone device drives the slide.
    fireEvent.load(screen.getByTestId('ad-carousel-current'));

    // Main image → device details via the ad-level device fallback (never WhatsApp).
    fireEvent.click(screen.getByTestId('ad-slide-action'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('multi-image phone-linked ad: corner CTA hands off with the cover image and placement', async () => {
    mock.__setState(PHONE_GALLERY_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.load(screen.getByTestId('ad-carousel-current'));

    const cta = screen.getByTestId('ad-slide-cta');
    fireEvent.click(cta);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message] = mockSend.mock.calls[0] as [string];
    expect(message).toContain('صورة الإعلان: https://cdn/cover.jpg');
    expect(message).toContain('الموضع: home');
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: DEVICE.id });
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
  });

  it('FOCUS-AD-DETAILS — main image opens the slide device details; corner CTA keeps the WhatsApp handoff', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '',
      alt: 'Gallery offer',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: DEVICE.id }),
        adImage('slide2.jpg', { position: 1, deviceId: '' }),
      ],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // Per-slide mode: NO whole-banner overlay (would block the thumbnails); the
    // carousel owns the interaction and there is no AdSpot anchor underneath.
    expect(screen.queryByRole('button', { name: 'Gallery offer' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('ad-carousel')).toBeTruthy();

    // The current (resolvable) slide becomes interactive after load.
    fireEvent.load(screen.getByTestId('ad-carousel-current'));

    // Main-image tap → device details (never the handoff, never WhatsApp).
    fireEvent.click(screen.getByTestId('ad-slide-action'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
    expect(mockSend).not.toHaveBeenCalled();

    // The corner CTA still hands off with the slide's own device + image.
    const cta = screen.getByTestId('ad-slide-cta');
    fireEvent.click(cta);
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: DEVICE.id });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home', deviceId: DEVICE.id });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message] = mockSend.mock.calls[0] as [string];
    expect(message).toContain('صورة الإعلان: https://cdn/slide1.jpg');
    expect(message).toContain('الموضع: home');
  });

  it('00021 — a slide whose device is not in the inventory stays NON-interactive (no dead target)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '',
      alt: 'Gallery offer',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: 'ghost-device' }),
        adImage('slide2.jpg', { position: 1, deviceId: '' }),
      ],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // Current slide = ghost device → not resolvable → no slide target, no
    // whole-banner overlay, no anchor. The only interactive elements are the
    // carousel's own navigation (2 arrows + 2 thumbnails) — never a dead target.
    fireEvent.load(screen.getByTestId('ad-carousel-current'));
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gallery offer' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelectorAll('a, [role="link"], [tabindex]:not([tabindex="-1"])').length).toBe(0);
    expect(document.querySelectorAll('button').length).toBe(4);
    expect(screen.getByTestId('probe-screen').textContent).not.toBe('phone-details');
  });
});

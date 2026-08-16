import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import type { AdDestinationType, AdImage } from '../../services/ads-service';
import type { InventoryRecord } from '../../services/inventory-service';

interface MockAd {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
  images: AdImage[];
  destinationType?: AdDestinationType;
  destination?: Record<string, unknown>;
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

  it('PHASE 2 STEP 4 — destination_type=external renders a safe new-tab anchor from the payload URL (never the legacy link)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '#/phone-details?device=legacy-ignored',
      alt: 'External ad',
      images: [],
      destinationType: 'external',
      destination: { external: { url: 'https://go.example/campaign' } },
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('A');
    // URL comes from the destination payload, never from the legacy link.
    expect(banner.getAttribute('href')).toBe('https://go.example/campaign');
    expect(banner.getAttribute('target')).toBe('_blank');
    expect(banner.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('PHASE 2 STEP 4 — invalid destination_type=external renders NON-interactively (never a dead anchor)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '',
      alt: 'External ad',
      images: [],
      destinationType: 'external',
      destination: { external: { url: 'javascript:alert(1)' } },
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('PHASE 2 STEP 5 — destination_type=whatsapp: single-frame banner converts to the chat (full-frame CTA, no dead anchor)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '#/phone-details?device=legacy-ignored',
      alt: 'WhatsApp offer',
      images: [],
      destinationType: 'whatsapp',
      destination: { whatsapp: { number: '0556254007', message: 'أستفسر عن الإعلان' } },
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();

    const cta = screen.getByTestId('ad-whatsapp-cta');
    fireEvent.click(cta);

    // The chat opens to the payload number (normalized) with the preset message.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      `https://wa.me/213556254007?text=${encodeURIComponent('أستفسر عن الإعلان')}`,
      '_blank',
      'noopener',
    );
    // Placement-only tracking, no device, in order: ad_click then handoff.
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home' });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home' });
    expect(mockRecordIntent).toHaveBeenCalledTimes(2);
    // The whatsapp destination never uses the legacy provider send.
    expect(mockSend).not.toHaveBeenCalled();
    // No internal navigation.
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
    openSpy.mockRestore();
  });

  it('PHASE 2 STEP 5 — invalid destination_type=whatsapp renders NON-interactively (no CTA, no handoff)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '',
      alt: 'WhatsApp offer',
      images: [],
      destinationType: 'whatsapp',
      destination: { whatsapp: { number: 'not-a-number' } },
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();
    expect(screen.queryByTestId('ad-whatsapp-cta')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('PHASE 2 STEP 6 — destination_type=internal: the banner navigates in-app to the allowlisted screen', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '#/phone-details?device=legacy-ignored',
      alt: 'Showroom ad',
      images: [],
      destinationType: 'internal',
      destination: { internal: { screen: 'showroom', params: { tab: 'offers' } } },
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    // The whole banner converts to in-app navigation — no anchor, no WhatsApp,
    // no new tab. The legacy phone link is ignored (strict separation).
    expect(banner.querySelector('a')).toBeNull();

    const cta = screen.getByTestId('ad-internal-cta');
    fireEvent.click(cta);

    // In-app navigation to the allowlisted screen with the payload params.
    expect(screen.getByTestId('probe-screen').textContent).toBe('showroom');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
    expect(screen.getByTestId('probe-screen')).toBeTruthy();
    // ad_click placement-only (target is not phone-details → no deviceId).
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: undefined });
    expect(mockRecordIntent).toHaveBeenCalledTimes(1);
    // No WhatsApp send, no new tab.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('PHASE 2 STEP 6 — invalid destination_type=internal renders NON-interactively (no CTA, no navigation)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '',
      alt: 'Broken internal ad',
      images: [],
      destinationType: 'internal',
      destination: { internal: { screen: 'not-allowlisted' } },
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();
    expect(screen.queryByTestId('ad-internal-cta')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // Nothing navigated.
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    expect(mockRecordIntent).not.toHaveBeenCalled();
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

  it('PHASE 4B (00024) — slide overriding to external converts the whole slide to the external URL', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Mixed gallery',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: DEVICE.id }),
        adImage('slide2.jpg', {
          position: 1,
          deviceId: '',
          destinationType: 'external',
          destination: { external: { url: 'https://slide.example/campaign' } },
        }),
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // Slide 1 (cover) inherits the ad-level phone device → details page.
    fireEvent.load(screen.getByTestId('ad-carousel-current'));
    fireEvent.click(screen.getByTestId('ad-slide-action'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
    expect(openSpy).not.toHaveBeenCalled();

    // Switch to slide 2 — its OWN destination overrides the ad-level phone
    // target. The whole slide converts to the external URL (main image + corner
    // CTA), never the legacy phone link/device_id.
    fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    fireEvent.load(screen.getByTestId('ad-carousel-current'));
    fireEvent.click(screen.getByTestId('ad-slide-action'));
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://slide.example/campaign', '_blank', 'noopener,noreferrer');
    // No in-app navigation happened for the external slide.
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);

    fireEvent.click(screen.getByTestId('ad-slide-cta'));
    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('PHASE 4B (00024) — slide overriding to internal navigates in-app from both slide surfaces', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Mixed gallery',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: DEVICE.id }),
        adImage('slide2.jpg', {
          position: 1,
          deviceId: '',
          destinationType: 'internal',
          destination: { internal: { screen: 'showroom', params: { tab: 'offers' } } },
        }),
      ],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    fireEvent.load(screen.getByTestId('ad-carousel-current'));

    // Main-image tap → the slide's internal screen (symmetric target).
    fireEvent.click(screen.getByTestId('ad-slide-action'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('showroom');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: undefined });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('PHASE 4B (00024) — slide overriding to whatsapp hands off to the payload number (placement-only tracking)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Mixed gallery',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: DEVICE.id }),
        adImage('slide2.jpg', {
          position: 1,
          deviceId: '',
          destinationType: 'whatsapp',
          destination: { whatsapp: { number: '0556254007', message: 'عرض السلايد' } },
        }),
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    fireEvent.load(screen.getByTestId('ad-carousel-current'));
    fireEvent.click(screen.getByTestId('ad-slide-cta'));

    // The slide chat opens to the slide payload number with its preset message.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      `https://wa.me/213556254007?text=${encodeURIComponent('عرض السلايد')}`,
      '_blank',
      'noopener',
    );
    // Placement-only tracking for the whatsapp override (no device) — in order.
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home' });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home' });
    // The legacy WhatsApp provider send is NEVER used for a whatsapp override.
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    openSpy.mockRestore();
  });

  it('PHASE 4B (00024) — an invalid slide override keeps the slide NON-interactive (no dead target)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Mixed gallery',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: DEVICE.id }),
        adImage('slide2.jpg', {
          position: 1,
          deviceId: '',
          destinationType: 'external',
          destination: { external: { url: 'javascript:alert(1)' } },
        }),
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    fireEvent.load(screen.getByTestId('ad-carousel-current'));

    // The invalid external override yields a non-interactive slide: no main-image
    // target, no corner CTA — never a dead clickable target, never window.open.
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(screen.queryByTestId('ad-slide-cta')).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    openSpy.mockRestore();
  });

  it('PHASE 4B (00024) — whatsapp ad: a slide overriding to internal navigates in-app from the slide CTA', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '',
      alt: 'WhatsApp gallery',
      images: [
        adImage('slide1.jpg', { position: 0, isCover: true, deviceId: '' }),
        adImage('slide2.jpg', {
          position: 1,
          deviceId: '',
          destinationType: 'internal',
          destination: { internal: { screen: 'repair-home' } },
        }),
      ],
      destinationType: 'whatsapp',
      destination: { whatsapp: { number: '0556254007' } },
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // Ad-level whatsapp branch: multi-frame carousel owns the interaction.
    expect(screen.getByTestId('ad-carousel')).toBeTruthy();
    expect(screen.queryByTestId('ad-whatsapp-cta')).toBeNull();

    // Slide 2 carries its own internal destination → the slide CTA navigates
    // in-app to the slide's allowlisted screen (never the ad chat).
    fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    fireEvent.load(screen.getByTestId('ad-carousel-current'));
    fireEvent.click(screen.getByTestId('ad-slide-cta'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('repair-home');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('AdContactBanner (PHASE 4E — single-image destination dispatch, 00024)', () => {
  beforeEach(() => {
    mock.__setState(DISABLED);
    vi.clearAllMocks();
    MockIntersectionObserver.instances = [];
  });

  it('single-image + external override: the whole banner converts to the image URL (never the legacy phone link)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Single external',
      images: [
        adImage('cover.jpg', {
          position: 0,
          isCover: true,
          destinationType: 'external',
          destination: { external: { url: 'https://slide.example/campaign' } },
        }),
      ],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // The single image carries its OWN destination → it wins over the legacy
    // phone link and the ad-level phone target (strict separation).
    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('A');
    expect(banner.getAttribute('href')).toBe('https://slide.example/campaign');
    expect(banner.getAttribute('target')).toBe('_blank');
    expect(banner.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
    // No phone surfaces leak from the ad-level phone destination.
    expect(screen.queryByTestId('ad-contact-details')).toBeNull();
    expect(screen.queryByTestId('ad-contact-cta')).toBeNull();
  });

  it('single-image + whatsapp override: full-frame CTA hands off to the image payload (telemetry exactly once)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Single WhatsApp',
      images: [
        adImage('cover.jpg', {
          position: 0,
          isCover: true,
          destinationType: 'whatsapp',
          destination: { whatsapp: { number: '0556254007', message: 'عرض الصورة' } },
        }),
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();

    fireEvent.click(screen.getByTestId('ad-whatsapp-cta'));

    // The chat opens to the IMAGE payload number with its preset message.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      `https://wa.me/213556254007?text=${encodeURIComponent('عرض الصورة')}`,
      '_blank',
      'noopener',
    );
    // The override telemetry fires EXACTLY once (ad_click then handoff) — no
    // ad-level phone events leak through, the provider send is never used.
    expect(mockRecordIntent).toHaveBeenCalledTimes(2);
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home' });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    openSpy.mockRestore();
  });

  it('single-image + internal override: the banner navigates in-app to the image screen', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Single internal',
      images: [
        adImage('cover.jpg', {
          position: 0,
          isCover: true,
          destinationType: 'internal',
          destination: { internal: { screen: 'showroom', params: { tab: 'offers' } } },
        }),
      ],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();

    fireEvent.click(screen.getByTestId('ad-internal-cta'));

    // In-app navigation to the image's allowlisted screen with its params.
    expect(screen.getByTestId('probe-screen').textContent).toBe('showroom');
    expect(screen.getByTestId('probe-device').textContent).toBe('');
    // ad_click placement-only (target is not phone-details → no deviceId).
    expect(mockRecordIntent).toHaveBeenCalledTimes(1);
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: undefined });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('single-image + phone device: details open the image device; corner CTA hands off with deviceId', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '',
      alt: 'Single phone',
      images: [adImage('cover.jpg', { position: 0, isCover: true, deviceId: DEVICE.id })],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // The single image's device_id drives the banner — never an AdSpot, never
    // a dead anchor, and the details surface opens THAT device.
    const overlay = screen.getByTestId('ad-contact-details');
    fireEvent.click(overlay);
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
    expect(mockSend).not.toHaveBeenCalled();

    const cta = screen.getByTestId('ad-contact-cta');
    fireEvent.click(cta);
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: DEVICE.id });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home', deviceId: DEVICE.id });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message] = mockSend.mock.calls[0] as [string];
    expect(message).toContain('صورة الإعلان: https://cdn/cover.jpg');
  });

  it('single-image + NULL/NULL phone: inherits the ad-level destination (legacy single-image behavior preserved)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '#/phone-details?device=rec_abcdef12',
      alt: 'Contact for this phone',
      images: [adImage('banner.png', { position: 0, isCover: true })],
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // NULL/NULL on the single image → the ad-level phone destination drives:
    // details page + guarded WhatsApp handoff with the ad device.
    fireEvent.click(screen.getByTestId('ad-contact-details'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);

    fireEvent.click(screen.getByTestId('ad-contact-cta'));
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: DEVICE.id });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home', deviceId: DEVICE.id });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('single-image + NULL/NULL external ad: inherits the ad-level external URL', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/banner.png',
      link: '#/phone-details?device=legacy-ignored',
      alt: 'External ad',
      images: [adImage('banner.png', { position: 0, isCover: true })],
      destinationType: 'external',
      destination: { external: { url: 'https://go.example/campaign' } },
    });
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('A');
    expect(banner.getAttribute('href')).toBe('https://go.example/campaign');
    expect(banner.getAttribute('target')).toBe('_blank');
    expect(banner.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('single-image + invalid slide destination: NON-interactive (no anchor, no CTA, no navigation)', async () => {
    mock.__setState({
      enabled: true,
      image: 'https://cdn/cover.jpg',
      link: '',
      alt: 'Broken single',
      images: [
        adImage('cover.jpg', {
          position: 0,
          isCover: true,
          destinationType: 'external',
          destination: { external: { url: 'javascript:alert(1)' } },
        }),
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');
    openSpy.mockRestore();
  });

  it('PHASE 4E regression — multi-image ads keep the 4D container + per-slide dispatch (single-image logic NOT triggered)', async () => {
    mock.__setState(PHONE_GALLERY_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    // Multi-image: the carousel owns the interaction — no single-frame overlay.
    expect(screen.getByTestId('ad-carousel')).toBeTruthy();
    expect(screen.queryByTestId('ad-contact-details')).toBeNull();
    expect(screen.queryByTestId('ad-contact-cta')).toBeNull();

    fireEvent.load(screen.getByTestId('ad-carousel-current'));
    fireEvent.click(screen.getByTestId('ad-slide-action'));
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

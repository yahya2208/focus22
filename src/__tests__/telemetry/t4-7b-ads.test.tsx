/**
 * T4.7B — ads telemetry producer coverage (canonical AdContactBanner path).
 *
 * Covering the ACTIVE ad events that had no producer-proof test yet:
 *   - ad_impression — real IntersectionObserver path, ≥ 0.6 ratio ≥ 1 s,
 *                     deduplicated per session/placement
 *   - ad_contact    — the canonical corner "تواصل" CTA on a phone-linked ad
 *
 * ad_click is ALREADY covered by the adapter suite; here it is only asserted
 * as the co-fire alongside ad_contact (one per gesture, never duplicated).
 * Exactly the allowlist payloads from src/core/telemetry/events.ts are
 * asserted; no DB/RPC/registry changes are involved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import type { AdDestinationType, AdImage } from '../../services/ads-service';
import type { InventoryRecord } from '../../services/inventory-service';

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../core/telemetry', () => ({ track: mockTrack }));

interface MockAd {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
  images: AdImage[];
  destinationType?: AdDestinationType;
  destination?: Record<string, unknown>;
}

const adsMock = vi.hoisted(() => {
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
    getAd: adsMock.getAd,
    ensureAdsLoaded: adsMock.ensureAdsLoaded,
    subscribeAds: adsMock.subscribeAds,
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

const PHONE_AD: MockAd = {
  enabled: true,
  image: 'https://cdn/banner.png',
  link: '#/phone-details?device=rec_abcdef12',
  alt: 'Contact for this phone',
  images: [],
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

function eventsOf(name: string) {
  return (mockTrack.mock.calls as Array<[Record<string, unknown>]>).map((c) => c[0]).filter((e) => e.event === name);
}

const FORBIDDEN = ['phone', 'address', 'email', 'name', 'text', 'description', 'token', 'code', 'message', 'stack', 'url', 'content'];

function assertNoPii() {
  for (const evt of eventsOf('ad_impression').concat(eventsOf('ad_contact')).concat(eventsOf('ad_click'))) {
    for (const key of Object.keys((evt as { properties?: Record<string, unknown> }).properties ?? {})) {
      expect(FORBIDDEN).not.toContain(key.toLowerCase());
    }
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  MockIntersectionObserver.instances = [];
  mockTrack.mockClear();
});

describe('T4.7B — ad telemetry producers (AdContactBanner canonical path)', () => {
  beforeEach(() => {
    adsMock.__setState({ enabled: false, image: '', link: '', alt: '', images: [] });
    vi.clearAllMocks();
    MockIntersectionObserver.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  it('ad_impression fires EXACTLY once for a persistent ≥0.6/≥1s view, with position + dedupeKey, no PII', async () => {
    vi.useFakeTimers();
    adsMock.__setState(PHONE_AD);
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
      vi.advanceTimersByTime(1000);
    });

    expect(eventsOf('ad_impression')).toEqual([
      { event: 'ad_impression', entityType: 'ad', properties: { position: 'home' }, dedupeKey: 'ad_impression:home' },
    ]);

    // The impression is deduplicated for the session — a follow-up long view
    // or a repeated observer callback cannot double-report.
    act(() => {
      observer!.trigger({ isIntersecting: true, intersectionRatio: 0.9 });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(eventsOf('ad_impression')).toHaveLength(1);
    assertNoPii();
  });

  it('ad_impression does NOT fire when visibility drops below 0.6 before 1 s', async () => {
    vi.useFakeTimers();
    adsMock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    const observer = MockIntersectionObserver.instances[0];
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
      vi.advanceTimersByTime(2000);
    });
    expect(eventsOf('ad_impression')).toHaveLength(0);
  });

  it('ad_contact fires EXACTLY once per corner-CTA gesture, method=whatsapp, with a single co-fired ad_click', () => {
    adsMock.__setState(PHONE_AD);
    renderBanner('home');
    const cta = screen.getByTestId('ad-contact-cta');
    fireEvent.click(cta);

    expect(eventsOf('ad_contact')).toEqual([
      { event: 'ad_contact', entityType: 'ad', properties: { method: 'whatsapp' } },
    ]);
    // One click → exactly one co-fired adapter ad_click carrying the device.
    expect(eventsOf('ad_click')).toHaveLength(1);
    expect(eventsOf('ad_click')[0]).toMatchObject({ entityType: 'ad', properties: { position: 'home' } });
    // The WhatsApp handoff still happened through the real mediator.
    expect(mockSend).toHaveBeenCalledTimes(1);
    // Navigation contract: the corner CTA never navigates in-app.
    expect(screen.getByTestId('probe-screen').textContent).toBe('home');

    // A repeat gesture is a NEW event (per-click), never a duplicate in-flight.
    fireEvent.click(cta);
    expect(eventsOf('ad_contact')).toHaveLength(2);
    expect(eventsOf('ad_click')).toHaveLength(2);
    assertNoPii();
  });

  it('the main-image details surface opens the device page and NEVER fires ad_contact — the corner CTA is the single producer', async () => {
    adsMock.__setState(PHONE_AD);
    renderBanner('home');
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('ad-contact-details'));
    // Tapping the details overlay opens the device page (its canonical job).
    expect(eventsOf('ad_contact')).toHaveLength(0);
    expect(screen.getByTestId('probe-screen').textContent).toBe('phone-details');
    expect(screen.getByTestId('probe-device').textContent).toBe(DEVICE.id);
  });
});
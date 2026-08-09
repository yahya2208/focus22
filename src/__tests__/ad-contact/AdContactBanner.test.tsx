import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import { buildAdClickMessage } from '../../services/whatsapp-service';
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

vi.mock('../../services/whatsapp-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/whatsapp-service')>('../../services/whatsapp-service');
  return { ...actual };
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  MockIntersectionObserver.instances = [];
});

describe('AdContactBanner (M1/M2 — Ad Click → WhatsApp + view counting)', () => {
  beforeEach(() => {
    mock.__setState(DISABLED);
    vi.clearAllMocks();
    MockIntersectionObserver.instances = [];
  });

  it('renders nothing when the ad is disabled', async () => {
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('banner')).toBeNull();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('renders a normal ad anchor for a non-phone link (no WhatsApp overlay)', async () => {
    mock.__setState(EXTERNAL_AD);
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('A');
    expect(banner.getAttribute('href')).toBe('https://go.example');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('turns a phone-linked ad into a contact CTA: click records intent and sends the ad-click message via the canonical handoff', async () => {
    mock.__setState(PHONE_AD);
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    fireEvent.click(overlay);
    expect(mockRecordIntent).toHaveBeenCalledWith({
      kind: 'click',
      ctaType: 'ad_click',
      placement: 'home',
      deviceId: DEVICE.id,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(buildAdClickMessage(DEVICE));
  });

  it('tracking failure never blocks the WhatsApp handoff (fire-and-forget)', async () => {
    mock.__setState(PHONE_AD);
    mockRecordIntent.mockImplementation(() => {
      throw new Error('tracking down');
    });
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    expect(() => fireEvent.click(overlay)).not.toThrow();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(buildAdClickMessage(DEVICE));
  });

  it('keeps the ad banner visible underneath the contact overlay', async () => {
    mock.__setState(PHONE_AD);
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('records a view only after the banner stays ≥ 0.6 visible for ≥ 1 s', async () => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    mock.__setState(PHONE_AD);
    render(<AdContactBanner placement="home" />);
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
    render(<AdContactBanner placement="home" />);
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
});

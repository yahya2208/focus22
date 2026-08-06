import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, act } from '@testing-library/react';
import { AdSpot } from '../../components/ads/AdSpot';

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
    __listenerCount: () => listeners.size,
    getAd: vi.fn(() => state),
    ensureAdsLoaded: vi.fn(async () => {}),
    subscribeAds: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
});

vi.mock('../../services/ads-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/ads-service')>('../../services/ads-service');
  return {
    ...actual,
    getAd: mock.getAd,
    ensureAdsLoaded: mock.ensureAdsLoaded,
    subscribeAds: mock.subscribeAds,
  };
});

const DISABLED: MockAd = { enabled: false, image: '', link: '', alt: '' };
const ENABLED_LINK: MockAd = { enabled: true, image: 'https://cdn/banner.png', link: 'https://go.example', alt: 'Special offer' };
const ENABLED_NO_LINK: MockAd = { enabled: true, image: 'https://cdn/banner.png', link: '', alt: '' };

afterEach(() => {
  cleanup();
});

describe('AdSpot', () => {
  beforeEach(() => {
    mock.__setState(DISABLED);
    vi.clearAllMocks();
  });

  it('renders nothing when the placement ad is disabled or has no image', async () => {
    render(<AdSpot placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('banner')).toBeNull();
    expect(mock.ensureAdsLoaded).toHaveBeenCalled();
  });

  it('renders an anchor banner with the ad link when a link is configured', async () => {
    mock.__setState(ENABLED_LINK);
    render(<AdSpot placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('A');
    expect(banner.getAttribute('href')).toBe('https://go.example');
    expect(banner.getAttribute('target')).toBe('_blank');
    expect(banner.getAttribute('rel')).toBe('noopener noreferrer');
    expect(banner.getAttribute('aria-label')).toBe('Special offer');

    const image = within(banner).getByRole('img');
    expect(image.getAttribute('src')).toBe('https://cdn/banner.png');
    expect(image.getAttribute('alt')).toBe('Special offer');
  });

  it('renders a plain div banner when the ad has no link', async () => {
    mock.__setState(ENABLED_NO_LINK);
    render(<AdSpot placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('DIV');
    expect(banner.querySelector('a')).toBeNull();
  });

  it('falls back to the placement for the image alt when alt is empty', async () => {
    mock.__setState(ENABLED_NO_LINK);
    render(<AdSpot placement="results" />);
    await act(async () => {
      await Promise.resolve();
    });

    const banner = screen.getByRole('banner');
    expect(banner.getAttribute('aria-label')).toBe('results');
    expect(within(banner).getByRole('img').getAttribute('alt')).toBe('results');
  });

  it('updates live when a Realtime event notifies the subscription', async () => {
    const { unmount } = render(<AdSpot placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('banner')).toBeNull();

    await act(async () => {
      mock.__setState(ENABLED_LINK);
      mock.__emit();
    });

    expect(screen.getByRole('banner')).toBeTruthy();
    unmount();
  });

  it('subscribes on mount and unsubscribes on unmount', async () => {
    const { unmount } = render(<AdSpot placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mock.subscribeAds).toHaveBeenCalledTimes(1);
    expect(mock.__listenerCount()).toBe(1);

    unmount();
    expect(mock.__listenerCount()).toBe(0);
  });
});

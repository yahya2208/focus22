import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
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
    openPhoneAdWhatsApp: vi.fn(),
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

vi.mock('../../services/whatsapp-service', () => ({
  openPhoneAdWhatsApp: mock.openPhoneAdWhatsApp,
}));

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
});

describe('AdContactBanner (M1 — Ad Click → WhatsApp)', () => {
  beforeEach(() => {
    mock.__setState(DISABLED);
    vi.clearAllMocks();
  });

  it('renders nothing when the ad is disabled', async () => {
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('banner')).toBeNull();
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

  it('turns a phone-linked ad into a contact CTA: click opens WhatsApp to the owner', async () => {
    mock.__setState(PHONE_AD);
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });

    const overlay = screen.getByRole('button', { name: 'Contact for this phone' });
    fireEvent.click(overlay);
    expect(mock.openPhoneAdWhatsApp).toHaveBeenCalledTimes(1);
    expect(mock.openPhoneAdWhatsApp).toHaveBeenCalledWith(DEVICE);
  });

  it('keeps the ad banner visible underneath the contact overlay', async () => {
    mock.__setState(PHONE_AD);
    render(<AdContactBanner placement="home" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('banner')).toBeTruthy();
  });
});

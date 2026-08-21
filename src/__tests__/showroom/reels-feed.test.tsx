import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { ReelsFeed } from '../../components/showroom/phone-gallery/ReelsFeed';
import { useReelFeed } from '../../components/showroom/phone-gallery/useReelFeed';
import type { InventoryRecord } from '../../services/inventory-service';

vi.mock('../../services/inventory-central-service', () => ({
  centralListImages: vi.fn(),
}));

import { centralListImages } from '../../services/inventory-central-service';
const mockCentralListImages = vi.mocked(centralListImages);

function makeDevice(id: string, brand: string, model: string): InventoryRecord {
  return {
    id, modelId: id, brand, model, variant: '', ram: '', storage: '',
    condition: 'Used', quantity: 1, totalPurchased: 1, totalSold: 0,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    images: [], sellPrice: 45000, city: 'Algiers',
  };
}

const DEVICES = [
  makeDevice('a', 'Samsung', 'A56'),
  makeDevice('b', 'Apple', 'iPhone 13'),
  makeDevice('c', 'Xiaomi', 'Redmi 12'),
];

const RESOLVED_IMAGES = new Map<string, string[]>([
  ['a', ['https://img/a1.png', 'https://img/a2.png', 'https://img/a3.png']],
  ['b', ['https://img/b1.png', 'https://img/b2.png']],
  ['c', ['https://img/c1.png']],
]);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/* ─── useReelFeed hook tests (via wrapper) ─── */

function HookResult({ devices, resolvedImages, onResult }: {
  devices: readonly InventoryRecord[];
  resolvedImages?: Map<string, string[]>;
  onResult: (slides: ReturnType<typeof useReelFeed>) => void;
}) {
  const slides = useReelFeed(devices, resolvedImages);
  onResult(slides);
  return null;
}

describe('useReelFeed', () => {
  it('flattens all device images from resolvedImages map', () => {
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult
        devices={DEVICES}
        resolvedImages={RESOLVED_IMAGES}
        onResult={(s) => { captured = s; }}
      />,
    );
    expect(captured).toHaveLength(6);
    expect(captured[0]!.src).toBe('https://img/a1.png');
    expect(captured[3]!.src).toBe('https://img/b1.png');
    expect(captured[5]!.src).toBe('https://img/c1.png');
  });

  it('assigns sequential slideIndex across phone boundaries', () => {
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult
        devices={DEVICES}
        resolvedImages={RESOLVED_IMAGES}
        onResult={(s) => { captured = s; }}
      />,
    );
    expect(captured.map((s) => s.slideIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('preserves deviceId on each slide', () => {
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult
        devices={DEVICES}
        resolvedImages={RESOLVED_IMAGES}
        onResult={(s) => { captured = s; }}
      />,
    );
    expect(captured[0]!.deviceId).toBe('a');
    expect(captured[3]!.deviceId).toBe('b');
    expect(captured[5]!.deviceId).toBe('c');
  });

  it('returns empty when resolvedImages map is empty and device.images is empty', () => {
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult
        devices={DEVICES}
        resolvedImages={new Map()}
        onResult={(s) => { captured = s; }}
      />,
    );
    expect(captured).toHaveLength(0);
  });

  it('falls back to device.images when resolvedImages has no entry for device', () => {
    const withImages = [
      { ...makeDevice('a', 'Samsung', 'A56'), images: ['https://fallback/a1.png'] },
      makeDevice('b', 'Apple', 'iPhone 13'),
    ];
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult devices={withImages} onResult={(s) => { captured = s; }} />,
    );
    expect(captured).toHaveLength(1);
    expect(captured[0]!.src).toBe('https://fallback/a1.png');
  });

  it('prefers resolvedImages over device.images when both exist', () => {
    const withImages = [
      { ...makeDevice('a', 'Samsung', 'A56'), images: ['https://old/a1.png'] },
    ];
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult
        devices={withImages}
        resolvedImages={RESOLVED_IMAGES}
        onResult={(s) => { captured = s; }}
      />,
    );
    expect(captured[0]!.src).toBe('https://img/a1.png');
  });

  it('skips devices with no resolved images', () => {
    const partial = new Map<string, string[]>([['a', ['https://img/a1.png']]]);
    let captured: ReturnType<typeof useReelFeed> = [];
    render(
      <HookResult
        devices={DEVICES}
        resolvedImages={partial}
        onResult={(s) => { captured = s; }}
      />,
    );
    expect(captured).toHaveLength(1);
    expect(captured[0]!.deviceId).toBe('a');
  });
});

/* ─── ReelsFeed component tests ─── */

describe('ReelsFeed', () => {
  beforeEach(() => {
    mockCentralListImages.mockImplementation(async (id: string) => {
      return RESOLVED_IMAGES.get(id) ?? [];
    });
  });

  it('resolves images via centralListImages and renders slides', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-slide-0')).toBeTruthy();
    });
    expect(screen.getByTestId('reels-slide-5')).toBeTruthy();
    expect(mockCentralListImages).toHaveBeenCalledTimes(3);
  });

  it('scroll container uses VERTICAL scroll-snap (y mandatory)', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-feed-scroll')).toBeTruthy();
    });
    const scroll = screen.getByTestId('reels-feed-scroll');
    expect(scroll.style.overflowY).toBe('auto');
    expect(scroll.style.scrollSnapType).toBe('y mandatory');
    expect(scroll.style.height).toBe('100dvh');
    expect(scroll.style.flexDirection).toBe('column');
  });

  it('does NOT have horizontal scroll-snap', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-feed-scroll')).toBeTruthy();
    });
    const scroll = screen.getByTestId('reels-feed-scroll');
    expect(scroll.style.overflowX).not.toBe('auto');
  });

  it('renders 6 slides for 3 devices (3+2+1 images)', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-slide-5')).toBeTruthy();
    });
    expect(screen.queryByTestId('reels-slide-6')).toBeNull();
  });

  it('each slide carries data-device-id matching its device', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-slide-0')).toBeTruthy();
    });
    expect(screen.getByTestId('reels-slide-0').getAttribute('data-device-id')).toBe('a');
    expect(screen.getByTestId('reels-slide-3').getAttribute('data-device-id')).toBe('b');
    expect(screen.getByTestId('reels-slide-5').getAttribute('data-device-id')).toBe('c');
  });

  it('slide counter shows 1/6 after loading', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-feed-counter').textContent).toBe('1 / 6');
    });
  });

  it('tapping a slide calls onSelectDevice with deviceId', async () => {
    const onSelect = vi.fn();
    render(<ReelsFeed devices={DEVICES} onSelectDevice={onSelect} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-slide-3')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('reels-slide-3'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-feed-close')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('reels-feed-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', async () => {
    const onClose = vi.fn();
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-feed-scroll')).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('no autoplay — counter stays at 1/6 after waiting', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-feed-counter').textContent).toBe('1 / 6');
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByTestId('reels-feed-counter').textContent).toBe('1 / 6');
  });

  it('empty state when no devices', async () => {
    render(<ReelsFeed devices={[]} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('No images available')).toBeTruthy();
    });
  });

  it('phone info overlay shows brand, model, and price', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-slide-0')).toBeTruthy();
    });
    const slide0 = screen.getByTestId('reels-slide-0');
    expect(slide0.textContent).toContain('Samsung');
    expect(slide0.textContent).toContain('A56');
    expect(slide0.textContent).toContain('45,000');
  });

  it('per-image counter shows image index when phone has multiple images', async () => {
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('reels-slide-0')).toBeTruthy();
    });
    const slide0 = screen.getByTestId('reels-slide-0');
    expect(slide0.textContent).toContain('1/3');
  });

  it('shows loading state while resolving images', async () => {
    mockCentralListImages.mockReturnValue(new Promise(() => {}));
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Loading images…')).toBeTruthy();
    });
    expect(screen.queryByTestId('reels-slide-0')).toBeNull();
  });

  it('shows empty state when all devices have no images', async () => {
    mockCentralListImages.mockResolvedValue([]);
    render(<ReelsFeed devices={DEVICES} onSelectDevice={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('No images available')).toBeTruthy();
    });
  });
});

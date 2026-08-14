import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { AdBanner } from '../../components/ads/AdBanner';
import type { AdImage } from '../../services/ads-service';

const onStateChange = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function adImage(path: string, overrides: Partial<AdImage> = {}): AdImage {
  return { id: `id-${path}`, path, url: `https://cdn/${path}`, position: 0, isCover: false, deviceId: '', ...overrides };
}

function renderBanner(image = 'https://cdn/banner.png', images?: AdImage[]) {
  return render(
    <AdBanner image={image} images={images} alt="Special offer" onStateChange={onStateChange} />,
  );
}

describe('AdBanner (V-1 — loading / loaded / failed)', () => {
  it('starts in an intentional loading state with a stable frame and NO shine', () => {
    const { container } = renderBanner();

    const frame = screen.getByTestId('adspot-frame');
    expect(frame.getAttribute('data-status')).toBe('loading');
    expect(frame.className).toContain('adspot-frame');
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Special offer');
    // image hidden while loading, no shine overlay, no broken-image icon
    expect(screen.getByRole('img').style.opacity).toBe('0');
    expect(container.querySelector('[style*="adspot-shine"]')).toBeNull();
    expect(container.textContent).not.toMatch(/broken/i);
  });

  it('renders the image normally after a successful load with the adaptive ratio — fully static (no auto-motion)', () => {
    const { container } = renderBanner();

    const img = screen.getByRole('img');
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1600 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 400 });
    act(() => {
      fireEvent.load(img);
    });

    expect(screen.getByTestId('adspot-frame').getAttribute('data-status')).toBe('loaded');
    expect(img.style.opacity).toBe('1');
    expect(onStateChange).toHaveBeenCalledWith('loaded');
    // BATCH 2 — the loaded ad is static: no breathing, no shine sweep.
    expect(img.style.animation).toBe('');
    expect(container.querySelector('[style*="adspot-shine"]')).toBeNull();
    expect(container.querySelector('[style*="adspot-breathe"]')).toBeNull();
  });

  it('a portrait image fills the fixed-height banner frame with a TOP-focused crop', () => {
    renderBanner();
    const frame = screen.getByTestId('adspot-frame');
    const img = screen.getByRole('img');

    // Portrait image (2:1 height) — the frame must NOT become square/tall and
    // the image must stretch to fill it, keeping the top info visible.
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 1600 });
    act(() => {
      fireEvent.load(img);
    });

    expect(frame.style.height).toBe('clamp(220px, 58vw, 360px)');
    expect(frame.style.aspectRatio).toBe('');
    expect(img.style.objectFit).toBe('cover');
    expect(img.style.objectPosition).toBe('center top');
    expect(img.style.opacity).toBe('1');
  });

  it('collapses cleanly on a broken image: no frame, no shine, no throw, no retry loop', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderBanner('https://cdn/missing.png');

    const img = screen.getByRole('img');
    expect(() => {
      act(() => {
        fireEvent.error(img);
      });
    }).not.toThrow();

    expect(screen.queryByTestId('adspot-frame')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[style*="adspot-shine"]')).toBeNull();
    expect(onStateChange).toHaveBeenCalledWith('failed');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('collapses the failed banner so no further error can fire (no retry loop)', () => {
    renderBanner();
    const img = screen.getByRole('img');
    act(() => {
      fireEvent.error(img);
    });
    expect(onStateChange).toHaveBeenCalledWith('failed');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByTestId('adspot-frame')).toBeNull();
  });

  it('CACHED — a disk-cached (already-complete) image shows immediately, never stuck at loading/opacity:0', () => {
    // Simulate a browser disk-cache hit: the <img> is already complete with real
    // dimensions when React mounts it, so the load event can fire before React
    // attaches onLoad. The mount completion guard must reveal the image.
    const proto = HTMLImageElement.prototype;
    const originalComplete = Object.getOwnPropertyDescriptor(proto, 'complete');
    const originalNW = Object.getOwnPropertyDescriptor(proto, 'naturalWidth');
    const originalNH = Object.getOwnPropertyDescriptor(proto, 'naturalHeight');

    Object.defineProperty(proto, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(proto, 'naturalWidth', { configurable: true, get: () => 1600 });
    Object.defineProperty(proto, 'naturalHeight', { configurable: true, get: () => 400 });

    try {
      renderBanner();

      const frame = screen.getByTestId('adspot-frame');
      expect(frame.getAttribute('data-status')).toBe('loaded');
      expect(screen.getByRole('img').style.opacity).toBe('1');
      expect(onStateChange).toHaveBeenCalledWith('loaded');
    } finally {
      if (originalComplete) Object.defineProperty(proto, 'complete', originalComplete);
      else delete (proto as { complete?: boolean }).complete;
      if (originalNW) Object.defineProperty(proto, 'naturalWidth', originalNW);
      else delete (proto as { naturalWidth?: number }).naturalWidth;
      if (originalNH) Object.defineProperty(proto, 'naturalHeight', originalNH);
      else delete (proto as { naturalHeight?: number }).naturalHeight;
    }
  });
});

describe('AdBanner (D-GATE-ADS — multi-image gallery renders the carousel)', () => {
  it('keeps the single-frame path when one image (or none) is provided', () => {
    renderBanner('https://cdn/banner.png', [adImage('banner.png')]);
    expect(screen.queryByTestId('ad-carousel')).toBeNull();
    expect(screen.getByTestId('adspot-frame')).toBeTruthy();

    cleanup();
    renderBanner('https://cdn/banner.png', []);
    expect(screen.queryByTestId('ad-carousel')).toBeNull();
    expect(screen.getByTestId('adspot-frame')).toBeTruthy();
  });

  it('starts on the cover image and navigates with the arrows', () => {
    const images = [
      adImage('a.jpg', { position: 0 }),
      adImage('b.jpg', { position: 1, isCover: true }),
      adImage('c.jpg', { position: 2 }),
    ];
    renderBanner('https://cdn/b.jpg', images);

    expect(screen.getByTestId('ad-carousel')).toBeTruthy();
    expect(screen.getByTestId('ad-carousel-current').getAttribute('src')).toBe('https://cdn/b.jpg');

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-next'));
    });
    expect(screen.getByTestId('ad-carousel-current').getAttribute('src')).toBe('https://cdn/c.jpg');

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-prev'));
    });
    expect(screen.getByTestId('ad-carousel-current').getAttribute('src')).toBe('https://cdn/b.jpg');
  });

  it('renders a thumbnail per image and jumps to the selected slide', () => {
    const images = [adImage('a.jpg', { position: 0, isCover: true }), adImage('c.jpg', { position: 1 })];
    renderBanner('https://cdn/a.jpg', images);

    expect(screen.getByTestId('ad-carousel-thumb-0')).toBeTruthy();
    expect(screen.getByTestId('ad-carousel-thumb-1')).toBeTruthy();
    expect(screen.getByTestId('ad-carousel-thumb-0').getAttribute('aria-current')).toBe('true');

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    });
    expect(screen.getByTestId('ad-carousel-current').getAttribute('src')).toBe('https://cdn/c.jpg');
    expect(screen.getByTestId('ad-carousel-thumb-1').getAttribute('aria-current')).toBe('true');
  });

  it('reports loaded once the current slide loads (opacity 1, adaptive frame)', () => {
    const images = [adImage('a.jpg', { position: 0, isCover: true }), adImage('b.jpg', { position: 1 })];
    renderBanner('https://cdn/a.jpg', images);

    const img = screen.getByTestId('ad-carousel-current');
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1600 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 400 });
    act(() => {
      fireEvent.load(img);
    });

    expect(onStateChange).toHaveBeenCalledWith('loaded');
    expect(img.style.opacity).toBe('1');
    expect(screen.getByTestId('ad-carousel-frame').getAttribute('data-status')).toBe('loaded');
  });

  it('collapses the whole banner when the current slide fails to load (never a broken frame)', () => {
    const images = [adImage('a.jpg', { position: 0, isCover: true }), adImage('broken.jpg', { position: 1 })];
    renderBanner('https://cdn/a.jpg', images);

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-next'));
    });
    const broken = screen.getByTestId('ad-carousel-current');
    act(() => {
      fireEvent.error(broken);
    });

    expect(screen.queryByTestId('ad-carousel')).toBeNull();
    expect(onStateChange).toHaveBeenCalledWith('failed');
  });
});

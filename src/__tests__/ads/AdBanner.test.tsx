import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { AdBanner } from '../../components/ads/AdBanner';

const onStateChange = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBanner(image = 'https://cdn/banner.png') {
  return render(<AdBanner image={image} alt="Special offer" onStateChange={onStateChange} />);
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

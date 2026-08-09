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

  it('renders the image normally after a successful load with the adaptive ratio', () => {
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
    // shine sweep appears only after load
    expect(container.textContent).not.toBeNull();
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
});

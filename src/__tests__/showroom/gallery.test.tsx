import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import { ProductImageGallery, GALLERY_AUTOPLAY_MS } from '../../components/showroom/ProductImageGallery';
import { ThemeProvider } from '../../design-system/use-theme';

const IMAGES = ['img-1.png', 'img-2.png', 'img-3.png'];

function renderGallery(images: readonly string[] = IMAGES, props?: { rtl?: boolean }) {
  const gallery = (
    <ThemeProvider>
      <ProductImageGallery images={images} name="Apple iPhone 13" />
    </ThemeProvider>
  );
  if (props?.rtl) {
    return render(<div dir="rtl">{gallery}</div>);
  }
  return render(gallery);
}

function main() {
  return screen.getByRole('region', { name: 'product gallery' });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Phase 3B §3.2 — ProductImageGallery (controlled-fix FIX-01)', () => {
  it('renders the counter 1/N and one thumbnail per image', () => {
    renderGallery();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /thumbnail/i })).toHaveLength(3);
  });

  it('keyboard ArrowRight/Left steps the index (LTR)', () => {
    renderGallery();
    fireEvent.keyDown(main(), { key: 'ArrowRight' });
    expect(screen.getByText('2/3')).toBeTruthy();

    fireEvent.keyDown(main(), { key: 'ArrowLeft' });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('wraps circularly at the boundaries (backward: 1 → 3)', () => {
    renderGallery();
    fireEvent.keyDown(main(), { key: 'ArrowLeft' }); // at 0 → wraps to last
    expect(screen.getByText('3/3')).toBeTruthy();
  });

  it('wraps circularly at the boundaries (forward: 3 → 1)', () => {
    renderGallery();
    fireEvent.keyDown(main(), { key: 'ArrowRight' });
    fireEvent.keyDown(main(), { key: 'ArrowRight' });
    expect(screen.getByText('3/3')).toBeTruthy();
    fireEvent.keyDown(main(), { key: 'ArrowRight' }); // wraps to 1
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('touch swipe left advances, swipe right goes back (LTR)', () => {
    renderGallery();
    fireEvent.touchStart(main(), { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 60 }] });
    expect(screen.getByText('2/3')).toBeTruthy();

    fireEvent.touchStart(main(), { touches: [{ clientX: 60 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 220 }] });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('thumbnail click jumps directly and marks current', () => {
    renderGallery();
    const thumbs = screen.getAllByRole('button', { name: /thumbnail/i });
    fireEvent.click(thumbs[2]!);
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(thumbs[2]!.getAttribute('aria-current')).toBe('true');
  });

  it('tap on main image opens fullscreen dialog; tap closes it', () => {
    renderGallery();
    fireEvent.click(main());
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not open fullscreen after a drag swipe', () => {
    renderGallery();
    fireEvent.touchStart(main(), { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 60 }] });
    expect(screen.getByText('2/3')).toBeTruthy();
    fireEvent.click(main());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('auto-plays forward every 3 seconds', () => {
    vi.useFakeTimers();
    renderGallery();
    expect(screen.getByText('1/3')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS); });
    expect(screen.getByText('2/3')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS); });
    expect(screen.getByText('3/3')).toBeTruthy();
  });

  it('auto-play wraps circularly (3 → 1)', () => {
    vi.useFakeTimers();
    renderGallery();
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS * 3); });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('does not auto-play for a single image', () => {
    vi.useFakeTimers();
    renderGallery(['only.png']);
    expect(screen.queryByText('1/1')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS * 2); });
    expect(screen.getByText('1/1')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /thumbnail/i })).toHaveLength(0);
  });

  it('pauses auto-play while touching and resumes after release', () => {
    vi.useFakeTimers();
    renderGallery();
    fireEvent.touchStart(main(), { touches: [{ clientX: 100 }] });
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS * 3); });
    expect(screen.getByText('1/3')).toBeTruthy(); // paused — no advance
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 120 }] }); // small dx, no nav
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS); });
    expect(screen.getByText('2/3')).toBeTruthy(); // resumed
  });

  it('resets the auto-play window after a manual keyboard step', () => {
    vi.useFakeTimers();
    renderGallery();
    fireEvent.keyDown(main(), { key: 'ArrowLeft' }); // user interaction
    act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS - 1); });
    expect(screen.getByText('3/3')).toBeTruthy(); // not yet advanced
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.getByText('1/3')).toBeTruthy(); // advanced after full window
  });

  it('cleans up timers on unmount', () => {
    vi.useFakeTimers();
    const view = renderGallery();
    view.unmount();
    expect(() => act(() => { vi.advanceTimersByTime(GALLERY_AUTOPLAY_MS * 5); })).not.toThrow();
  });

  it('shows placeholder for zero images and no counter/thumbnails', () => {
    renderGallery([]);
    expect(screen.getByRole('img', { name: 'Apple iPhone 13' })).toBeTruthy();
    expect(screen.queryByText(/\/0/)).toBeNull();
    expect(screen.queryAllByRole('button', { name: /thumbnail/i })).toHaveLength(0);
  });

  it('shows a plain image (no peek arrows) for a single image', () => {
    renderGallery(['only.png']);
    expect(screen.queryByTestId('gallery-prev-arrow')).toBeNull();
    expect(screen.queryByTestId('gallery-next-arrow')).toBeNull();
    expect(screen.getByText('1/1')).toBeTruthy();
  });

  it('side images are dimmed + blurred + scaled while center stays sharp', () => {
    renderGallery();
    const center = screen.getByTestId('gallery-center');
    const prev = screen.getByTestId('gallery-prev');
    const next = screen.getByTestId('gallery-next');
    expect(center.style.opacity).toBe('1');
    expect(center.style.filter).toContain('blur(0px)');
    expect(prev.style.opacity).not.toBe('1');
    expect(prev.style.filter).toContain('blur');
    expect(next.style.opacity).not.toBe('1');
    expect(next.style.filter).toContain('blur');
    const prevScale = prev.style.transform.match(/scale\((\d+\.?\d*)\)/)?.[1];
    const nextScale = next.style.transform.match(/scale\((\d+\.?\d*)\)/)?.[1];
    expect(prevScale).toBeDefined();
    expect(Number(prevScale)).toBeLessThan(1);
    expect(Number(nextScale)).toBeLessThan(1);
  });

  it('RTL: ArrowLeft goes forward (1 → 2) and ArrowRight goes back (2 → 1)', () => {
    renderGallery(IMAGES, { rtl: true });
    fireEvent.keyDown(main(), { key: 'ArrowLeft' });
    expect(screen.getByText('2/3')).toBeTruthy();
    fireEvent.keyDown(main(), { key: 'ArrowRight' });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('RTL: swipe right advances (forward) and swipe left goes back', () => {
    renderGallery(IMAGES, { rtl: true });
    fireEvent.touchStart(main(), { touches: [{ clientX: 60 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 220 }] }); // dx>0 → forward in RTL
    expect(screen.getByText('2/3')).toBeTruthy();
    fireEvent.touchStart(main(), { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 60 }] }); // dx<0 → back in RTL
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('RTL: side previews remain rendered at the logical edges', () => {
    renderGallery(IMAGES, { rtl: true });
    expect(screen.getByTestId('gallery-prev')).toBeTruthy();
    expect(screen.getByTestId('gallery-next')).toBeTruthy();
  });
});

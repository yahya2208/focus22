import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { AdImageCarousel } from '../../components/ads/AdImageCarousel';
import type { AdImage } from '../../services/ads-service';

function adImage(path: string, overrides: Partial<AdImage> = {}): AdImage {
  return { id: `id-${path}`, path, url: `https://cdn/${path}`, position: 0, isCover: false, deviceId: '', ...overrides };
}

function renderCarousel(images: AdImage[], opts: { onSlideAction?: (image: AdImage) => void } = {}) {
  return render(<AdImageCarousel images={images} alt="Gallery offer" onSlideAction={opts.onSlideAction} />);
}

function currentSrc(): string | null {
  return screen.getByTestId('ad-carousel-current').getAttribute('src');
}

/** Simulates the current slide's image finishing load so slide actions unlock. */
function loadCurrent() {
  const img = screen.getByTestId('ad-carousel-current');
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1600 });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 400 });
  act(() => {
    fireEvent.load(img);
  });
}

type TouchPoint = { clientX: number; clientY: number };

function swipe(frame: HTMLElement, start: TouchPoint, end: TouchPoint) {
  act(() => {
    fireEvent.touchStart(frame, { touches: [start] });
    fireEvent.touchEnd(frame, { changedTouches: [end] });
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AdImageCarousel — autoplay', () => {
  it('advances to the next slide after ~2 s and loops last → first', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('a.jpg'), adImage('b.jpg'), adImage('c.jpg')]);
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/c.jpg');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
  });

  it('shows at least 5 distinct images within the first 10 seconds', () => {
    vi.useFakeTimers();
    renderCarousel([
      adImage('a.jpg'),
      adImage('b.jpg'),
      adImage('c.jpg'),
      adImage('d.jpg'),
      adImage('e.jpg'),
      adImage('f.jpg'),
    ]);
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/c.jpg');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/d.jpg');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/e.jpg');
  });

  it('never auto-advances for a single image and renders no arrows/thumbs', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('a.jpg')]);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
    expect(screen.queryByTestId('ad-carousel-prev')).toBeNull();
    expect(screen.queryByTestId('ad-carousel-next')).toBeNull();
    expect(screen.queryByTestId('ad-carousel-thumb-0')).toBeNull();
  });

  it('pauses while hovered and resumes after mouse leave', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('a.jpg'), adImage('b.jpg')]);
    const carousel = screen.getByTestId('ad-carousel');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    act(() => {
      fireEvent.mouseEnter(carousel);
    });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    act(() => {
      fireEvent.mouseLeave(carousel);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
  });

  it('pauses after a manual interaction then resumes after a full interval', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('a.jpg'), adImage('b.jpg'), adImage('c.jpg')]);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    // Manual interaction restarts the countdown — no advance within 1.5 s.
    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-next'));
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    // Resume: the next advance fires ~2 s after the interaction.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(currentSrc()).toBe('https://cdn/c.jpg');
  });

  it('prev and next both reset the autoplay countdown', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('a.jpg'), adImage('b.jpg'), adImage('c.jpg')]);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-prev'));
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-next'));
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(currentSrc()).toBe('https://cdn/c.jpg');
  });

  it('honors prefers-reduced-motion by disabling autoplay entirely', () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      renderCarousel([adImage('a.jpg'), adImage('b.jpg')]);
      act(() => {
        vi.advanceTimersByTime(20000);
      });
      expect(currentSrc()).toBe('https://cdn/a.jpg');
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('AdImageCarousel — swipe / touch', () => {
  it('swipe left goes next and swipe right goes previous', () => {
    renderCarousel([adImage('a.jpg'), adImage('b.jpg'), adImage('c.jpg')]);
    const frame = screen.getByTestId('ad-carousel-frame');
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    swipe(frame, { clientX: 220, clientY: 120 }, { clientX: 40, clientY: 120 });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    swipe(frame, { clientX: 40, clientY: 120 }, { clientX: 200, clientY: 120 });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
  });

  it('ignores a very short swipe (tap-like)', () => {
    renderCarousel([adImage('a.jpg'), adImage('b.jpg')]);
    const frame = screen.getByTestId('ad-carousel-frame');

    swipe(frame, { clientX: 120, clientY: 100 }, { clientX: 140, clientY: 100 });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
  });

  it('ignores a mostly-vertical drag so page scrolling still works', () => {
    renderCarousel([adImage('a.jpg'), adImage('b.jpg')]);
    const frame = screen.getByTestId('ad-carousel-frame');

    swipe(frame, { clientX: 200, clientY: 100 }, { clientX: 100, clientY: 500 });
    expect(currentSrc()).toBe('https://cdn/a.jpg');
  });

  it('does not fire the slide action for a swipe gesture', () => {
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: 'dev-b' }),
      ],
      { onSlideAction },
    );
    loadCurrent();
    const frame = screen.getByTestId('ad-carousel-frame');

    swipe(frame, { clientX: 220, clientY: 120 }, { clientX: 40, clientY: 120 });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    expect(onSlideAction).not.toHaveBeenCalled();
  });

  it('a tap (no swipe) on the slide surface hands off via the corner CTA without changing the slide', () => {
    const onSlideAction = vi.fn();
    renderCarousel([adImage('a.jpg', { deviceId: 'dev-a' }), adImage('b.jpg')], { onSlideAction });
    loadCurrent();

    const frame = screen.getByTestId('ad-carousel-frame');
    act(() => {
      fireEvent.touchStart(frame, { touches: [{ clientX: 100, clientY: 100 }] });
      fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    });
    expect(currentSrc()).toBe('https://cdn/a.jpg');

    // The full-frame surface only ever exists for DETAILS; with only a CTA
    // handler the WhatsApp handoff lives on the corner button alone.
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-cta'));
    });
    expect(onSlideAction).toHaveBeenCalledTimes(1);
    expect(onSlideAction).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'dev-a' }));
  });

  it('frame disables horizontal page panning via touch-action', () => {
    renderCarousel([adImage('a.jpg'), adImage('b.jpg')]);
    const frame = screen.getByTestId('ad-carousel-frame');
    expect(frame.style.touchAction).toBe('pan-y');
  });
});

describe('AdImageCarousel — per-slide device follows the active slide', () => {
  it('CTA uses the active slide device + image after autoplay', () => {
    vi.useFakeTimers();
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: 'dev-b' }),
      ],
      { onSlideAction },
    );
    loadCurrent();

    // Slide A is active → its device + image.
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-cta'));
    });
    expect(onSlideAction).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: 'dev-a', url: 'https://cdn/a.jpg' }));

    // Autoplay advances to slide B → its device + image.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    loadCurrent();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-cta'));
    });
    expect(onSlideAction).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: 'dev-b', url: 'https://cdn/b.jpg' }));
  });

  it('CTA uses the active slide device + image after a swipe', () => {
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: 'dev-b' }),
      ],
      { onSlideAction },
    );
    loadCurrent();
    const frame = screen.getByTestId('ad-carousel-frame');

    swipe(frame, { clientX: 220, clientY: 120 }, { clientX: 40, clientY: 120 });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    loadCurrent();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-cta'));
    });
    expect(onSlideAction).toHaveBeenCalledTimes(1);
    expect(onSlideAction).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'dev-b', url: 'https://cdn/b.jpg' }));
  });

  it('a slide without a device stays non-interactive even after autoplay', () => {
    vi.useFakeTimers();
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: '' }),
      ],
      { onSlideAction },
    );
    loadCurrent();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    loadCurrent();
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(onSlideAction).not.toHaveBeenCalled();
  });
});

describe('AdImageCarousel — main image opens device details (FOCUS-AD-DETAILS)', () => {
  it('main-image tap opens details with the active slide device (never the handoff)', () => {
    const onSlideAction = vi.fn();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg', { deviceId: 'dev-a' }), adImage('b.jpg', { deviceId: 'dev-b' })]}
        alt="Gallery offer"
        onSlideAction={onSlideAction}
        onSlideDetails={onSlideDetails}
      />,
    );
    loadCurrent();
    const overlay = screen.getByRole('button', { name: 'Gallery offer — عرض التفاصيل' });
    act(() => {
      fireEvent.click(overlay);
    });
    expect(onSlideDetails).toHaveBeenCalledTimes(1);
    expect(onSlideDetails).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'dev-a', url: 'https://cdn/a.jpg' }));
    expect(onSlideAction).not.toHaveBeenCalled();
  });

  it('corner CTA keeps the WhatsApp handoff reachable when details is the primary target', () => {
    const onSlideAction = vi.fn();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg', { deviceId: 'dev-a' }), adImage('b.jpg')]}
        alt="Gallery offer"
        onSlideAction={onSlideAction}
        onSlideDetails={onSlideDetails}
      />,
    );
    loadCurrent();

    const cta = screen.getByTestId('ad-slide-cta');
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('aria-label')).toBe('Gallery offer — فتح المحادثة');
    act(() => {
      fireEvent.click(cta);
    });
    expect(onSlideAction).toHaveBeenCalledTimes(1);
    expect(onSlideAction).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'dev-a' }));
    expect(onSlideDetails).not.toHaveBeenCalled();
  });

  it('details follows the active slide after autoplay', () => {
    vi.useFakeTimers();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg', { deviceId: 'dev-a' }), adImage('b.jpg', { deviceId: 'dev-b' })]}
        alt="Gallery offer"
        onSlideAction={vi.fn()}
        onSlideDetails={onSlideDetails}
      />,
    );
    loadCurrent();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    loadCurrent();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-action'));
    });
    expect(onSlideDetails).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: 'dev-b', url: 'https://cdn/b.jpg' }));
  });

  it('a slide without a device stays browse-only even when both handlers are provided', () => {
    const onSlideAction = vi.fn();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg', { deviceId: 'dev-a' }), adImage('b.jpg')]}
        alt="Gallery offer"
        onSlideAction={onSlideAction}
        onSlideDetails={onSlideDetails}
      />,
    );
    loadCurrent();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-next'));
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    loadCurrent();
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(screen.queryByTestId('ad-slide-cta')).toBeNull();
  });

  it('a slide WITHOUT a device_id becomes actionable through parent predicates (ad-level fallback)', () => {
    const onSlideAction = vi.fn();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg'), adImage('b.jpg', { deviceId: 'dev-b' })]}
        alt="Gallery offer"
        onSlideAction={onSlideAction}
        onSlideDetails={onSlideDetails}
        canSlideAction={(image) => Boolean(image.deviceId) || image.url.includes('a.jpg')}
        canSlideDetails={(image) => Boolean(image.deviceId) || image.url.includes('a.jpg')}
      />,
    );
    loadCurrent();

    // Slide A has no device_id but the parent says it is actionable via the
    // ad-level device — the main image opens details (NOT the handoff).
    expect(screen.getByTestId('ad-slide-action')).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-action'));
    });
    expect(onSlideDetails).toHaveBeenCalledTimes(1);
    expect(onSlideDetails).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://cdn/a.jpg' }));
    expect(onSlideAction).not.toHaveBeenCalled();

    // The corner CTA keeps the WhatsApp handoff reachable for the same slide.
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-cta'));
    });
    expect(onSlideAction).toHaveBeenCalledTimes(1);
  });

  it('defaults stay safe: no device_id and no predicates → browse-only, no overlay, no CTA', () => {
    const onSlideAction = vi.fn();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg'), adImage('b.jpg', { deviceId: 'dev-b' })]}
        alt="Gallery offer"
        onSlideAction={onSlideAction}
        onSlideDetails={onSlideDetails}
      />,
    );
    loadCurrent();
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(screen.queryByTestId('ad-slide-cta')).toBeNull();
    expect(onSlideAction).not.toHaveBeenCalled();
    expect(onSlideDetails).not.toHaveBeenCalled();
  });

  it('the full-frame overlay NEVER converts — it exists only as the details surface', () => {
    // Even when the parent supplies BOTH handlers, the full-frame surface is
    // always the details action; the WhatsApp handoff lives exclusively on the
    // corner CTA.
    const onSlideAction = vi.fn();
    const onSlideDetails = vi.fn();
    render(
      <AdImageCarousel
        images={[adImage('a.jpg', { deviceId: 'dev-a' })]}
        alt="Gallery offer"
        onSlideAction={onSlideAction}
        onSlideDetails={onSlideDetails}
      />,
    );
    loadCurrent();

    const overlays = screen.getAllByTestId('ad-slide-action');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]!.getAttribute('aria-label')).toBe('Gallery offer — عرض التفاصيل');
    expect(screen.getByTestId('ad-slide-cta').getAttribute('aria-label')).toBe('Gallery offer — فتح المحادثة');
  });
});

describe('AdImageCarousel — preload window', () => {
  it('keeps the current slide + immediate neighbors eager and the rest lazy', () => {
    renderCarousel([
      adImage('a.jpg'),
      adImage('b.jpg'),
      adImage('c.jpg'),
      adImage('d.jpg'),
      adImage('e.jpg'),
    ]);
    // Window at slide 0: current (0), next (1), prev (4) are eager.
    expect(screen.getByTestId('ad-carousel-current').getAttribute('loading')).toBe('eager');
    expect(screen.getByTestId('ad-carousel-slide-1').getAttribute('loading')).toBe('eager');
    expect(screen.getByTestId('ad-carousel-slide-4').getAttribute('loading')).toBe('eager');
    // Slides 2 and 3 are outside the window → lazy, no parallel download.
    expect(screen.getByTestId('ad-carousel-slide-2').getAttribute('loading')).toBe('lazy');
    expect(screen.getByTestId('ad-carousel-slide-3').getAttribute('loading')).toBe('lazy');
  });

  it('shifts the eager window as autoplay advances so the next slide is ready', () => {
    vi.useFakeTimers();
    renderCarousel([
      adImage('a.jpg'),
      adImage('b.jpg'),
      adImage('c.jpg'),
      adImage('d.jpg'),
      adImage('e.jpg'),
    ]);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Now on slide 1: eager set = {1 (current), 2 (next), 0 (prev)}.
    expect(screen.getByTestId('ad-carousel-current').getAttribute('loading')).toBe('eager');
    expect(screen.getByTestId('ad-carousel-slide-2').getAttribute('loading')).toBe('eager');
    expect(screen.getByTestId('ad-carousel-slide-0').getAttribute('loading')).toBe('eager');
    expect(screen.getByTestId('ad-carousel-slide-3').getAttribute('loading')).toBe('lazy');
    expect(screen.getByTestId('ad-carousel-slide-4').getAttribute('loading')).toBe('lazy');
  });

  it('preloads the only slide eagerly for a single image (no extra behavior)', () => {
    renderCarousel([adImage('a.jpg')]);
    expect(screen.getByTestId('ad-carousel-current').getAttribute('loading')).toBe('eager');
  });

  it('uses a short crossfade so slides do not linger overlapped for a 2 s interval', () => {
    renderCarousel([adImage('a.jpg'), adImage('b.jpg')]);
    const slide = screen.getByTestId('ad-carousel-slide-1');
    const transition = slide.style.transition;
    expect(transition).toBe('opacity 0.3s ease');
  });
});

describe('AdImageCarousel — ~70% of the ad visible over a blurred backdrop', () => {
  it('renders a portrait slide so ~70% of its height is visible (no distortion, no tiny crop)', () => {
    renderCarousel([adImage('portrait.jpg', { isCover: true }), adImage('landscape.jpg')]);
    const frame = screen.getByTestId('ad-carousel-frame');
    const img = screen.getByTestId('ad-carousel-current');

    // Portrait image (2:1 height) finishes loading — the frame must NOT grow,
    // the crisp ad is rendered in a 100%/0.7-tall box that keeps the image's
    // real aspect ratio, so ~70% of the ad stays readable and undistorted.
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 1600 });
    act(() => {
      fireEvent.load(img);
    });

    expect(frame.style.height).toBe('clamp(220px, 58vw, 360px)');
    expect(frame.style.aspectRatio).toBe('');
    expect(img.style.height).toBe('calc(142.857%)');
    expect(img.style.aspectRatio).toBe('800 / 1600');
    expect(img.style.top).toBe('0px');
    expect(img.style.objectFit).toBe('cover');
    expect(img.style.opacity).toBe('1');

    // A blurred backdrop fills the banner so no empty side boxes ever show.
    const backdrops = Array.from(frame.querySelectorAll('img[aria-hidden="true"]'));
    expect(backdrops.length).toBeGreaterThan(0);
    expect((backdrops[0] as HTMLElement).style.filter).toContain('blur(');
  });

  it('keeps the same frame height across portrait and landscape slides (no aspect-ratio switching)', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('portrait.jpg', { isCover: true }), adImage('landscape.jpg')]);
    const frame = screen.getByTestId('ad-carousel-frame');
    const heightBefore = frame.style.height;

    // Autoplay advances to the landscape slide and it loads.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const next = screen.getByTestId('ad-carousel-current');
    Object.defineProperty(next, 'naturalWidth', { configurable: true, value: 1600 });
    Object.defineProperty(next, 'naturalHeight', { configurable: true, value: 400 });
    act(() => {
      fireEvent.load(next);
    });

    expect(frame.style.height).toBe(heightBefore);
    expect(frame.style.aspectRatio).toBe('');
    expect(next.style.objectFit).toBe('cover');
    expect(next.style.height).toBe('calc(142.857%)');
    expect(next.style.aspectRatio).toBe('1600 / 400');
  });
});

describe('AdImageCarousel — thumbnail interaction (image navigation, never conversion)', () => {
  it('clicking thumbnail #2 makes image #2 the active slide immediately', () => {
    renderCarousel([adImage('a.jpg'), adImage('b.jpg'), adImage('c.jpg')]);

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    });

    expect(currentSrc()).toBe('https://cdn/b.jpg');
    expect(screen.getByTestId('ad-carousel-thumb-1').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('ad-carousel-thumb-0').getAttribute('aria-current')).toBe('false');
  });

  it('clicking a far thumbnail jumps directly (no need for next/prev arrows)', () => {
    renderCarousel([
      adImage('a.jpg'),
      adImage('b.jpg'),
      adImage('c.jpg'),
      adImage('d.jpg'),
      adImage('e.jpg'),
      adImage('f.jpg'),
    ]);

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-4'));
    });

    expect(currentSrc()).toBe('https://cdn/e.jpg');
  });

  it('resets the autoplay countdown after a thumbnail click (advance resumes after a full interval)', () => {
    vi.useFakeTimers();
    renderCarousel([adImage('a.jpg'), adImage('b.jpg'), adImage('c.jpg'), adImage('d.jpg')]);

    // Jump to slide 3 (index 2) via thumbnail.
    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-2'));
    });
    expect(currentSrc()).toBe('https://cdn/c.jpg');

    // No advance within 1.5 s after the interaction…
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(currentSrc()).toBe('https://cdn/c.jpg');

    // …then autoplay resumes from the new slide after a full interval.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(currentSrc()).toBe('https://cdn/d.jpg');
  });

  it('per-slide device CTA follows the slide selected via thumbnail', () => {
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: 'dev-b' }),
        adImage('c.jpg', { deviceId: 'dev-c' }),
      ],
      { onSlideAction },
    );
    loadCurrent();

    // Jump to slide 2 (index 1) via thumbnail.
    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');

    loadCurrent();
    act(() => {
      fireEvent.click(screen.getByTestId('ad-slide-cta'));
    });
    expect(onSlideAction).toHaveBeenCalledTimes(1);
    expect(onSlideAction).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'dev-b', url: 'https://cdn/b.jpg' }));
  });

  it('a thumbnail click never triggers the CTA/handoff (browse first, convert separately)', () => {
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: 'dev-b' }),
      ],
      { onSlideAction },
    );

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    });

    expect(currentSrc()).toBe('https://cdn/b.jpg');
    expect(onSlideAction).not.toHaveBeenCalled();

    // Even once the new slide is loaded and the CTA is available, the
    // thumbnail click itself never fired a conversion action. With no details
    // handler the main image has no full-frame overlay at all — the CTA is the
    // only actionable surface.
    loadCurrent();
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(screen.getByTestId('ad-slide-cta')).toBeTruthy();
    expect(onSlideAction).not.toHaveBeenCalled();
  });

  it('a slide without a device stays non-interactive even when reached via thumbnail', () => {
    const onSlideAction = vi.fn();
    renderCarousel(
      [
        adImage('a.jpg', { deviceId: 'dev-a' }),
        adImage('b.jpg', { deviceId: '' }),
        adImage('c.jpg', { deviceId: 'dev-c' }),
      ],
      { onSlideAction },
    );
    loadCurrent();

    act(() => {
      fireEvent.click(screen.getByTestId('ad-carousel-thumb-1'));
    });
    expect(currentSrc()).toBe('https://cdn/b.jpg');
    loadCurrent();
    expect(screen.queryByTestId('ad-slide-action')).toBeNull();
    expect(onSlideAction).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import { PhoneGallery } from '../../components/showroom/phone-gallery/PhoneGallery';
import { PhoneCardCarousel } from '../../components/showroom/phone-gallery/PhoneCardCarousel';
import { ThemeProvider } from '../../design-system/use-theme';

const IMAGES = ['img-1.png', 'img-2.png', 'img-3.png'];

function renderGallery(images: readonly string[] = IMAGES) {
  return render(
    <ThemeProvider>
      <PhoneGallery images={images} name="Apple iPhone 13" />
    </ThemeProvider>,
  );
}

function renderCardCarousel(images: readonly string[] = IMAGES) {
  return render(
    <ThemeProvider>
      <PhoneCardCarousel images={images} name="Apple iPhone 13" />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('PhoneGallery — new details-page gallery', () => {
  it('renders scroll-snap container with role=region and aria-label', () => {
    renderGallery();
    expect(screen.getByRole('region', { name: 'product gallery' })).toBeTruthy();
  });

  it('scroll container uses VERTICAL scroll-snap (y mandatory), not horizontal', () => {
    renderGallery();
    const scroll = screen.getByTestId('phone-gallery-scroll');
    const style = scroll.style;
    expect(style.overflowY).toBe('auto');
    expect(style.scrollSnapType).toBe('y mandatory');
    expect(style.flexDirection).toBe('column');
    expect(style.height).toBe('70vh');
  });

  it('scroll container does NOT have horizontal scroll-snap', () => {
    renderGallery();
    const scroll = screen.getByTestId('phone-gallery-scroll');
    expect(scroll.style.overflowX).not.toBe('auto');
    expect(scroll.style.scrollSnapType).not.toContain('x');
  });

  it('renders dot indicators for multiple images', () => {
    renderGallery();
    expect(screen.getByTestId('phone-gallery-dots')).toBeTruthy();
    expect(screen.getByTestId('phone-gallery-dot-active')).toBeTruthy();
    expect(screen.getByTestId('phone-gallery-dot-1')).toBeTruthy();
    expect(screen.getByTestId('phone-gallery-dot-2')).toBeTruthy();
  });

  it('does NOT render dot indicators for a single image', () => {
    renderGallery(['only.png']);
    expect(screen.queryByTestId('phone-gallery-dots')).toBeNull();
  });

  it('tapping the gallery opens fullscreen dialog', () => {
    renderGallery();
    const region = screen.getByRole('region', { name: 'product gallery' });
    fireEvent.click(region);
    expect(screen.getByRole('dialog', { name: 'Apple iPhone 13' })).toBeTruthy();
  });

  it('fullscreen has close button and escape closes it', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('region', { name: 'product gallery' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    // Escape closes
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fullscreen close button closes the overlay', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('region', { name: 'product gallery' }));
    fireEvent.click(screen.getByTestId('phone-gallery-fullscreen-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fullscreen uses VERTICAL scroll-snap with 100dvh (Reels-style)', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('region', { name: 'product gallery' }));
    const fsScroll = screen.getByTestId('phone-gallery-fullscreen-scroll');
    expect(fsScroll.style.overflowY).toBe('auto');
    expect(fsScroll.style.scrollSnapType).toBe('y mandatory');
    expect(fsScroll.style.height).toBe('100dvh');
    expect(fsScroll.style.flexDirection).toBe('column');
  });

  it('does NOT have autoplay — advancing requires user action', () => {
    vi.useFakeTimers();
    renderGallery();
    // After 10s, no autoplay should have advanced
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByTestId('phone-gallery-dot-active')).toBeTruthy();
    vi.useRealTimers();
  });

  it('shows placeholder emoji for zero images', () => {
    renderGallery([]);
    const region = screen.getByRole('region', { name: 'product gallery' });
    expect(region).toBeTruthy();
    expect(region.textContent).toContain('📱');
  });

  it('no counter badge (1/N) — dots replace it', () => {
    renderGallery();
    expect(screen.queryByText('1/3')).toBeNull();
  });

  it('no side-peek elements (prev/next peek images)', () => {
    renderGallery();
    expect(screen.queryByTestId('gallery-prev')).toBeNull();
    expect(screen.queryByTestId('gallery-next')).toBeNull();
  });

  it('no arrow navigation buttons', () => {
    renderGallery();
    expect(screen.queryByTestId('gallery-prev-arrow')).toBeNull();
    expect(screen.queryByTestId('gallery-next-arrow')).toBeNull();
  });

  it('no thumbnail strip', () => {
    renderGallery();
    expect(screen.queryAllByRole('button', { name: /thumbnail/i })).toHaveLength(0);
  });
});

describe('PhoneCardCarousel — new card image carousel', () => {
  it('renders scroll container with images', () => {
    renderCardCarousel();
    const scroll = screen.getByTestId('phone-card-carousel-scroll');
    expect(scroll).toBeTruthy();
    const imgs = scroll.querySelectorAll('img');
    expect(imgs.length).toBe(3);
  });

  it('shows dot indicators for multiple images', () => {
    renderCardCarousel();
    expect(screen.getByTestId('phone-card-dots')).toBeTruthy();
    expect(screen.getByTestId('phone-card-dot-active')).toBeTruthy();
  });

  it('does NOT show dots for single image', () => {
    renderCardCarousel(['only.png']);
    expect(screen.queryByTestId('phone-card-dots')).toBeNull();
  });

  it('shows placeholder for zero images', () => {
    renderCardCarousel([]);
    expect(screen.getByRole('img', { name: 'Apple iPhone 13' })).toBeTruthy();
  });

  it('no autoplay — long wait does not change state', () => {
    vi.useFakeTimers();
    renderCardCarousel();
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByTestId('phone-card-dot-active')).toBeTruthy();
    vi.useRealTimers();
  });
});

describe('Feature toggle', () => {
  it('gallery-config exports USE_NEW_GALLERY boolean', async () => {
    const mod = await import('../../components/showroom/phone-gallery/gallery-config');
    expect(typeof mod.USE_NEW_GALLERY).toBe('boolean');
  });

  it('phone-gallery index re-exports PhoneGallery, PhoneCardCarousel, usePreloadImages, USE_NEW_GALLERY', async () => {
    const mod = await import('../../components/showroom/phone-gallery');
    expect(mod.PhoneGallery).toBeTruthy();
    expect(mod.PhoneCardCarousel).toBeTruthy();
    expect(typeof mod.usePreloadImages).toBe('function');
    expect(typeof mod.USE_NEW_GALLERY).toBe('boolean');
  });
});

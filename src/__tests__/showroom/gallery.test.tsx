import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ProductImageGallery } from '../../components/showroom/ProductImageGallery';
import { ThemeProvider } from '../../design-system/use-theme';

const IMAGES = ['img-1.png', 'img-2.png', 'img-3.png'];

function renderGallery() {
  return render(
    <ThemeProvider>
      <ProductImageGallery images={IMAGES} name="Apple iPhone 13" />
    </ThemeProvider>,
  );
}

function main() {
  return screen.getByRole('region', { name: 'product gallery' });
}

describe('Phase 3B §3.2 — ProductImageGallery', () => {
  it('renders the counter 1/N and one thumbnail per image', () => {
    renderGallery();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /thumbnail/i })).toHaveLength(3);
  });

  it('keyboard ArrowRight/Left steps the index', () => {
    renderGallery();
    fireEvent.keyDown(main(), { key: 'ArrowRight' });
    expect(screen.getByText('2/3')).toBeTruthy();

    fireEvent.keyDown(main(), { key: 'ArrowLeft' });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('clamps at the boundaries', () => {
    renderGallery();
    fireEvent.keyDown(main(), { key: 'ArrowLeft' }); // at 0 → stays 0
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('touch swipe left advances, swipe right goes back', () => {
    renderGallery();
    fireEvent.touchStart(main(), { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 60 }] });
    expect(screen.getByText('2/3')).toBeTruthy();

    fireEvent.touchStart(main(), { touches: [{ clientX: 60 }] });
    fireEvent.touchEnd(main(), { changedTouches: [{ clientX: 220 }] });
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('tapping the main image opens the fullscreen viewer', () => {
    renderGallery();
    fireEvent.click(main());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('thumbnail click jumps directly', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /thumbnail 3/i }));
    expect(screen.getByText('3/3')).toBeTruthy();
  });
});

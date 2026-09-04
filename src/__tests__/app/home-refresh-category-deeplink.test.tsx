import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';

// Focused regression: `#/home` is the canonical Home URL. A prior routing bug
// let App's category-slug deep-link fallback interpret the literal "home" as a
// category slug (`REPLACE {screen:'category', params:{slug:'home'}}`) which made
// CategoryScreen → getCategoryBySlug('home') → undefined → "Category not found"
// on a plain Home page refresh. The fix guards the fallback with `target !== 'home'`.
//
// Spy on getCategoryBySlug (preserving the rest of the service) to observe which
// slug category deep-links actually deliver to CategoryScreen — independent of
// any database state.
const getCategoryBySlugMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/categories-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/categories-service')>();
  return {
    ...actual,
    getCategoryBySlug: getCategoryBySlugMock,
  };
});

function renderApp() {
  return render(<Suspense fallback={<div>Loading...</div>}><App /></Suspense>);
}

describe('Home refresh → category deep-link regression', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    getCategoryBySlugMock.mockReset();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('#/home stays on Home and is NOT dispatched to category with slug "home"', async () => {
    window.history.pushState({}, '', '/#/home');
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
    }, { timeout: 5000 });

    // Give the boot effect time to (incorrectly) navigate if the bug regresses.
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Still on Home.
    expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
    // CategoryScreen must not mount, so CategoryScreen must never request "home".
    expect(getCategoryBySlugMock).not.toHaveBeenCalledWith('home');
    // The category not-found copy must never appear.
    expect(screen.queryByText('التصنيف غير موجود')).toBeNull();
  }, 20000);

  it('#/phones still routes to the category screen as slug "phones"', async () => {
    window.history.pushState({}, '', '/#/phones');
    renderApp();

    // App must leave Home and mount CategoryScreen; the (DB-mocked-away) category
    // will be unresolved so the not-found branch renders — the aria-label tells us
    // we are on CategoryScreen, and the slug spy proves "phones" was delivered.
    await waitFor(() => {
      expect(getCategoryBySlugMock).toHaveBeenCalledWith('phones');
    }, { timeout: 5000 });

    expect(screen.queryByRole('main', { name: 'Main navigation' })).toBeNull();
  }, 20000);
});

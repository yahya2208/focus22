import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '../../store/navigation';
import { CategoryNav } from '../../components/categories/CategoryNav';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#f0f0f6', textSecondary: '#a8a8c0', textMuted: '#6868a0', bgHover: '#1c1c38',
  }),
}));
// Wide (desktop) layout so the sidebar expands subcategories on hover AND on
// keyboard focus — hover must never be the only way to reach a category.
vi.mock('../../hooks/useIsWideLayout', () => ({ useIsWideLayout: () => true }));
vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

const MOCK_TREE = [
  {
    id: 'p1', slug: 'phones', name: 'Phones', nameAr: '', description: '', descriptionAr: '',
    icon: '📱', coverImage: '', parentId: null, sortOrder: 1, isActive: true,
    displayMode: 'phones', theme: 'technology', deliveryAvailable: false, isFeatured: false,
    children: [
      {
        id: 'p2', slug: 'accessories', name: 'Accessories', nameAr: '', description: '', descriptionAr: '',
        icon: '🎧', coverImage: '', parentId: 'p1', sortOrder: 1, isActive: true,
        displayMode: 'storefront', theme: 'technology', deliveryAvailable: false, isFeatured: false,
        children: [],
      },
      {
        id: 'p3', slug: 'cases', name: 'Cases', nameAr: '', description: '', descriptionAr: '',
        icon: '', coverImage: '', parentId: 'p1', sortOrder: 2, isActive: true,
        displayMode: 'storefront', theme: 'technology', deliveryAvailable: false, isFeatured: false,
        children: [],
      },
    ],
  },
  {
    id: 'g1', slug: 'games', name: 'Games', nameAr: '', description: '', descriptionAr: '',
    icon: '🎮', coverImage: '', parentId: null, sortOrder: 2, isActive: true,
    displayMode: 'games', theme: 'playful', deliveryAvailable: false, isFeatured: false,
    children: [],
  },
];

vi.mock('../../services/categories-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/categories-service')>('../../services/categories-service');
  return {
    ...actual,
    getCategories: () => MOCK_TREE,
    ensureCategoriesLoaded: () => Promise.resolve(),
    subscribeCategories: () => () => {},
  };
});

function renderNav() {
  return render(
    <AppProvider>
      <CategoryNav />
    </AppProvider>,
  );
}

describe('CategoryNav wide layout a11y', () => {
  it('reveals children on keyboard focus of a root (no hover required)', () => {
    renderNav();
    // Desktop: children hidden until the root is focused/hovered.
    expect(screen.queryByText('Accessories')).toBeNull();
    // Keyboard focus (e.g. Tab) on the Phones root must reveal its children.
    fireEvent.focus(screen.getByText('Phones'));
    expect(screen.getByText('Accessories')).toBeTruthy();
    expect(screen.getByText('Cases')).toBeTruthy();
  });

  it('keeps children open when focus moves between sibling children', () => {
    renderNav();
    fireEvent.focus(screen.getByText('Phones'));
    expect(screen.getByText('Accessories')).toBeTruthy();
    // Move focus from Phones root to a child that lives in the same subtree;
    // the menu must stay open (focus-within keeps the disclosure visible).
    const accessories = screen.getByText('Accessories');
    fireEvent.blur(screen.getByText('Phones'), { relatedTarget: accessories });
    expect(screen.getByText('Accessories')).toBeTruthy();
  });
});

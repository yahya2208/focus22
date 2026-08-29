import { describe, it, expect, vi, beforeEach } from 'vitest';
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
vi.mock('../../hooks/useIsWideLayout', () => ({ useIsWideLayout: () => false }));
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

describe('CategoryNav', () => {
  beforeEach(() => {});

  it('renders the mobile trigger collapsed and reveals roots on tap', () => {
    renderNav();
    // Mobile default: collapsed — only the trigger is visible.
    expect(screen.queryByText('Phones')).toBeNull();
    expect(screen.getByLabelText('category.menuTitle')).toBeTruthy();
    // Tap to expand reveals the DB-driven top-level rows.
    fireEvent.click(screen.getByLabelText('category.menuTitle'));
    expect(screen.getByText('Phones')).toBeTruthy();
    expect(screen.getByText('Games')).toBeTruthy();
  });

  it('reveals children on tap when expanded on mobile', () => {
    renderNav();
    fireEvent.click(screen.getByLabelText('category.menuTitle'));
    expect(screen.getByText('Accessories')).toBeTruthy();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import { CategoryScreen } from '../../screens/categories/CategoryScreen';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    text: '#f0f0f6', textSecondary: '#a8a8c0', textMuted: '#6868a0', textFaint: '#3c3c68',
    bgCard: 'rgba(16,16,28,0.85)', bgHover: '#1c1c38', bg: '#0a0a12', glass: 'rgba(255,255,255,0.03)',
    glassBorder: 'rgba(255,255,255,0.07)', borderLight: '#24243e', accent: '#00e4b8',
    success: '#b8f24c', successBg: 'rgba(184,242,76,0.10)', successText: '#b8f24c',
    warning: '#ffc244', warningBg: 'rgba(255,194,68,0.10)', warningText: '#ffd06a',
  }),
}));
vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});
vi.mock('../../hooks/useInventoryImages', () => ({
  useInventoryImages: () => [],
}));

const MOCK_STATE = vi.hoisted(() => {
  const MOCK_CATEGORY = {
    id: 'c-phones', slug: 'phones', name: 'Phones', nameAr: '', description: 'Refurbished phones',
    descriptionAr: '', icon: '📱', coverImage: '', parentId: null, sortOrder: 1, isActive: true,
    displayMode: 'phones' as const, theme: 'technology' as const, deliveryAvailable: false, isFeatured: false,
  };
  const getBySlug = vi.fn((slug: string) => (slug === 'phones' ? MOCK_CATEGORY : undefined));
  return { getBySlug };
});

vi.mock('../../services/categories-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/categories-service')>('../../services/categories-service');
  return {
    ...actual,
    getCategoryBySlug: MOCK_STATE.getBySlug,
    getCategoryLabel: () => 'Phones',
    getCategoryDescription: () => 'Refurbished phones',
    getChildren: () => [],
    getCategoryParent: () => undefined,
    ensureCategoriesLoaded: () => Promise.resolve(),
    subscribeCategories: () => () => {},
  };
});

vi.mock('../../services/inventory-service', () => ({
  InventoryService: { getExchangeableDevices: () => [] },
}));
vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: () => Promise.resolve(),
  getDeliveryZones: () => [],
  estimateDelivery: () => Promise.resolve({ available: false, fee: 0, minutesMin: 30, minutesMax: 45 }),
}));

function SlugSetter({ slug }: { slug?: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (slug) dispatch({ type: 'NAVIGATE', screen: 'category', params: { slug } });
  }, [slug, dispatch]);
  return null;
}

function renderWithSlug(slug?: string) {
  return render(
    <AppProvider>
      <SlugSetter slug={slug} />
      <CategoryScreen />
    </AppProvider>,
  );
}

describe('CategoryScreen', () => {
  beforeEach(() => {
    MOCK_STATE.getBySlug.mockClear();
  });

  it('renders product content for a phones category via slug param', async () => {
    renderWithSlug('phones');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('category.products')).toBeTruthy();
    expect(screen.getAllByText('Phones').length).toBeGreaterThan(0);
  });

  it('shows a not-found state when the slug does not resolve', async () => {
    renderWithSlug('missing');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('category.notFound')).toBeTruthy();
    expect(screen.getByText('category.backToHome')).toBeTruthy();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
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

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../core/telemetry', () => ({ track: mockTrack }));

const CATEGORIES: Record<string, { id: string; slug: string; name: string; displayMode: string }> = {
  phones: { id: 'c-phones', slug: 'phones', name: 'Phones', displayMode: 'phones' },
  store: { id: 'c-store', slug: 'store', name: 'Store', displayMode: 'storefront' },
};

const MOCK_STATE = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membersOf = vi.fn(async (_categoryId: string): Promise<any[]> => []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getListing = vi.fn(async (_id: string): Promise<any | null> => null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exchangeable = vi.fn((): Array<Record<string, unknown>> => []);
  return { membersOf, getListing, exchangeable };
});

vi.mock('../../services/categories-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/categories-service')>('../../services/categories-service');
  return {
    ...actual,
    getCategoryBySlug: (slug: string) => {
      const c = CATEGORIES[slug];
      if (!c) return undefined;
      return { ...c, nameAr: '', description: '', descriptionAr: '', icon: '📱', coverImage: '', parentId: null, sortOrder: 1, isActive: true, theme: 'technology' as const, deliveryAvailable: false, isFeatured: false };
    },
    getCategoryLabel: () => 'Label',
    getCategoryDescription: () => '',
    getChildren: () => [],
    getCategoryParent: () => undefined,
    ensureCategoriesLoaded: () => Promise.resolve(),
    subscribeCategories: () => () => {},
  };
});
vi.mock('../../services/category-products-service', () => ({
  getCategoryMembers: MOCK_STATE.membersOf,
  getCategoryProductsInvalidation: () => 0,
  subscribeCategoryProducts: () => () => {},
  startCategoryProductsRealtime: () => {},
}));
vi.mock('../../services/listing-service', () => ({ getPublicListing: MOCK_STATE.getListing }));
vi.mock('../../services/inventory-service', () => ({ InventoryService: { getExchangeableDevices: () => MOCK_STATE.exchangeable() } }));
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

beforeEach(() => {
  mockTrack.mockClear();
  MOCK_STATE.membersOf.mockResolvedValue([]);
  MOCK_STATE.getListing.mockResolvedValue(null);
  vi.mocked(MOCK_STATE.exchangeable).mockReturnValue([]);
});

describe('T3.1 wiring — CategoryScreen telemetry', () => {
  function trackCalls() {
    return (mockTrack.mock.calls as unknown[]).map((c) => (c as unknown[])[0]) as Array<Record<string, unknown>>;
  }

  it('category_view fires once per loaded category with slug identifier', async () => {
    renderWithSlug('phones');
    await waitFor(() => {
      expect(trackCalls().some((c) => c.event === 'category_view')).toBe(true);
    });
    expect(trackCalls().find((c) => c.event === 'category_view')).toMatchObject({ entityType: 'category', entityId: 'phones' });
  });

  it('category_product_list_view fires with the phone member count', async () => {
    MOCK_STATE.membersOf.mockResolvedValue([
      { categoryId: 'c-phones', productId: 'phone-1', sortOrder: 0, isFeatured: false, domain: 'phone' as const, brand: '', model: '', price: null, pricePeriod: 'sale' as const, images: [] },
    ]);
    MOCK_STATE.exchangeable.mockReturnValue([
      { id: 'phone-1', brand: 'Apple', model: 'iPhone 15', variant: '128GB', quantity: 3, sellPrice: 1200, images: [], condition: 'New' },
    ]);
    renderWithSlug('phones');
    await waitFor(() => {
      expect(trackCalls().some((c) => c.event === 'category_product_list_view')).toBe(true);
    });
    expect(trackCalls().find((c) => c.event === 'category_product_list_view')).toMatchObject({
      entityType: 'category', entityId: 'phones', properties: { count: 1 },
    });
  });

  it('does NOT fire list_view before any phone member renders', async () => {
    renderWithSlug('phones');
    await new Promise((r) => setTimeout(r, 50));
    expect(trackCalls().find((c) => c.event === 'category_product_list_view')).toBeUndefined();
  });

  it('category_product_click sends product id + position on grid card click', async () => {
    MOCK_STATE.membersOf.mockResolvedValue([
      { categoryId: 'c-phones', productId: 'phone-1', sortOrder: 0, isFeatured: false, domain: 'phone' as const, brand: '', model: '', price: null, pricePeriod: 'sale' as const, images: [] },
      { categoryId: 'c-phones', productId: 'phone-2', sortOrder: 1, isFeatured: false, domain: 'phone' as const, brand: '', model: '', price: null, pricePeriod: 'sale' as const, images: [] },
    ]);
    MOCK_STATE.exchangeable.mockReturnValue([
      { id: 'phone-1', brand: 'Apple', model: 'iPhone 15', variant: '128GB', quantity: 3, sellPrice: 1200, images: [], condition: 'New' },
      { id: 'phone-2', brand: 'Samsung', model: 'A52', variant: '128GB', quantity: 2, sellPrice: 800, images: [], condition: 'Used' },
    ]);
    renderWithSlug('phones');
    await screen.findByText('iPhone 15');
    fireEvent.click(screen.getByText('iPhone 15'));
    await waitFor(() => {
      expect(trackCalls().some((c) => c.event === 'category_product_click')).toBe(true);
    });
    expect(trackCalls().find((c) => c.event === 'category_product_click')).toMatchObject({
      entityType: 'product', entityId: 'phone-1', properties: { position: 0 },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import { CategoryScreen } from '../../screens/categories/CategoryScreen';
import { ensureAdminListingPresenters } from '../../domains/listings';
import type { ListingRecord } from '../../domains/listings/types';
import type { CategoryMember } from '../../core/categories/membership';

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

const CATEGORIES: Record<string, { id: string; slug: string; name: string; displayMode: string }> = {
  phones: {
    id: 'c-phones', slug: 'phones', name: 'Phones', displayMode: 'phones',
  },
  store: {
    id: 'c-store', slug: 'store', name: 'Store', displayMode: 'storefront',
  },
};

const MOCK_STATE = vi.hoisted(() => {
  const membersOf = vi.fn(async (_categoryId: string): Promise<CategoryMember[]> => []);
  const getListing = vi.fn(async (_id: string): Promise<ListingRecord | null> => null);
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
      return {
        ...c,
        nameAr: '', description: '', descriptionAr: '', icon: '📱', coverImage: '',
        parentId: null, sortOrder: 1, isActive: true,
        theme: 'technology' as const, deliveryAvailable: false, isFeatured: false,
      };
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

vi.mock('../../services/listing-service', () => ({
  getPublicListing: MOCK_STATE.getListing,
}));

vi.mock('../../services/inventory-service', () => ({
  InventoryService: { getExchangeableDevices: () => MOCK_STATE.exchangeable() },
}));vi.mock('../../services/delivery-service', () => ({
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

function makeCar(id: string): ListingRecord {
  return {
    id, category: 'car', brand: 'Toyota', model: 'Corolla GLX', description: '', color: '',
    city: 'Damascus', warranty: '', code: '', price: { amount: 18500, period: 'sale' },
    conditionGroup: null, quantity: 1, status: 'in_stock', isPublished: true, images: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    car: { trim: 'GLX', year: 2020, mileageKm: 54000, fuel: 'benzin', transmission: 'automatic', bodyType: 'sedan', engineCc: 1800, conditionState: 'used' },
  };
}

function makeProperty(id: string): ListingRecord {
  return {
    id, category: 'property', brand: '', model: 'Apartment Mazzeh 3 rooms', description: '', color: '',
    city: 'Damascus', warranty: '', code: '', price: { amount: 450, period: 'monthly' },
    conditionGroup: null, quantity: 1, status: 'in_stock', isPublished: true, images: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    propertyDetails: {
      propertyType: 'apartment', transactionType: 'rent', district: 'Mazzeh', areaM2: 120,
      bedrooms: 3, bathrooms: 2, floor: 4, furnished: false, conditionState: 'good',
    },
  };
}

function member(id: string, domain: CategoryMember['domain']): CategoryMember {
  return { categoryId: 'c-phones', productId: id, sortOrder: 0, isFeatured: false, domain: domain, brand: '', model: '', price: null, pricePeriod: 'sale', images: [] };
}

describe('CategoryScreen — membership-driven products', () => {
  ensureAdminListingPresenters();

  beforeEach(() => {
    MOCK_STATE.membersOf.mockResolvedValue([]);
    MOCK_STATE.getListing.mockResolvedValue(null);
    vi.mocked(MOCK_STATE.exchangeable).mockReturnValue([]);
  });

  it('renders phone members from the inventory cache', async () => {
    MOCK_STATE.membersOf.mockResolvedValue([member('phone-1', 'phone')]);
    MOCK_STATE.exchangeable.mockReturnValue([
      { id: 'phone-1', brand: 'Apple', model: 'iPhone 15', variant: '128GB', quantity: 3, sellPrice: 1200, images: [], condition: 'New' },
    ]);
    renderWithSlug('phones');
    expect(await screen.findByText('Apple')).toBeTruthy();
    expect(await screen.findByText('iPhone 15')).toBeTruthy();
  });

  it('renders car and property members via the public listing card', async () => {
    MOCK_STATE.membersOf.mockResolvedValue([member('car-1', 'car'), member('prop-1', 'property')]);
    MOCK_STATE.getListing.mockImplementation(async (id: string) => {
      if (id === 'car-1') return makeCar('car-1');
      if (id === 'prop-1') return makeProperty('prop-1');
      return null;
    });
    renderWithSlug('phones');
    expect(await screen.findByText(/Toyota/)).toBeTruthy();
    expect(await screen.findByText(/Corolla/)).toBeTruthy();
    expect(await screen.findByText(/Apartment Mazzeh/)).toBeTruthy();
    expect(MOCK_STATE.getListing).toHaveBeenCalledWith('car-1');
    expect(MOCK_STATE.getListing).toHaveBeenCalledWith('prop-1');
  });

  it('shows the empty state for a phones category with no members', async () => {
    renderWithSlug('phones');
    expect(await screen.findByText('category.products')).toBeTruthy();
    expect(await screen.findByText('category.empty')).toBeTruthy();
  });

  it('shows storefront coming soon for a storefront category with no members', async () => {
    renderWithSlug('store');
    expect(await screen.findByText('category.storefrontComingSoon')).toBeTruthy();
  });
});

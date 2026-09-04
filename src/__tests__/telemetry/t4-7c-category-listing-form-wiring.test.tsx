/**
 * T4.7C — category / marketplace / listing-create telemetry producer coverage.
 *
 * Covering the ACTIVE events that had no producer-proof test yet:
 *   - subcategory_view         CategoryScreen child-card click
 *   - category_search          ShowroomScreen debounced search commit
 *   - listing_view_detail      ListingDetailsScreen once a public listing loads
 *   - listing_contact          ListingDetailsScreen contact CTA (whatsapp)
 *   - listing_add_to_cart      ListingDetailsScreen request-cart CTA
 *   - listing_create_start     Car/Produce/Property forms on mount
 *   - listing_create_submit    forms once validation passes
 *
 * Every event is asserted against the exact allowlist payloads from
 * src/core/telemetry/events.ts, through real producers. No DB/RPC/registry
 * contracts are touched: data paths are mocked/faked exactly as the existing
 * suites do, and `listing-service.createListing/CreateListingForCategory` are
 * spied so submits never reach a real RPC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import { TranslationProvider } from '../../hooks/useTranslation';
import { CartProvider } from '../../core/cart/CartContext';
import type { ThemeColors } from '../../hooks/useThemeColors';
import { updateSettings } from '../../core/config/settings';
import { CategoryScreen } from '../../screens/categories/CategoryScreen';
import { ShowroomScreen } from '../../screens/showroom/ShowroomScreen';
import { ListingDetailsScreen } from '../../screens/showroom/ListingDetailsScreen';
import { CarListingForm } from '../../components/inventory/listings/CarListingForm';
import { ProduceListingForm } from '../../components/inventory/listings/ProduceListingForm';
import { PropertyListingForm } from '../../components/inventory/listings/PropertyListingForm';
import {
  resetFakeCentralDb,
  seedFakeCentralDb,
  seedFakeListings,
} from '../helpers/fake-central-inventory';
import { resetShowroomUiState } from '../../hooks/useShowroomState';
import { resetSearchAnalyticsRetention } from '../../hooks/useSearchAnalytics';

const mockTrack = vi.hoisted(() => vi.fn());
const mockCreateListing = vi.hoisted(() => vi.fn(async () => 'L-new'));
const mockCreateListingForCategory = vi.hoisted(() => vi.fn(async () => 'L-new'));
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('../../core/telemetry', () => ({ track: mockTrack }));

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

vi.mock('../../services/listing-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/listing-service')>();
  return {
    ...actual,
    createListing: mockCreateListing,
    createListingForCategory: mockCreateListingForCategory,
  };
});

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    bg: '#0a0a12', bgCard: 'rgba(16,16,28,0.85)', bgInput: '#141428', bgHover: '#1c1c38',
    border: '#24243e', borderLight: '#24243e', text: '#f0f0f6', textSecondary: '#a8a8c0',
    textMuted: '#6868a0', textFaint: '#3c3c68', accent: '#00e4b8', accentLight: 'rgba(0,228,184,0.15)',
    accentGlow: 'rgba(0,228,184,0.25)', success: '#b8f24c', successBg: 'rgba(184,242,76,0.10)',
    successText: '#b8f24c', danger: '#ff6b6b', dangerBg: 'rgba(255,107,107,0.10)', dangerText: '#ff6b6b',
    warning: '#ffc244', warningBg: 'rgba(255,194,68,0.10)', warningText: '#ffd06a', info: '#4cc9f0',
    infoBg: 'rgba(76,201,240,0.10)', infoText: '#4cc9f0', progressBg: '#24243e', shadow: '',
    glass: 'rgba(255,255,255,0.03)', glassBorder: 'rgba(255,255,255,0.07)', gradient: '',
  } as ThemeColors),
}));

vi.mock('../../services/inventory-central-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/inventory-central-service')>();
  return {
    ...actual,
    getInventoryReady: () => true,
    subscribeCentralInventory: () => () => {},
  };
});

const exchangeable = vi.hoisted(() => vi.fn<() => Array<Record<string, unknown>>>(() => []));
vi.mock('../../services/inventory-service', () => ({
  InventoryService: { getExchangeableDevices: () => exchangeable() },
}));

vi.mock('../../services/phone-search-service', () => ({
  recordPhoneSearch: vi.fn(async () => ({ searchEventId: 1, deduped: false })),
  recordSearchSelection: vi.fn(),
}));

vi.mock('../../services/delivery-service', () => ({
  ensureDeliveryLoaded: () => Promise.resolve(),
  getDeliveryZones: () => [],
  estimateDelivery: () => Promise.resolve({ available: false, fee: 0, minutesMin: 30, minutesMax: 45 }),
}));

vi.mock('../../providers/WhatsAppProvider', () => ({
  useWhatsApp: () => ({
    send: mockSend,
    modal: null,
    retryOpen: vi.fn(),
    copyMessage: vi.fn(async () => true),
    closeModal: vi.fn(),
  }),
}));

const STORE = {
  id: 'c-store',
  slug: 'store',
  name: 'Store',
  nameAr: '',
  description: '',
  descriptionAr: '',
  icon: '🏪',
  coverImage: '',
  parentId: null,
  sortOrder: 1,
  isActive: true,
  theme: 'market' as const,
  displayMode: 'phones' as const,
  deliveryAvailable: false,
  isFeatured: false,
};

const CHILD = {
  id: 'c-veg',
  slug: 'vegetables',
  name: 'Vegetables',
  nameAr: '',
  description: '',
  descriptionAr: '',
  icon: '🥦',
  coverImage: '',
  parentId: 'c-store',
  sortOrder: 1,
  isActive: true,
  theme: 'market' as const,
  displayMode: 'storefront' as const,
  deliveryAvailable: false,
  isFeatured: false,
};

const CATEGORY_MOCK = vi.hoisted(() => ({
  membersOf: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
}));

vi.mock('../../services/categories-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/categories-service')>('../../services/categories-service');
  return {
    ...actual,
    getCategoryBySlug: (slug: string) => {
      if (slug === STORE.slug) return STORE;
      return undefined;
    },
    getCategoryLabel: (c: { slug: string }) => (c.slug === CHILD.slug ? 'Vegetables' : 'Store'),
    getCategoryDescription: () => '',
    getChildren: () => [CHILD],
    getCategoryParent: () => undefined,
    ensureCategoriesLoaded: () => Promise.resolve(),
    subscribeCategories: () => () => {},
  };
});

vi.mock('../../services/category-products-service', () => ({
  getCategoryMembers: CATEGORY_MOCK.membersOf,
  getCategoryProductsInvalidation: () => 0,
  subscribeCategoryProducts: () => () => {},
  startCategoryProductsRealtime: () => {},
}));

function eventsOf(name: string) {
  return (mockTrack.mock.calls as Array<[Record<string, unknown>]>).map((c) => c[0]).filter((e) => e.event === name);
}

const FORBIDDEN = ['phone', 'address', 'email', 'name', 'text', 'description', 'token', 'code', 'message', 'stack', 'url', 'content'];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  updateSettings({ language: 'en' });
});

describe('T4.7C — category & marketplace telemetry producers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CATEGORY_MOCK.membersOf.mockResolvedValue([]);
    exchangeable.mockReturnValue([]);
    resetShowroomUiState();
    resetSearchAnalyticsRetention();
  });

  describe('CategoryScreen — subcategory_view', () => {
    it('fires subcategory_view once with entityType category + child slug on child-card click', async () => {
      render(
        <AppProvider>
          <SlugSetter slug="store" />
          <CategoryScreen />
        </AppProvider>,
      );
      await screen.findByText('Vegetables');
      fireEvent.click(screen.getByText('Vegetables'));

      const views = eventsOf('subcategory_view');
      expect(views).toHaveLength(1);
      expect(views[0]).toEqual({ event: 'subcategory_view', entityType: 'category', entityId: 'vegetables' });
    });
  });

  describe('ShowroomScreen — category_search', () => {
    function renderShowroom() {
      return render(
        <AppProvider>
          <ShowroomScreen />
        </AppProvider>,
      );
    }

    it('commits category_search ONCE per settled non-empty query with has_result, 400ms debounced', async () => {
      vi.useFakeTimers();
      exchangeable.mockReturnValue([
        { id: 'inv-sam', brand: 'Samsung', model: 'Galaxy S22', variant: '8/128', quantity: 2, sellPrice: 90000 },
      ] as never[]);
      renderShowroom();
      const input = screen.getByPlaceholderText('showroom.search') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Samsung' } });
      // Not yet committed — still inside the debounce window.
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(eventsOf('category_search')).toHaveLength(0);

      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(eventsOf('category_search')).toHaveLength(1);
      expect(eventsOf('category_search')[0]).toEqual({
        event: 'category_search',
        entityType: 'category',
        entityId: 'phone',
        properties: { has_result: true },
      });

      // A follow-up commit is a NEW event, but never a keystroke-level spam.
      fireEvent.change(input, { target: { value: 'zzz-no-match' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(eventsOf('category_search')).toHaveLength(2);
      expect(eventsOf('category_search')[1]).toEqual({
        event: 'category_search',
        entityType: 'category',
        entityId: 'phone',
        properties: { has_result: false },
      });

      // Clearing the query never fires (empty searches are not committed).
      fireEvent.change(input, { target: { value: '' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(eventsOf('category_search')).toHaveLength(2);
    });

    it('never reports the raw query text (PII-free contract)', async () => {
      vi.useFakeTimers();
      renderShowroom();
      const input = screen.getByPlaceholderText('showroom.search') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'private search text' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      for (const evt of eventsOf('category_search')) {
        for (const key of Object.keys(evt.properties ?? {})) {
          expect(FORBIDDEN).not.toContain(key.toLowerCase());
        }
      }
    });
  });

  describe('ListingDetailsScreen — listing_view_detail / listing_contact / listing_add_to_cart', () => {
    let ids: { carId: string; propertyId: string };

    beforeEach(() => {
      resetFakeCentralDb();
      seedFakeCentralDb();
      ids = seedFakeListings();
    });

    function renderDetails(id: string) {
      updateSettings({ language: 'ar' });
      return render(
        <TranslationProvider>
          <AppProvider>
            <CartProvider>
              <ListingDetailsProbe id={id} />
            </CartProvider>
          </AppProvider>
        </TranslationProvider>,
      );
    }

    it('fires listing_view_detail once loaded with the listing id, and contact/add-to-cart once per gesture', async () => {
      renderDetails(ids.carId);
      await waitFor(() => {
        expect(eventsOf('listing_view_detail')).toHaveLength(1);
      });

      expect(eventsOf('listing_view_detail')[0]).toEqual({
        event: 'listing_view_detail',
        entityType: 'listing',
        entityId: ids.carId,
      });

      // Contact CTA → exactly one listing_contact via whatsapp, co-firing the send.
      fireEvent.click(screen.getByText('تواصل مع صاحب الإعلان'));
      expect(eventsOf('listing_contact')).toEqual([
        { event: 'listing_contact', entityType: 'listing', entityId: ids.carId, properties: { method: 'whatsapp' } },
      ]);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // A repeat contact gesture is a NEW event, never a duplicate.
      fireEvent.click(screen.getByText('تواصل مع صاحب الإعلان'));
      expect(eventsOf('listing_contact')).toHaveLength(2);

      // Request-cart CTA → exactly one listing_add_to_cart with qty 1.
      // (Navigating to the cart clears the screen params, so contact gestures
      // must be exercised BEFORE the add-to-cart navigation.)
      fireEvent.click(screen.getByText('أضف إلى سلة الطلب'));
      expect(eventsOf('listing_add_to_cart')).toEqual([
        { event: 'listing_add_to_cart', entityType: 'listing', entityId: ids.carId, properties: { qty: 1 } },
      ]);
    });
  });

  describe('Listing create forms — listing_create_start / listing_create_submit', () => {
    function mockColors(): ThemeColors {
      return {
        bg: '', bgCard: '', bgInput: '', bgHover: '', border: '', borderLight: '',
        text: '', textSecondary: '', textMuted: '', textFaint: '', accent: '', accentLight: '',
        accentGlow: '', success: '', successBg: '', successText: '', danger: '', dangerBg: '',
        dangerText: '', warning: '', warningBg: '', warningText: '', info: '', infoBg: '',
        infoText: '', progressBg: '', shadow: '', glass: '', glassBorder: '', gradient: '',
      } as ThemeColors;
    }

    it('CarListingForm: listing_create_start once on mount, listing_create_submit once after a valid submit', async () => {
      render(<CarListingForm colors={mockColors()} onDone={() => {}} />);
      expect(eventsOf('listing_create_start')).toEqual([
        { event: 'listing_create_start', entityType: 'listing', properties: { step: 'form' } },
      ]);

      fireEvent.change(screen.getByLabelText('الماركة (Make) *'), { target: { value: 'Toyota' } });
      fireEvent.change(screen.getByLabelText('الموديل *'), { target: { value: 'Corolla' } });
      fireEvent.click(screen.getByRole('button', { name: 'حفظ السيارة' }));

      await waitFor(() => {
        expect(eventsOf('listing_create_submit')).toHaveLength(1);
      });
      expect(eventsOf('listing_create_submit')[0]).toEqual({
        event: 'listing_create_submit',
        entityType: 'listing',
        properties: {},
      });
      expect(mockCreateListing).toHaveBeenCalledTimes(1);
      // Re-renders after submit never re-fire the start event.
      expect(eventsOf('listing_create_start')).toHaveLength(1);
    });

    it('ProduceListingForm: start once, submit once with default quantity, no PII payloads', async () => {
      render(<ProduceListingForm colors={mockColors()} onDone={() => {}} />);
      expect(eventsOf('listing_create_start')).toHaveLength(1);

      fireEvent.change(screen.getByLabelText('اسم المنتج *'), { target: { value: 'بطاطس' } });
      fireEvent.click(screen.getByRole('button', { name: 'حفظ المنتج' }));

      await waitFor(() => {
        expect(eventsOf('listing_create_submit')).toHaveLength(1);
      });
      expect(eventsOf('listing_create_submit')[0]).toEqual({
        event: 'listing_create_submit',
        entityType: 'listing',
        properties: {},
      });
      expect(mockCreateListing).toHaveBeenCalledTimes(1);
      expect(eventsOf('listing_create_start')).toHaveLength(1);
    });

    it('PropertyListingForm: start once, submit once once the title is filled', async () => {
      render(<PropertyListingForm colors={mockColors()} onDone={() => {}} />);
      expect(eventsOf('listing_create_start')).toHaveLength(1);

      fireEvent.change(screen.getByLabelText('العنوان *'), { target: { value: 'شقة' } });
      fireEvent.click(screen.getByRole('button', { name: 'حفظ العقار' }));

      await waitFor(() => {
        expect(eventsOf('listing_create_submit')).toHaveLength(1);
      });
      expect(eventsOf('listing_create_submit')[0]).toEqual({
        event: 'listing_create_submit',
        entityType: 'listing',
        properties: {},
      });
      expect(mockCreateListingForCategory).not.toHaveBeenCalled();
      expect(mockCreateListing).toHaveBeenCalledTimes(1);
      expect(eventsOf('listing_create_start')).toHaveLength(1);
    });
  });
});

function SlugSetter({ slug }: { slug: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'category', params: { slug } });
  }, [slug, dispatch]);
  return null;
}

function ListingDetailsProbe({ id }: { id: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'showroom', params: {} });
    dispatch({ type: 'NAVIGATE', screen: 'listing-details', params: { id } });
  }, [dispatch, id]);
  return <ListingDetailsScreen />;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryProductsPanel } from '../../screens/admin/CategoryProductsPanel';
import type { Category } from '../../core/categories/types';
import type { CategoryMemberAdmin } from '../../core/categories/membership';
import {
  canCreateProducts,
  isProductDomain,
  PRODUCT_DOMAINS,
} from '../../core/categories/membership';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ar', dir: 'rtl' }),
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

const MOCK = vi.hoisted(() => {
  const list = vi.fn(async (): Promise<CategoryMemberAdmin[]> => []);
  const assign = vi.fn(async (_categoryId: string, _productIds: string[]): Promise<number> => 1);
  const createListing = vi.fn(async (): Promise<string> => 'created-1');
  const updateImages = vi.fn(async (): Promise<null> => null);
  const getLabel = (c: Category) => c.name;
  return { list, assign, createListing, updateImages, getLabel };
});

vi.mock('../../services/category-products-service', () => ({
  adminListCategoryProducts: MOCK.list,
  adminAssignProducts: MOCK.assign,
  adminRemoveProduct: vi.fn(async () => true),
  adminSetMembershipActive: vi.fn(async () => {}),
  adminSetMembershipFeatured: vi.fn(async () => {}),
  adminReorderCategoryProducts: vi.fn(async () => {}),
}));
vi.mock('../../services/listing-service', () => ({
  createListing: MOCK.createListing,
}));
vi.mock('../../services/inventory-service', () => ({
  InventoryService: { updateImages: MOCK.updateImages },
}));
vi.mock('../../services/categories-service', () => ({
  getCategoryLabel: MOCK.getLabel,
}));
vi.mock('../../components/showroom/PhoneImageUploader', () => ({
  PhoneImageUploader: () => <div>images</div>,
}));

function category(overrides: Partial<Category>): Category {
  return {
    id: 'c', slug: 'c', name: 'Cat', nameAr: 'تصنيف', description: '', descriptionAr: '',
    icon: '📦', coverImage: '', parentId: null, sortOrder: 1, isActive: true,
    displayMode: 'storefront', theme: 'fresh', deliveryAvailable: true, isFeatured: false,
    domain: '', ...overrides,
  };
}

function renderPanel(cat: Category) {
  return render(<CategoryProductsPanel category={cat} onClose={() => {}} />);
}

describe('canCreateProducts (capability registry)', () => {
  it('is data-driven from the domain registry, not category names', () => {
    expect(PRODUCT_DOMAINS).toEqual(['phone', 'car', 'property', 'produce']);
    expect(canCreateProducts('produce')).toBe(true);
    expect(canCreateProducts('car')).toBe(true);
    expect(canCreateProducts('property')).toBe(true);
    expect(canCreateProducts('phone')).toBe(true);
    expect(canCreateProducts('')).toBe(false);
    expect(canCreateProducts(undefined)).toBe(false);
    expect(canCreateProducts('tomato')).toBe(false);
    expect(canCreateProducts('vegetables')).toBe(false);
  });

  it('isProductDomain guards the registry', () => {
    expect(isProductDomain('produce')).toBe(true);
    expect(isProductDomain('')).toBe(false);
    expect(isProductDomain('fruits')).toBe(false);
  });
});

describe('Category-scoped Add Product (generic, domain-driven)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK.list.mockResolvedValue([]);
    MOCK.assign.mockResolvedValue(1);
    MOCK.createListing.mockResolvedValue('created-1');
  });

  it('shows the create button for a produce-domain category and no button for display-only', async () => {
    renderPanel(category({ domain: 'produce', nameAr: 'الخضروات' }));
    expect((await screen.findAllByText(/categoryProducts\.createHere/)).length).toBeGreaterThan(0);
  });

  it('does NOT show the create button for a display-only category (no domain)', async () => {
    renderPanel(category({ domain: '' }));
    await screen.findByText('categoryProducts.noProducts');
    expect(screen.queryByText('categoryProducts.createHere')).toBeNull();
  });

  it('both الخضروات and الفواكه (sharing produce domain) expose creation with no per-category branch', async () => {
    const renderedA = renderPanel(category({ domain: 'produce', nameAr: 'الخضروات', slug: 'vegetables' }));
    expect((await renderedA.findAllByText(/categoryProducts\.createHere/)).length).toBeGreaterThan(0);
    renderedA.unmount();

    const renderedB = renderPanel(category({ domain: 'produce', nameAr: 'الفواكه', slug: 'fruits' }));
    expect((await renderedB.findAllByText(/categoryProducts\.createHere/)).length).toBeGreaterThan(0);
  });

  it('renders the produce form and, on submit, creates the listing and auto-binds it to the category', async () => {
    renderPanel(category({ domain: 'produce' }));
    await screen.findAllByText(/categoryProducts\.createHere/);
    fireEvent.click(screen.getAllByText(/categoryProducts\.createHere/)[0]!);

    const nameInput = screen.getByLabelText(/اسم المنتج/);
    fireEvent.change(nameInput, { target: { value: 'طماطم' } });
    fireEvent.change(screen.getByLabelText(/المدينة/), { target: { value: 'الجزائر' } });
    fireEvent.change(screen.getByLabelText(/السعر/), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText(/الكمية/), { target: { value: '5' } });
    fireEvent.click(screen.getByText(/نشر فوراً/));

    fireEvent.click(screen.getByText('حفظ المنتج'));

    await waitFor(() =>
      expect(MOCK.createListing).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'produce', model: 'طماطم' }),
      ),
    );
    await waitFor(() => expect(MOCK.assign).toHaveBeenCalledWith('c', ['created-1']));
    await waitFor(() => expect(MOCK.list).toHaveBeenCalled());
  });

  it('exposes creation for car and property domains via their domain-specific forms', async () => {
    renderPanel(category({ domain: 'car' }));
    await screen.findAllByText(/categoryProducts\.createHere/);
    fireEvent.click(screen.getAllByText(/categoryProducts\.createHere/)[0]!);
    expect(await screen.findByText('categoryProducts.newProduct')).toBeTruthy();
  });

  it('exposes the phone catalog flow for a phone-domain category (legacy path intact)', async () => {
    renderPanel(category({ domain: 'phone' }));
    await screen.findAllByText(/categoryProducts\.createHere/);
    fireEvent.click(screen.getAllByText(/categoryProducts\.createHere/)[0]!);
    expect(await screen.findByText('categoryProducts.newProduct')).toBeTruthy();
  });

  it('rejects whole-unit quantity violations without creating a listing', async () => {
    renderPanel(category({ domain: 'produce' }));
    await screen.findAllByText(/categoryProducts\.createHere/);
    fireEvent.click(screen.getAllByText(/categoryProducts\.createHere/)[0]!);

    fireEvent.change(screen.getByLabelText(/اسم المنتج/), { target: { value: 'تفاح' } });
    fireEvent.change(screen.getByLabelText(/الكمية/), { target: { value: '1.5' } });
    fireEvent.click(screen.getByText('حفظ المنتج'));

    await screen.findByText(/الكمية يجب أن تكون/);
    expect(MOCK.createListing).not.toHaveBeenCalled();
    expect(MOCK.assign).not.toHaveBeenCalled();
  });
});

describe('stale category → refresh → domain="produce" → Add Product appears (derive-by-id)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK.list.mockResolvedValue([]);
    MOCK.assign.mockResolvedValue(1);
    MOCK.createListing.mockResolvedValue('created-1');
  });

  // Mirrors the fixed CategoriesAdminScreen data-flow: the open panel is NOT fed
  // a captured object. We keep `productsCategoryId` and derive the live category
  // from the CURRENT `categories` state by id, so a refresh that mutates the
  // category's `domain` re-renders the already-open panel with the new value.
  function LiveAdminHarness() {
    const [categories, setCategories] = useState<Category[]>([
      category({ id: 'veg', slug: 'vegetables', nameAr: 'الخضروات', domain: '' }),
      category({ id: 'frt', slug: 'fruits', nameAr: 'الفواكه', domain: '' }),
    ]);
    const [productsCategoryId, setProductsCategoryId] = useState<string | null>(null);
    const productsCategory = productsCategoryId
      ? (categories.find((c) => c.id === productsCategoryId) ?? null)
      : null;
    return (
      <div>
        <button onClick={() => setProductsCategoryId('veg')}>open-veg-products</button>
        <button onClick={() => setProductsCategoryId('frt')}>open-frt-products</button>
        <button
          onClick={() =>
            setCategories((prev) =>
              prev.map((c) =>
                c.id === 'veg' || c.id === 'frt'
                  ? { ...c, domain: 'produce' }
                  : c,
              ),
            )
          }
        >
          refresh-to-produce
        </button>
        {productsCategory && (
          <CategoryProductsPanel category={productsCategory} onClose={() => setProductsCategoryId(null)} />
        )}
      </div>
    );
  }

  it('vegetables: open panel while domain="" then refresh to produce shows Add Product → ProduceListingForm', async () => {
    render(<LiveAdminHarness />);

    // 1) initial categories have domain=''
    fireEvent.click(screen.getByText('open-veg-products'));
    expect(await screen.findByText('categoryProducts.noProducts')).toBeTruthy();
    expect(screen.queryByText(/categoryProducts\.createHere/)).toBeNull();

    // 2) refresh updates the categories state to domain='produce'
    fireEvent.click(screen.getByText('refresh-to-produce'));

    // 3) the ALREADY-OPEN panel re-derives domain='produce' → Add Product appears
    await screen.findAllByText(/categoryProducts\.createHere/);

    // 4) clicking it opens the ProduceListingForm
    fireEvent.click((await screen.findAllByText(/categoryProducts\.createHere/))[0]!);
    expect(await screen.findByText('categoryProducts.newProduct')).toBeTruthy();
  });

  it('fruits: same stale → refresh → produce path shows Add Product', async () => {
    render(<LiveAdminHarness />);

    fireEvent.click(screen.getByText('open-frt-products'));
    expect(await screen.findByText('categoryProducts.noProducts')).toBeTruthy();
    expect(screen.queryByText(/categoryProducts\.createHere/)).toBeNull();

    fireEvent.click(screen.getByText('refresh-to-produce'));
    await screen.findAllByText(/categoryProducts\.createHere/);
  });
});

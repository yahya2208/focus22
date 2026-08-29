import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategoryProductsPanel } from '../../screens/admin/CategoryProductsPanel';
import type { Category } from '../../core/categories/types';
import type { CategoryMemberAdmin } from '../../core/categories/membership';
import type { AdminListingsBoard } from '../../domains/listings/adminBoard';
import type { ListingRecord } from '../../domains/listings/types';

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

const MOCK = vi.hoisted(() => {
  const list = vi.fn(async (_categoryId: string): Promise<CategoryMemberAdmin[]> => []);
  const assign = vi.fn(async (_categoryId: string, _productIds: string[]): Promise<number> => 0);
  const remove = vi.fn(async (_categoryId: string, _productId: string): Promise<boolean> => true);
  const setActive = vi.fn(async (_categoryId: string, _productId: string, _active: boolean): Promise<void> => {});
  const setFeatured = vi.fn(async (_categoryId: string, _productId: string, _featured: boolean): Promise<void> => {});
  const reorder = vi.fn(async (_categoryId: string, _items: unknown[]): Promise<void> => {});
  const loadBoard = vi.fn(async (): Promise<AdminListingsBoard> => ({ phones: [], cars: [], properties: [], produce: [] }));
  const getLabel = () => 'Phones';
  return { list, assign, remove, setActive, setFeatured, reorder, loadBoard, getLabel };
});

vi.mock('../../services/category-products-service', () => ({
  adminListCategoryProducts: MOCK.list,
  adminAssignProducts: MOCK.assign,
  adminRemoveProduct: MOCK.remove,
  adminSetMembershipActive: MOCK.setActive,
  adminSetMembershipFeatured: MOCK.setFeatured,
  adminReorderCategoryProducts: MOCK.reorder,
}));
vi.mock('../../domains/listings/adminBoard', () => ({
  loadAdminListingsBoard: MOCK.loadBoard,
}));
vi.mock('../../services/categories-service', () => ({
  getCategoryLabel: () => 'Phones',
}));

const CATEGORY: Category = {
  id: 'c-phones', slug: 'phones', name: 'Phones', nameAr: '', description: '', descriptionAr: '',
  icon: '📱', coverImage: '', parentId: null, sortOrder: 1, isActive: true,
  displayMode: 'phones', theme: 'technology', deliveryAvailable: false, isFeatured: false,
};

const MEMBER: CategoryMemberAdmin = {
  categoryId: 'c-phones', productId: 'p1', sortOrder: 0, isFeatured: false,
  domain: 'phone', brand: 'Apple', model: 'iPhone 15', price: 1200, pricePeriod: 'sale',
  images: [],
  membershipId: 'm1', membershipActive: true, quantity: 3, status: 'in_stock',
  isPublished: true, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

function renderPanel() {
  return render(<CategoryProductsPanel category={CATEGORY} onClose={() => {}} />);
}

describe('CategoryProductsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK.list.mockResolvedValue([]);
    MOCK.loadBoard.mockResolvedValue({ phones: [], cars: [], properties: [], produce: [] });
  });

  it('lists assigned members with their label and domain', async () => {
    MOCK.list.mockResolvedValue([MEMBER]);
    renderPanel();
    expect(await screen.findByText(/Apple/)).toBeTruthy();
    expect(screen.getByText(/iPhone 15/)).toBeTruthy();
    expect(screen.getByText('phone')).toBeTruthy();
  });

  it('remove calls adminRemoveProduct and drops the row from the list', async () => {
    MOCK.list.mockResolvedValue([MEMBER]);
    renderPanel();
    await screen.findByText(/Apple/);
    fireEvent.click(screen.getAllByText('categoryProducts.remove')[0]!);
    await waitFor(() => expect(MOCK.remove).toHaveBeenCalledWith('c-phones', 'p1'));
    await waitFor(() => expect(screen.queryByText(/Apple/)).toBeNull());
  });

  it('active toggle calls adminSetMembershipActive with the inverted flag', async () => {
    MOCK.list.mockResolvedValue([MEMBER]);
    renderPanel();
    await screen.findByText(/Apple/);
    fireEvent.click(screen.getByText('categoryProducts.hideFromPage'));
    await waitFor(() => expect(MOCK.setActive).toHaveBeenCalledWith('c-phones', 'p1', false));
  });

  it('featured toggle calls adminSetMembershipFeatured with the inverted flag', async () => {
    MOCK.list.mockResolvedValue([MEMBER]);
    renderPanel();
    await screen.findByText(/Apple/);
    fireEvent.click(screen.getByText('categoryProducts.featured'));
    await waitFor(() => expect(MOCK.setFeatured).toHaveBeenCalledWith('c-phones', 'p1', true));
  });

  it('assigns a selected candidate via adminAssignProducts', async () => {
    MOCK.list.mockResolvedValue([]);
    const phoneCandidate: ListingRecord = {
      id: 'p9', category: 'phone', brand: 'Samsung', model: 'Galaxy', description: '', color: '',
      city: '', warranty: '', code: '', price: { amount: 800, period: 'sale' },
      conditionGroup: null, quantity: 1, status: 'in_stock', isPublished: true, images: [],
      createdAt: '', updatedAt: '',
    };
    MOCK.loadBoard.mockResolvedValue({ phones: [phoneCandidate], cars: [], properties: [], produce: [] });
    renderPanel();
    await screen.findByText('categoryProducts.noProducts');
    fireEvent.click(screen.getByText(/categoryProducts\.assign/));
    const candidate = await screen.findByText(/Samsung/);
    fireEvent.click(candidate);
    fireEvent.click(screen.getByText('categoryProducts.added'));
    await waitFor(() => expect(MOCK.assign).toHaveBeenCalledWith('c-phones', ['p9']));
  });
});

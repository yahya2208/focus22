import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, setRpcError, resetDefaults, mockChannel, getChannelHandlers } = vi.hoisted(() => {
  let rpcError: { message: string } | null = null;
  let handlers: Record<string, (payload: unknown) => void> = {};
  const mockChannel = vi.fn((_name: string) => ({
    on: (_evt: string, _config: unknown, cb: (payload: unknown) => void) => {
      handlers[_evt] = cb;
      return {
        subscribe: vi.fn(() => mockChannel),
        on: vi.fn(),
      };
    },
  }));
  const mockRpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
    if (rpcError) {
      const err = rpcError;
      rpcError = null;
      return { data: null, error: err };
    }
    switch (fn) {
      case 'category_products_for_category':
        return {
          data: [
            {
              category_id: 'c1', product_id: 'p1', sort_order: 0, is_featured: true,
              domain: 'phone', brand: 'Apple', model: 'iPhone', price: 1200, price_period: 'sale',
              images: ['a.png'],
            },
          ],
          error: null,
        };
      case 'category_products_admin_list':
        return {
          data: [
            {
              membership_id: 'm1', category_id: 'c1', product_id: 'p1', sort_order: 0,
              is_featured: false, membership_active: true, created_at: '2026-01-01', updated_at: '2026-01-01',
              domain: 'car', brand: 'Toyota', model: 'Corolla', quantity: 1, status: 'in_stock', is_published: true,
            },
          ],
          error: null,
        };
      case 'category_products_admin_assign':
        return { data: { added: 2 }, error: null };
      case 'category_products_admin_remove':
        return { data: true, error: null };
      default:
        return { data: null, error: null };
    }
  });
  function setRpcError(message: string) {
    rpcError = { message };
  }
  function getChannelHandlers() {
    return handlers;
  }
  return {
    mockRpc, setRpcError, mockChannel, getChannelHandlers,
    resetDefaults: () => {
      mockRpc.mockClear();
      mockChannel.mockClear();
      handlers = {};
      rpcError = null;
    },
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc, channel: mockChannel }),
}));

import {
  getCategoryMembers,
  adminListCategoryProducts,
  adminAssignProducts,
  adminRemoveProduct,
  adminSetMembershipActive,
  adminSetMembershipFeatured,
  adminReorderCategoryProducts,
  startCategoryProductsRealtime,
  getCategoryProductsInvalidation,
  subscribeCategoryProducts,
  resetCategoryProductsRealtime,
} from '../../services/category-products-service';

describe('category-products-service', () => {
  beforeEach(() => {
    resetDefaults();
  });

  it('maps snake_case public rows to camelCase members', async () => {
    const members = await getCategoryMembers('c1');
    expect(mockRpc).toHaveBeenCalledWith('category_products_for_category', { p_category_id: 'c1' });
    expect(members[0]).toMatchObject({
      categoryId: 'c1', productId: 'p1', sortOrder: 0, isFeatured: true,
      domain: 'phone', brand: 'Apple', model: 'iPhone', price: 1200,
    });
  });

  it('maps admin list rows to CategoryMemberAdmin with membership state', async () => {
    const rows = await adminListCategoryProducts('c1');
    expect(rows[0]).toMatchObject({
      membershipId: 'm1', membershipActive: true, domain: 'car', status: 'in_stock', isPublished: true,
    });
  });

  it('assign sends a uuid array and returns the added count', async () => {
    const added = await adminAssignProducts('c1', ['p1', 'p2']);
    expect(mockRpc).toHaveBeenCalledWith('category_products_admin_assign', {
      p_category_id: 'c1', p_product_ids: ['p1', 'p2'],
    });
    expect(added).toBe(2);
  });

  it('remove returns boolean', async () => {
    await expect(adminRemoveProduct('c1', 'p1')).resolves.toBe(true);
  });

  it('set active/featured send the boolean flags', async () => {
    await adminSetMembershipActive('c1', 'p1', false);
    expect(mockRpc).toHaveBeenCalledWith('category_products_admin_set_active', {
      p_category_id: 'c1', p_product_id: 'p1', p_active: false,
    });
    await adminSetMembershipFeatured('c1', 'p1', true);
    expect(mockRpc).toHaveBeenCalledWith('category_products_admin_set_featured', {
      p_category_id: 'c1', p_product_id: 'p1', p_featured: true,
    });
  });

  it('reorder sends a snake_case items payload', async () => {
    await adminReorderCategoryProducts('c1', [{ productId: 'p1', sortOrder: 2 }, { productId: 'p2', sortOrder: 1 }]);
    expect(mockRpc).toHaveBeenCalledWith('category_products_admin_reorder', {
      p_category_id: 'c1',
      p_items: [
        { product_id: 'p1', sort_order: 2 },
        { product_id: 'p2', sort_order: 1 },
      ],
    });
  });

  it('maps ADMIN_REQUIRED server errors to a stable sentinel', async () => {
    setRpcError('ADMIN_REQUIRED');
    await expect(adminAssignProducts('c1', ['p1'])).rejects.toThrow('ADMIN_REQUIRED');
  });

  it('maps MEMBERSHIP_NOT_FOUND server errors to a stable sentinel', async () => {
    setRpcError('MEMBERSHIP_NOT_FOUND');
    await expect(adminSetMembershipActive('c1', 'p1', true)).rejects.toThrow('MEMBERSHIP_NOT_FOUND');
  });

  it('subscribes to the category_products postgres_changes channel', () => {
    resetCategoryProductsRealtime();
    startCategoryProductsRealtime();
    expect(mockChannel).toHaveBeenCalledWith('category-products-realtime');
  });

  it('bumps the invalidation revision and notifies listeners on a change event', () => {
    resetCategoryProductsRealtime();
    startCategoryProductsRealtime();
    const before = getCategoryProductsInvalidation();
    const listener = vi.fn();
    const unsub = subscribeCategoryProducts(listener);
    const handler = getChannelHandlers().postgres_changes!;
    expect(handler).toBeDefined();
    handler({ eventType: 'INSERT' });
    expect(getCategoryProductsInvalidation()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    handler({ eventType: 'UPDATE' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('starts realtime only once', () => {
    resetCategoryProductsRealtime();
    startCategoryProductsRealtime();
    startCategoryProductsRealtime();
    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('bumps invalidation without a crash when a change event arrives with no listeners', () => {
    resetCategoryProductsRealtime();
    startCategoryProductsRealtime();
    const handler = getChannelHandlers().postgres_changes!;
    handler({ eventType: 'DELETE' });
    expect(getCategoryProductsInvalidation()).toBe(1);
  });
});

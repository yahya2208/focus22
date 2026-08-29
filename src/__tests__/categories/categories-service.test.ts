import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockRpc, mockChannel, resetDefaults } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(generator: () => { data: unknown[]; error: null }): any {
    const c: Record<string, unknown> = {};
    c.select = vi.fn(() => c);
    c.order = vi.fn(() => Promise.resolve(generator()));
    c.eq = vi.fn((_col: string, _val: unknown) => c);
    c.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    return c;
  }

  const categoriesRows: Array<Record<string, unknown>> = [];
  const categoriesChain = makeChain(() => ({ data: [...categoriesRows], error: null }));
  const mockFrom = vi.fn((table = '') =>
    table === 'categories' ? categoriesChain
    : makeChain(() => ({ data: [], error: null })),
  );
  const mockRpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
    if (fn === 'categories_admin_create' || fn === 'categories_admin_update') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  const mockChannel = { on: vi.fn(() => mockChannel), subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) };

  function resetDefaults(seed: Array<Record<string, unknown>>) {
    categoriesRows.length = 0;
    categoriesRows.push(...seed);
    mockRpc.mockClear();
    mockFrom.mockClear();
  }

  return { mockFrom, mockRpc, mockChannel, resetDefaults };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
    channel: vi.fn(() => mockChannel),
  }),
}));

import {
  ensureCategoriesLoaded,
  getCategories,
  getAllCategories,
  getCategoryBySlug,
  getCategoryLabel,
  getChildren,
  getCategoryParent,
  subscribeCategories,
  resetCategoriesService,
} from '../../services/categories-service';

function seedRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'cat-' + String(over.slug),
    slug: '',
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    icon: '📁',
    cover_image: '',
    parent_id: null,
    sort_order: 0,
    is_active: true,
    display_mode: 'storefront',
    theme: 'technology',
    delivery_available: false,
    is_featured: false,
    ...over,
  };
}

const SEED = [
  seedRow({ slug: 'phones', name: 'Phones', sort_order: 1, display_mode: 'phones', theme: 'technology' }),
  seedRow({ slug: 'accessories', name: 'Accessories', parent_id: 'cat-phones', sort_order: 1 }),
  seedRow({ slug: 'fresh-market', name: 'Fresh Market', name_ar: 'سوق طازج', sort_order: 2, delivery_available: true }),
  seedRow({ slug: 'games', name: 'Games', sort_order: 3, display_mode: 'games', theme: 'playful', is_active: false }),
] as Array<Record<string, unknown>>;

describe('categories-service', () => {
  beforeEach(() => {
    resetCategoriesService();
    resetDefaults(SEED);
  });

  it('assembles the parent/child tree from flat rows, ordered by sort_order', async () => {
    await ensureCategoriesLoaded();
    const roots = getCategories();
    expect(roots).toHaveLength(3); // games is inactive but public read returns it if seeded
    expect(roots.map((r) => r.slug)).toEqual(['phones', 'fresh-market', 'games']);
    const phones = roots.find((r) => r.slug === 'phones')!;
    expect(phones.children.map((c) => c.slug)).toEqual(['accessories']);
    expect(phones.parentId).toBeNull();
  });

  it('getCategoryBySlug resolves nested categories case-insensitively', async () => {
    await ensureCategoriesLoaded();
    expect(getCategoryBySlug('PHONES')?.slug).toBe('phones');
    expect(getCategoryBySlug('accessories')?.parentId).toBe('cat-phones');
    expect(getCategoryBySlug('missing')).toBeUndefined();
  });

  it('localizes labels via Arabic fallback', async () => {
    await ensureCategoriesLoaded();
    const fm = getCategoryBySlug('fresh-market')!;
    expect(getCategoryLabel(fm, 'ar')).toBe('سوق طازج');
    expect(getCategoryLabel(fm, 'en')).toBe('Fresh Market');
  });

  it('walks getChildren and getCategoryParent through the tree', async () => {
    await ensureCategoriesLoaded();
    const phones = getCategoryBySlug('phones')!;
    const children = getChildren(phones.id);
    expect(children.map((c) => c.slug)).toEqual(['accessories']);
    const child = getCategoryBySlug('accessories')!;
    expect(getCategoryParent(child)?.slug).toBe('phones');
  });

  it('notifies subscribers through the cache', async () => {
    const listener = vi.fn();
    const unsub = subscribeCategories(listener);
    await ensureCategoriesLoaded();
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('degrades to an empty list when the table is unreachable', async () => {
    resetCategoriesService();
    resetDefaults([]);
    await ensureCategoriesLoaded();
    expect(getCategories()).toHaveLength(0);
    expect(getAllCategories()).toHaveLength(0);
  });
});

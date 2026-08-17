/**
 * P3-B — Search / Filter UI Logic Tests
 *
 * Tests the client-side filter state machine for the catalog search bar:
 *   - Search text filtering
 *   - Brand dropdown filtering
 *   - Approval status filtering
 *   - has_variants toggle
 *   - Filter reset behavior
 *   - Empty state handling
 *
 * Pure unit tests. No database connection, no React rendering.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

interface CatalogFilters {
  search: string;
  brand: string;
  approval: string;
  has_variants: boolean | null;
  page: number;
}

interface ModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  status: string;
  approval_status: string;
  variant_count: number;
  updated_at: string;
}

const EMPTY_FILTERS: CatalogFilters = {
  search: '',
  brand: '',
  approval: 'draft',
  has_variants: null,
  page: 1,
};

// ─── Filter Logic ────────────────────────────────────────────────────────────

function applyFilters(models: ModelRow[], filters: CatalogFilters): ModelRow[] {
  let result = [...models];

  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (m) => m.name.toLowerCase().includes(q) || m.canonical_id.toLowerCase().includes(q),
    );
  }

  if (filters.brand) {
    result = result.filter((m) => m.brand_id === filters.brand);
  }

  if (filters.approval) {
    result = result.filter((m) => m.approval_status === filters.approval);
  }

  if (filters.has_variants === true) {
    result = result.filter((m) => m.variant_count > 0);
  }

  return result;
}

function updateFilters(prev: CatalogFilters, partial: Partial<CatalogFilters>): CatalogFilters {
  const next = { ...prev, ...partial };
  if (partial.search !== undefined || partial.brand !== undefined || partial.approval !== undefined || partial.has_variants !== undefined) {
    next.page = 1;
  }
  return next;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MODELS: ModelRow[] = [
  { id: '1', canonical_id: 'iphone-15-pro', brand_id: 'apple', name: 'iPhone 15 Pro', status: 'active', approval_status: 'draft', variant_count: 3, updated_at: '2024-01-01' },
  { id: '2', canonical_id: 'iphone-15', brand_id: 'apple', name: 'iPhone 15', status: 'active', approval_status: 'approved', variant_count: 0, updated_at: '2024-01-02' },
  { id: '3', canonical_id: 'galaxy-s24', brand_id: 'samsung', name: 'Galaxy S24', status: 'active', approval_status: 'draft', variant_count: 2, updated_at: '2024-01-03' },
  { id: '4', canonical_id: 'galaxy-s24-ultra', brand_id: 'samsung', name: 'Galaxy S24 Ultra', status: 'active', approval_status: 'rejected', variant_count: 5, updated_at: '2024-01-04' },
  { id: '5', canonical_id: 'pixel-8', brand_id: 'google', name: 'Pixel 8', status: 'active', approval_status: 'draft', variant_count: 0, updated_at: '2024-01-05' },
  { id: '6', canonical_id: 'oneplus-12', brand_id: 'oneplus', name: 'OnePlus 12', status: 'active', approval_status: 'draft', variant_count: 1, updated_at: '2024-01-06' },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P3-B Search Logic', () => {
  it('search by name filters correctly', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, approval: '', search: 'iPhone' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.name.includes('iPhone'))).toBe(true);
  });

  it('search by canonical_id filters correctly', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, approval: '', search: 'galaxy' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.canonical_id.includes('galaxy'))).toBe(true);
  });

  it('search is case-insensitive', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, approval: '', search: 'PIXEL' });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Pixel 8');
  });

  it('brand dropdown filters correctly', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, approval: '', brand: 'samsung' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.brand_id === 'samsung')).toBe(true);
  });

  it('approval status filter works', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, approval: 'approved' });
    expect(result).toHaveLength(1);
    expect(result[0]!.approval_status).toBe('approved');
  });

  it('has_variants toggle filters correctly', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, approval: '', has_variants: true });
    expect(result).toHaveLength(4);
    expect(result.every((m) => m.variant_count > 0)).toBe(true);
  });

  it('empty search restores full list for approval filter', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, search: '' });
    expect(result).toHaveLength(4);
    expect(result.every((m) => m.approval_status === 'draft')).toBe(true);
  });
});

describe('P3-B Filter State Machine', () => {
  it('search change resets page to 1', () => {
    const next = updateFilters({ ...EMPTY_FILTERS, page: 5 }, { search: 'test' });
    expect(next.page).toBe(1);
  });

  it('brand change resets page to 1', () => {
    const next = updateFilters({ ...EMPTY_FILTERS, page: 3 }, { brand: 'apple' });
    expect(next.page).toBe(1);
  });

  it('approval change resets page to 1', () => {
    const next = updateFilters({ ...EMPTY_FILTERS, page: 7 }, { approval: 'rejected' });
    expect(next.page).toBe(1);
  });

  it('page change does NOT reset page', () => {
    const next = updateFilters({ ...EMPTY_FILTERS, page: 3 }, { page: 4 });
    expect(next.page).toBe(4);
  });

  it('combined filter change resets page', () => {
    const next = updateFilters(
      { ...EMPTY_FILTERS, page: 10 },
      { search: 'test', brand: 'apple', approval: 'draft' },
    );
    expect(next.page).toBe(1);
  });
});

describe('P3-B Empty State', () => {
  it('empty model list returns empty', () => {
    const result = applyFilters([], EMPTY_FILTERS);
    expect(result).toHaveLength(0);
  });

  it('no matches returns empty', () => {
    const result = applyFilters(MODELS, { ...EMPTY_FILTERS, search: 'nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('all filters combined narrow correctly', () => {
    const result = applyFilters(MODELS, {
      ...EMPTY_FILTERS,
      search: 'galaxy',
      brand: 'samsung',
      approval: 'draft',
      has_variants: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Galaxy S24');
  });
});

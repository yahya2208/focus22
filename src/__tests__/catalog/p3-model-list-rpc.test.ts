/**
 * P3-A — Model List (list variants) RPC Tests
 *
 * Tests the P3 signature change for catalog_admin_list_variants:
 *   - Old: (p_status text DEFAULT NULL)
 *   - New: (p_status text DEFAULT NULL, p_model_id uuid DEFAULT NULL)
 *
 * Validates:
 *   - No filter → all variants
 *   - Status filter only
 *   - Model filter only (NEW)
 *   - Status + model filter combined (NEW)
 *   - Empty status string treated as NULL
 *   - Empty model_id treated as NULL
 *   - Ordering (newest first)
 *   - Edge cases: no matches
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

interface VariantRow {
  id: string;
  canonical_variant_id: string;
  model_id: string;
  status: string;
  created_at: string;
}

interface ListFilters {
  status?: string | null;
  model_id?: string | null;
}

function listVariants(variants: VariantRow[], filters: ListFilters): VariantRow[] {
  let result = [...variants];

  // Status filter
  const statusFilter = filters.status?.trim();
  if (statusFilter) {
    result = result.filter((v) => v.status === statusFilter);
  }

  // Model filter
  const modelFilter = filters.model_id?.trim();
  if (modelFilter) {
    result = result.filter((v) => v.model_id === modelFilter);
  }

  // Order newest first
  result.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return result;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ALL_VARIANTS: VariantRow[] = [
  { id: 'v1', canonical_variant_id: 'apple__iphone-16__8gb256gb', model_id: 'm1', status: 'known', created_at: '2026-08-01T00:00:00Z' },
  { id: 'v2', canonical_variant_id: 'apple__iphone-16__12gb512gb', model_id: 'm1', status: 'verified', created_at: '2026-08-02T00:00:00Z' },
  { id: 'v3', canonical_variant_id: 'samsung__galaxy-s25__8gb256gb', model_id: 'm2', status: 'known', created_at: '2026-08-03T00:00:00Z' },
  { id: 'v4', canonical_variant_id: 'samsung__galaxy-s25__12gb512gb', model_id: 'm2', status: 'archived', created_at: '2026-08-04T00:00:00Z' },
  { id: 'v5', canonical_variant_id: 'apple__iphone-16-pro__8gb256gb', model_id: 'm3', status: 'known', created_at: '2026-08-05T00:00:00Z' },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P3 model list — no filter', () => {
  it('returns all variants when no filters applied', () => {
    const result = listVariants(ALL_VARIANTS, {});
    expect(result.length).toBe(5);
  });

  it('returns all variants when both filters are null', () => {
    const result = listVariants(ALL_VARIANTS, { status: null, model_id: null });
    expect(result.length).toBe(5);
  });

  it('returns all variants when both filters are empty strings', () => {
    const result = listVariants(ALL_VARIANTS, { status: '', model_id: '' });
    expect(result.length).toBe(5);
  });
});

describe('P3 model list — status filter only', () => {
  it('filters by status = known', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'known' });
    expect(result.length).toBe(3);
    expect(result.every((v) => v.status === 'known')).toBe(true);
  });

  it('filters by status = verified', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'verified' });
    expect(result.length).toBe(1);
    expect(result[0]?.status).toBe('verified');
  });

  it('filters by status = archived', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'archived' });
    expect(result.length).toBe(1);
  });

  it('returns empty for non-existent status', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'bogus' });
    expect(result.length).toBe(0);
  });
});

describe('P3 model list — model filter only (NEW in P3)', () => {
  it('filters by model_id = m1 (apple iphone 16)', () => {
    const result = listVariants(ALL_VARIANTS, { model_id: 'm1' });
    expect(result.length).toBe(2);
    expect(result.every((v) => v.model_id === 'm1')).toBe(true);
  });

  it('filters by model_id = m2 (samsung galaxy s25)', () => {
    const result = listVariants(ALL_VARIANTS, { model_id: 'm2' });
    expect(result.length).toBe(2);
  });

  it('filters by model_id = m3 (apple iphone 16 pro)', () => {
    const result = listVariants(ALL_VARIANTS, { model_id: 'm3' });
    expect(result.length).toBe(1);
  });

  it('returns empty for non-existent model_id', () => {
    const result = listVariants(ALL_VARIANTS, { model_id: 'nonexistent' });
    expect(result.length).toBe(0);
  });
});

describe('P3 model list — combined filters', () => {
  it('filters by status = known AND model_id = m1', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'known', model_id: 'm1' });
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe('v1');
  });

  it('filters by status = known AND model_id = m2', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'known', model_id: 'm2' });
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe('v3');
  });

  it('returns empty when combined filters match no rows', () => {
    const result = listVariants(ALL_VARIANTS, { status: 'verified', model_id: 'm2' });
    expect(result.length).toBe(0);
  });
});

describe('P3 model list — ordering', () => {
  it('returns newest first by created_at', () => {
    const result = listVariants(ALL_VARIANTS, { model_id: 'm1' });
    expect((result[0]?.created_at ?? '') >= (result[1]?.created_at ?? '')).toBe(true);
  });
});

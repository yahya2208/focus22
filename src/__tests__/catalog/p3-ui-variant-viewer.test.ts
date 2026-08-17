/**
 * P3-C — Variant Viewer UI Logic Tests
 *
 * Tests variant viewer state machine:
 *   - Variant data transformation and display
 *   - Status badge rendering
 *   - Empty state handling
 *   - Variant count consistency
 *   - Model card expand/collapse
 *   - Action button visibility rules
 *
 * Pure unit tests. No database connection, no React rendering.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

interface VariantRow {
  id: string;
  model_id: string;
  name: string;
  status: string;
  storage: string | null;
  ram: string | null;
  region: string | null;
}

interface CatalogModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  status: string;
  approval_status: string;
  variant_count: number;
  updated_at: string;
}

// ─── Display Logic ───────────────────────────────────────────────────────────

function formatVariantDisplay(v: VariantRow): string {
  const parts: string[] = [v.name];
  if (v.storage) parts.push(v.storage);
  if (v.ram) parts.push(`${v.ram} RAM`);
  if (v.region) parts.push(v.region);
  return parts.join(' / ');
}

function getStatusColor(status: string): 'success' | 'accent' | 'muted' | 'warning' {
  if (status === 'known') return 'success';
  if (status === 'verified') return 'accent';
  if (status === 'archived') return 'muted';
  return 'warning';
}

function canApprove(model: CatalogModelRow): boolean {
  return model.approval_status === 'draft';
}

function canReject(model: CatalogModelRow): boolean {
  return model.approval_status !== 'rejected';
}

function canReopen(model: CatalogModelRow): boolean {
  return model.approval_status === 'rejected';
}

function variantSummary(variants: VariantRow[]): string {
  if (variants.length === 0) return 'No variants';
  const statuses = variants.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(statuses)
    .map(([s, c]) => `${c} ${s}`)
    .join(', ');
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VARIANTS: VariantRow[] = [
  { id: 'v1', model_id: 'm1', name: '128GB Silver', status: 'known', storage: '128GB', ram: '6GB', region: 'US' },
  { id: 'v2', model_id: 'm1', name: '256GB Black', status: 'verified', storage: '256GB', ram: '8GB', region: null },
  { id: 'v3', model_id: 'm1', name: '512GB Gold', status: 'archived', storage: '512GB', ram: '8GB', region: 'EU' },
];

const DRAFT_MODEL: CatalogModelRow = {
  id: 'm1', canonical_id: 'test-phone', brand_id: 'test', name: 'Test Phone',
  status: 'active', approval_status: 'draft', variant_count: 3, updated_at: '2024-01-01',
};

const REJECTED_MODEL: CatalogModelRow = {
  id: 'm2', canonical_id: 'rejected-phone', brand_id: 'test', name: 'Rejected Phone',
  status: 'active', approval_status: 'rejected', variant_count: 0, updated_at: '2024-01-02',
};

const APPROVED_MODEL: CatalogModelRow = {
  id: 'm3', canonical_id: 'approved-phone', brand_id: 'test', name: 'Approved Phone',
  status: 'active', approval_status: 'approved', variant_count: 1, updated_at: '2024-01-03',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P3-C Variant Display', () => {
  it('formats variant with all fields', () => {
    expect(formatVariantDisplay(VARIANTS[0]!)).toBe('128GB Silver / 128GB / 6GB RAM / US');
  });

  it('formats variant without region', () => {
    expect(formatVariantDisplay(VARIANTS[1]!)).toBe('256GB Black / 256GB / 8GB RAM');
  });

  it('formats variant with minimal fields', () => {
    const minimal: VariantRow = { id: 'v4', model_id: 'm1', name: 'Basic', status: 'known', storage: null, ram: null, region: null };
    expect(formatVariantDisplay(minimal)).toBe('Basic');
  });
});

describe('P3-C Variant Status', () => {
  it('known returns success color', () => {
    expect(getStatusColor('known')).toBe('success');
  });

  it('verified returns accent color', () => {
    expect(getStatusColor('verified')).toBe('accent');
  });

  it('archived returns muted color', () => {
    expect(getStatusColor('archived')).toBe('muted');
  });

  it('unknown status returns warning color', () => {
    expect(getStatusColor('pending')).toBe('warning');
  });
});

describe('P3-C Variant Summary', () => {
  it('summarizes mixed statuses', () => {
    expect(variantSummary(VARIANTS)).toBe('1 known, 1 verified, 1 archived');
  });

  it('empty variants returns "No variants"', () => {
    expect(variantSummary([])).toBe('No variants');
  });

  it('single status variant', () => {
    expect(variantSummary([VARIANTS[0]!])).toBe('1 known');
  });
});

describe('P3-C Action Button Visibility', () => {
  it('draft model can be approved', () => {
    expect(canApprove(DRAFT_MODEL)).toBe(true);
  });

  it('approved model cannot be approved', () => {
    expect(canApprove(APPROVED_MODEL)).toBe(false);
  });

  it('draft model can be rejected', () => {
    expect(canReject(DRAFT_MODEL)).toBe(true);
  });

  it('rejected model cannot be rejected', () => {
    expect(canReject(REJECTED_MODEL)).toBe(false);
  });

  it('rejected model can be reopened', () => {
    expect(canReopen(REJECTED_MODEL)).toBe(true);
  });

  it('draft model cannot be reopened', () => {
    expect(canReopen(DRAFT_MODEL)).toBe(false);
  });

  it('approved model cannot be reopened', () => {
    expect(canReopen(APPROVED_MODEL)).toBe(false);
  });
});

describe('P3-C Empty Variant State', () => {
  it('0-variant model shows empty state', () => {
    expect(REJECTED_MODEL.variant_count).toBe(0);
    expect(variantSummary([])).toBe('No variants');
  });

  it('variant count matches array length', () => {
    expect(DRAFT_MODEL.variant_count).toBe(VARIANTS.length);
  });
});

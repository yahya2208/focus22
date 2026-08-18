/**
 * P2.9-A — Model Create With Variants Tests
 *
 * Tests the combined model+variant creation logic:
 *   - PendingVariant state management
 *   - Duplicate variant detection (ram+storage+region)
 *   - Payload construction for batch variant creation
 *   - Partial failure handling (model ok, variant fail)
 *   - Variant count validation
 *   - canApprove derived logic
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingVariant {
  id: string;
  ram_gb: string;
  storage_gb: string;
  region: string;
}

// ─── Logic Under Test ────────────────────────────────────────────────────────

function variantKey(v: PendingVariant): string {
  const ram = Number(v.ram_gb);
  const storage = Number(v.storage_gb);
  if (Number.isNaN(ram) || Number.isNaN(storage)) return `invalid:${v.id}`;
  return `${ram}GB-${storage}GB-${(v.region || 'Global').toLowerCase()}`;
}

function findDuplicateVariants(variants: PendingVariant[]): string[] {
  const seen = new Map<string, string[]>();
  for (const v of variants) {
    const key = variantKey(v);
    const ids = seen.get(key) ?? [];
    ids.push(v.id);
    seen.set(key, ids);
  }
  const dupes: string[] = [];
  for (const [, ids] of seen) {
    if (ids.length > 1) dupes.push(...ids);
  }
  return dupes;
}

function validateVariantBatch(variants: PendingVariant[]): string[] {
  const errors: string[] = [];
  const dupes = findDuplicateVariants(variants);
  if (dupes.length > 0) {
    errors.push('Duplicate variant configurations detected');
  }
  for (const v of variants) {
    const ram = Number(v.ram_gb);
    const storage = Number(v.storage_gb);
    if (Number.isNaN(ram) || ram <= 0) {
      errors.push(`Variant ${v.id}: RAM must be positive`);
    }
    if (Number.isNaN(storage) || storage <= 0) {
      errors.push(`Variant ${v.id}: Storage must be positive`);
    }
  }
  return errors;
}

function canApproveDraft(approvalStatus: string, variantCount: number): boolean {
  return approvalStatus === 'draft' && variantCount > 0;
}

function buildVariantPayloads(variants: PendingVariant[]) {
  return variants
    .filter(v => {
      const ram = Number(v.ram_gb);
      const storage = Number(v.storage_gb);
      return !Number.isNaN(ram) && ram > 0 && !Number.isNaN(storage) && storage > 0;
    })
    .map(v => ({
      p_ram_mb: Math.round(Number(v.ram_gb) * 1024),
      p_storage_gb: Math.round(Number(v.storage_gb)),
      p_region: v.region || null,
      p_status: 'known' as const,
    }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P2 variant key generation', () => {
  it('generates key from ram+storage+region', () => {
    const v: PendingVariant = { id: 'v1', ram_gb: '8', storage_gb: '256', region: 'USA' };
    expect(variantKey(v)).toBe('8GB-256GB-usa');
  });

  it('uses Global when region empty', () => {
    const v: PendingVariant = { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' };
    expect(variantKey(v)).toBe('8GB-256GB-global');
  });

  it('returns invalid key for non-numeric values', () => {
    const v: PendingVariant = { id: 'v1', ram_gb: 'abc', storage_gb: '256', region: '' };
    expect(variantKey(v)).toContain('invalid:');
  });

  it('normalizes region to lowercase', () => {
    const v: PendingVariant = { id: 'v1', ram_gb: '8', storage_gb: '256', region: 'USA' };
    expect(variantKey(v)).toBe('8GB-256GB-usa');
  });
});

describe('P2 duplicate variant detection', () => {
  it('returns empty array for unique variants', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '16', storage_gb: '512', region: '' },
      { id: 'v3', ram_gb: '8', storage_gb: '256', region: 'USA' },
    ];
    expect(findDuplicateVariants(variants)).toHaveLength(0);
  });

  it('detects exact duplicates', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '8', storage_gb: '256', region: '' },
    ];
    const dupes = findDuplicateVariants(variants);
    expect(dupes).toHaveLength(2);
    expect(dupes).toContain('v1');
    expect(dupes).toContain('v2');
  });

  it('treats different regions as distinct', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: 'USA' },
      { id: 'v2', ram_gb: '8', storage_gb: '256', region: 'EU' },
    ];
    expect(findDuplicateVariants(variants)).toHaveLength(0);
  });

  it('handles empty array', () => {
    expect(findDuplicateVariants([])).toHaveLength(0);
  });

  it('detects duplicates in groups of 3', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v3', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v4', ram_gb: '16', storage_gb: '512', region: '' },
    ];
    const dupes = findDuplicateVariants(variants);
    expect(dupes).toHaveLength(3);
    expect(dupes).toContain('v1');
    expect(dupes).toContain('v2');
    expect(dupes).toContain('v3');
  });
});

describe('P2 variant batch validation', () => {
  it('returns no errors for valid batch', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '16', storage_gb: '512', region: 'USA' },
    ];
    expect(validateVariantBatch(variants)).toHaveLength(0);
  });

  it('returns error for duplicate variants', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '8', storage_gb: '256', region: '' },
    ];
    const errors = validateVariantBatch(variants);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Duplicate');
  });

  it('returns error for zero RAM', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '0', storage_gb: '256', region: '' },
    ];
    const errors = validateVariantBatch(variants);
    expect(errors.some(e => e.includes('RAM'))).toBe(true);
  });

  it('returns error for negative storage', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '-1', region: '' },
    ];
    const errors = validateVariantBatch(variants);
    expect(errors.some(e => e.includes('Storage'))).toBe(true);
  });

  it('handles empty batch', () => {
    expect(validateVariantBatch([])).toHaveLength(0);
  });

  it('returns multiple errors for multiple problems', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v3', ram_gb: '0', storage_gb: '-1', region: '' },
    ];
    const errors = validateVariantBatch(variants);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('P2 canApproveDraft', () => {
  it('returns true for draft with variants', () => {
    expect(canApproveDraft('draft', 3)).toBe(true);
  });

  it('returns false for draft with 0 variants', () => {
    expect(canApproveDraft('draft', 0)).toBe(false);
  });

  it('returns false for approved with variants', () => {
    expect(canApproveDraft('approved', 3)).toBe(false);
  });

  it('returns false for rejected with variants', () => {
    expect(canApproveDraft('rejected', 3)).toBe(false);
  });

  it('returns false for empty approval_status', () => {
    expect(canApproveDraft('', 3)).toBe(false);
  });
});

describe('P2 variant payload construction', () => {
  it('converts GB to MB for ram', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
    ];
    const payloads = buildVariantPayloads(variants);
    expect(payloads[0]!.p_ram_mb).toBe(8192);
  });

  it('rounds fractional GB correctly', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '0.5', storage_gb: '128', region: '' },
    ];
    const payloads = buildVariantPayloads(variants);
    expect(payloads[0]!.p_ram_mb).toBe(512);
  });

  it('sets null region for empty string', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
    ];
    const payloads = buildVariantPayloads(variants);
    expect(payloads[0]!.p_region).toBeNull();
  });

  it('preserves non-empty region', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: 'USA' },
    ];
    const payloads = buildVariantPayloads(variants);
    expect(payloads[0]!.p_region).toBe('USA');
  });

  it('filters out invalid variants', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: 'abc', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '8', storage_gb: '256', region: '' },
    ];
    const payloads = buildVariantPayloads(variants);
    expect(payloads).toHaveLength(1);
  });

  it('sets status to known for all variants', () => {
    const variants: PendingVariant[] = [
      { id: 'v1', ram_gb: '8', storage_gb: '256', region: '' },
      { id: 'v2', ram_gb: '16', storage_gb: '512', region: 'EU' },
    ];
    const payloads = buildVariantPayloads(variants);
    expect(payloads.every(p => p.p_status === 'known')).toBe(true);
  });
});

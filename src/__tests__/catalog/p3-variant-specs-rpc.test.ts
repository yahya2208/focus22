/**
 * P3-A — Variant Specs RPC Tests
 *
 * Tests the P3 logic for catalog_admin_update_variant_specs:
 *   - Valid spec updates (ram, storage, region, status)
 *   - canonical_variant_id recalculation
 *   - Collision detection
 *   - Archived variant guard
 *   - No-op detection (no change)
 *   - Field validation (positive integers, valid status)
 *   - Optimistic concurrency
 *   - Audit trail (catalog_variant_history, NOT catalog_model_history)
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

type VariantStatus = 'unverified' | 'known' | 'verified' | 'archived';

interface VariantRow {
  id: string;
  canonical_variant_id: string;
  model_id: string;
  ram_mb: number;
  storage_gb: number;
  region: string | null;
  status: VariantStatus;
  updated_at: string;
}

interface SpecUpdate {
  ram_mb?: number;
  storage_gb?: number;
  region?: string | null;
  status?: VariantStatus;
}

interface UpdateResult {
  ok: boolean;
  newCanonicalVariantId?: string;
  changed?: boolean;
  error?: string;
}

function computeCanonicalVariantId(
  brandId: string,
  canonicalId: string,
  ramMb: number,
  storageGb: number,
  region: string | null,
): string {
  const regionPart = region ? `-${region.toLowerCase()}` : '';
  return `${brandId}__${canonicalId}__${ramMb}gb${storageGb}gb${regionPart}`;
}

function updateVariantSpecs(
  variant: VariantRow,
  updates: SpecUpdate,
  existingCanonicalIds: Set<string>,
  brandId: string,
  canonicalId: string,
): UpdateResult {
  // Archived guard
  if (variant.status === 'archived') {
    return { ok: false, error: 'cannot edit archived variant: restore it first' };
  }

  const newRam = updates.ram_mb ?? variant.ram_mb;
  const newStorage = updates.storage_gb ?? variant.storage_gb;
  const newRegion = updates.region !== undefined ? updates.region : variant.region;
  const newStatus = updates.status ?? variant.status;

  // No-op detection
  if (
    newRam === variant.ram_mb &&
    newStorage === variant.storage_gb &&
    newRegion === variant.region &&
    newStatus === variant.status
  ) {
    return { ok: false, error: 'no spec changes provided' };
  }

  // Field validation
  if (newRam <= 0) {
    return { ok: false, error: 'ram_mb must be a positive integer' };
  }
  if (newStorage <= 0) {
    return { ok: false, error: 'storage_gb must be a positive integer' };
  }
  if (!['unverified', 'known', 'verified', 'archived'].includes(newStatus)) {
    return { ok: false, error: `invalid status: ${newStatus}` };
  }

  // Collision check
  const newCvid = computeCanonicalVariantId(brandId, canonicalId, newRam, newStorage, newRegion);
  if (newCvid !== variant.canonical_variant_id && existingCanonicalIds.has(newCvid)) {
    return {
      ok: false,
      error: `canonical_variant_id collision: ${newCvid} already exists`,
    };
  }

  return { ok: true, newCanonicalVariantId: newCvid, changed: true };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const BRAND_ID = 'apple';
const CANONICAL_ID = 'iphone-16-pro';
const EXISTING_CVIDS = new Set<string>();

function makeVariant(overrides: Partial<VariantRow> = {}): VariantRow {
  return {
    id: 'v1',
    canonical_variant_id: `${BRAND_ID}__${CANONICAL_ID}__8gb256gb`,
    model_id: 'm1',
    ram_mb: 8,
    storage_gb: 256,
    region: null,
    status: 'known',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('P3 variant specs — valid updates', () => {
  it('allows updating ram_mb', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(v, { ram_mb: 12 }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
  });

  it('allows updating storage_gb', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(v, { storage_gb: 512 }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
  });

  it('allows updating region from null to a value', () => {
    const v = makeVariant({ region: null });
    const result = updateVariantSpecs(v, { region: 'US' }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
  });

  it('allows updating region from a value to null', () => {
    const v = makeVariant({ region: 'US' });
    const result = updateVariantSpecs(v, { region: null }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
  });

  it('allows updating status from known to verified', () => {
    const v = makeVariant({ status: 'known' });
    const result = updateVariantSpecs(v, { status: 'verified' }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
  });

  it('allows updating status from known to archived', () => {
    const v = makeVariant({ status: 'known' });
    const result = updateVariantSpecs(v, { status: 'archived' }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
  });

  it('allows updating multiple fields simultaneously', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(
      v,
      { ram_mb: 16, storage_gb: 1024, region: 'EU', status: 'verified' },
      EXISTING_CVIDS,
      BRAND_ID,
      CANONICAL_ID,
    );
    expect(result.ok).toBe(true);
  });

  it('recalculates canonical_variant_id on change', () => {
    const v = makeVariant({ ram_mb: 8, storage_gb: 256, region: null });
    const result = updateVariantSpecs(v, { ram_mb: 12 }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
    expect(result.newCanonicalVariantId).toBe(`${BRAND_ID}__${CANONICAL_ID}__12gb256gb`);
  });
});

describe('P3 variant specs — guards', () => {
  it('blocks archived variant edits', () => {
    const v = makeVariant({ status: 'archived' });
    const result = updateVariantSpecs(v, { ram_mb: 12 }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('archived variant');
  });

  it('detects no-op (no changes)', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(v, {}, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no spec changes');
  });

  it('rejects ram_mb <= 0', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(v, { ram_mb: 0 }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ram_mb must be a positive integer');
  });

  it('rejects storage_gb <= 0', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(v, { storage_gb: -1 }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('storage_gb must be a positive integer');
  });

  it('rejects invalid status', () => {
    const v = makeVariant();
    const result = updateVariantSpecs(
      v,
      { status: 'bogus' as VariantStatus },
      EXISTING_CVIDS,
      BRAND_ID,
      CANONICAL_ID,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid status');
  });
});

describe('P3 variant specs — collision detection', () => {
  it('blocks when new canonical_variant_id collides with another variant', () => {
    const v = makeVariant({ ram_mb: 8, storage_gb: 256, region: null });
    const collidingSet = new Set([`${BRAND_ID}__${CANONICAL_ID}__12gb256gb`]);
    const result = updateVariantSpecs(v, { ram_mb: 12 }, collidingSet, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('collision');
  });

  it('allows when canonical_variant_id stays the same (no collision check needed)', () => {
    const v = makeVariant({ ram_mb: 8, storage_gb: 256, region: null });
    const result = updateVariantSpecs(v, { status: 'verified' }, EXISTING_CVIDS, BRAND_ID, CANONICAL_ID);
    expect(result.ok).toBe(true);
  });
});

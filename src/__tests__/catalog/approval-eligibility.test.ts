/**
 * P2 — Approval Eligibility Tests
 *
 * Tests the P2 eligibility filter logic (unchanged from P1, but validated):
 *   - approved + active + ≥1 valid variant → eligible
 *   - draft → excluded
 *   - rejected → excluded
 *   - approved + archived → excluded
 *   - approved + active + 0 variants → excluded
 *   - approved + active + only archived variants → excluded
 *
 * These are pure unit tests that validate the filter logic.
 * They do NOT connect to a live database.
 */

import { describe, it, expect } from 'vitest';

// ─── Eligibility Model ───────────────────────────────────────────────────────

interface DbModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  status: string;
  approval_status: string;
}

interface DbVariantRow {
  canonical_variant_id: string;
  model_id: string;
  ram_mb: number;
  storage_gb: number;
  region: string | null;
  status: string;
}

interface EligibilityResult {
  eligible: DbModelRow[];
  excluded: { model: DbModelRow; reason: string }[];
}

function filterEligible(
  models: DbModelRow[],
  variants: DbVariantRow[],
): EligibilityResult {
  const variantsByModel = new Map<string, DbVariantRow[]>();
  for (const v of variants) {
    const arr = variantsByModel.get(v.model_id) ?? [];
    arr.push(v);
    variantsByModel.set(v.model_id, arr);
  }

  const eligible: DbModelRow[] = [];
  const excluded: { model: DbModelRow; reason: string }[] = [];

  for (const m of models) {
    const modelVariants = variantsByModel.get(m.id) ?? [];
    const validVariants = modelVariants.filter(
      v => v.status === 'known' || v.status === 'verified',
    );

    if (m.approval_status !== 'approved') {
      excluded.push({ model: m, reason: `approval_status=${m.approval_status}` });
      continue;
    }
    if (validVariants.length === 0) {
      excluded.push({ model: m, reason: 'zero valid variants' });
      continue;
    }
    if (m.status !== 'active') {
      excluded.push({ model: m, reason: `status=${m.status}` });
      continue;
    }
    eligible.push(m);
  }

  return { eligible, excluded };
}

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeModel(overrides: Partial<DbModelRow> = {}): DbModelRow {
  return {
    id: 'model-001',
    canonical_id: 'brand-model-001',
    brand_id: 'brand',
    name: 'Model 001',
    status: 'active',
    approval_status: 'draft',
    ...overrides,
  };
}

function makeVariant(overrides: Partial<DbVariantRow> = {}): DbVariantRow {
  return {
    canonical_variant_id: 'var-001',
    model_id: 'model-001',
    ram_mb: 8192,
    storage_gb: 256,
    region: null,
    status: 'known',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P2 eligibility filter', () => {
  it('includes approved + active + valid variant', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]!.id).toBe('model-001');
    expect(result.excluded).toHaveLength(0);
  });

  it('excludes draft models', () => {
    const model = makeModel({ approval_status: 'draft', status: 'active' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('approval_status=draft');
  });

  it('excludes rejected models', () => {
    const model = makeModel({ approval_status: 'rejected', status: 'active' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('approval_status=rejected');
  });

  it('excludes approved + archived', () => {
    const model = makeModel({ approval_status: 'approved', status: 'archived' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('status=archived');
  });

  it('excludes approved + active + zero variants', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });

    const result = filterEligible([model], []);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('zero valid variants');
  });

  it('excludes approved + active + only archived variants', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });
    const variant = makeVariant({ status: 'archived' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('zero valid variants');
  });

  it('excludes approved + active + only unverified variants', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });
    const variant = makeVariant({ status: 'unverified' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('zero valid variants');
  });

  it('includes model with mixed variant statuses if ≥1 known/verified', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });
    const v1 = makeVariant({ canonical_variant_id: 'var-001', status: 'known' });
    const v2 = makeVariant({ canonical_variant_id: 'var-002', status: 'archived' });
    const v3 = makeVariant({ canonical_variant_id: 'var-003', status: 'unverified' });

    const result = filterEligible([model], [v1, v2, v3]);

    expect(result.eligible).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });

  it('handles multiple models with mixed eligibility', () => {
    const m1 = makeModel({ id: 'm1', canonical_id: 'c1', approval_status: 'approved', status: 'active' });
    const m2 = makeModel({ id: 'm2', canonical_id: 'c2', approval_status: 'draft', status: 'active' });
    const m3 = makeModel({ id: 'm3', canonical_id: 'c3', approval_status: 'approved', status: 'archived' });
    const v1 = makeVariant({ model_id: 'm1', status: 'known' });
    const v2 = makeVariant({ model_id: 'm2', status: 'known' });

    const result = filterEligible([m1, m2, m3], [v1, v2]);

    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0]!.id).toBe('m1');
    expect(result.excluded).toHaveLength(2);
  });

  it('handles empty input', () => {
    const result = filterEligible([], []);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
  });

  it('excludes model with null approval_status (malformed row)', () => {
    const model = makeModel({ approval_status: null as unknown as string, status: 'active' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('approval_status=null');
  });

  it('excludes model with empty approval_status', () => {
    const model = makeModel({ approval_status: '', status: 'active' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('approval_status=');
  });

  it('excludes model with null status field', () => {
    const model = makeModel({ approval_status: 'approved', status: null as unknown as string });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('status=null');
  });

  it('excludes model with unknown status value', () => {
    const model = makeModel({ approval_status: 'approved', status: 'deleted' as string });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('status=deleted');
  });

  it('excludes model with unknown approval_status value', () => {
    const model = makeModel({ approval_status: 'pending_review' as string, status: 'active' });
    const variant = makeVariant({ status: 'known' });

    const result = filterEligible([model], [variant]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('approval_status=pending_review');
  });

  it('handles orphaned variants (model_id matches no model)', () => {
    const model = makeModel({ id: 'm1', approval_status: 'approved', status: 'active' });
    const orphan = makeVariant({ model_id: 'orphan-model', status: 'known' });

    const result = filterEligible([model], [orphan]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe('zero valid variants');
  });

  it('handles model with only null-status variants', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });
    const v1 = makeVariant({ status: null as unknown as string });

    const result = filterEligible([model], [v1]);

    expect(result.eligible).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
  });

  it('includes model when all 3 variants have different valid statuses', () => {
    const model = makeModel({ approval_status: 'approved', status: 'active' });
    const v1 = makeVariant({ canonical_variant_id: 'var-001', status: 'known' });
    const v2 = makeVariant({ canonical_variant_id: 'var-002', status: 'verified' });
    const v3 = makeVariant({ canonical_variant_id: 'var-003', status: 'archived' });

    const result = filterEligible([model], [v1, v2, v3]);

    expect(result.eligible).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });

  it('handles 1000 models with mixed eligibility', () => {
    const models: DbModelRow[] = [];
    const variants: DbVariantRow[] = [];

    for (let i = 0; i < 1000; i++) {
      const isApproved = i % 3 === 0;
      const isActive = i % 5 !== 0;
      models.push(makeModel({
        id: `m${i}`,
        canonical_id: `c${i}`,
        approval_status: isApproved ? 'approved' : 'draft',
        status: isActive ? 'active' : 'archived',
      }));
      if (isApproved && isActive) {
        variants.push(makeVariant({ model_id: `m${i}`, canonical_variant_id: `v${i}`, status: 'known' }));
      }
    }

    const result = filterEligible(models, variants);

    // Every 3rd AND not 5th = approved + active = eligible
    const expectedEligible = models.filter(m =>
      m.approval_status === 'approved' && m.status === 'active'
    ).length;
    expect(result.eligible).toHaveLength(expectedEligible);
    expect(result.eligible.length + result.excluded.length).toBe(1000);
  });
});

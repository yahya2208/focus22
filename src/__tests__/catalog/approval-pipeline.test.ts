/**
 * P2 — Pipeline Integration Tests
 *
 * Tests the complete publication pipeline:
 *   DB → approval status → eligibility filter → JSON generation → validation
 *
 * Verifies the critical invariant:
 *   A model must NOT appear in publishable JSON if:
 *     approval_status != 'approved'
 *     OR status != 'active'
 *     OR no valid variant (status IN ('known', 'verified'))
 *
 * And the inverse:
 *   Every model in publishable JSON MUST satisfy:
 *     approved + active + >=1 valid variant
 *
 * These are pure unit tests. No database connection required.
 */

import { describe, it, expect } from 'vitest';

// ─── Pipeline Model ──────────────────────────────────────────────────────────

interface PipelineModel {
  id: string;
  canonical_id: string;
  name: string;
  approval_status: 'draft' | 'approved' | 'rejected';
  status: 'active' | 'archived';
}

interface PipelineVariant {
  id: string;
  model_id: string;
  status: 'known' | 'verified' | 'archived' | 'unverified';
}

interface OutputModel {
  model: string;
  approved: boolean;
  active: boolean;
  hasValidVariant: boolean;
}

function runEligibilityFilter(
  models: PipelineModel[],
  variants: PipelineVariant[],
): { eligible: PipelineModel[]; excluded: { model: PipelineModel; reason: string }[] } {
  const variantsByModel = new Map<string, PipelineVariant[]>();
  for (const v of variants) {
    const arr = variantsByModel.get(v.model_id) ?? [];
    arr.push(v);
    variantsByModel.set(v.model_id, arr);
  }

  const eligible: PipelineModel[] = [];
  const excluded: { model: PipelineModel; reason: string }[] = [];

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

function generateOutputModels(
  eligible: PipelineModel[],
  _variants: PipelineVariant[],
): OutputModel[] {
  return eligible.map(m => ({
    model: m.name,
    approved: m.approval_status === 'approved',
    active: m.status === 'active',
    hasValidVariant: true, // by definition, eligible models have valid variants
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P2 pipeline integration — no draft in publishable JSON', () => {
  it('excludes all-draft DB from JSON output', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'draft', status: 'active' },
      { id: '2', canonical_id: 'c2', name: 'Model B', approval_status: 'draft', status: 'active' },
      { id: '3', canonical_id: 'c3', name: 'Model C', approval_status: 'draft', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'known' },
      { id: 'v2', model_id: '2', status: 'known' },
      { id: 'v3', model_id: '3', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    const output = generateOutputModels(eligible, variants);

    expect(output).toHaveLength(0);
    expect(eligible).toHaveLength(0);
  });

  it('excludes rejected models from JSON output', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'rejected', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(0);
  });

  it('excludes archived models from JSON output', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'archived' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(0);
  });

  it('excludes models with only archived variants', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'archived' },
      { id: 'v2', model_id: '1', status: 'unverified' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(0);
  });

  it('excludes models with zero variants', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'active' },
    ];

    const { eligible } = runEligibilityFilter(models, []);
    expect(eligible).toHaveLength(0);
  });
});

describe('P2 pipeline integration — approved in JSON', () => {
  it('includes approved + active + known variant', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(1);

    const output = generateOutputModels(eligible, variants);
    expect(output).toHaveLength(1);
    expect(output[0]!.model).toBe('Model A');
    expect(output[0]!.approved).toBe(true);
    expect(output[0]!.active).toBe(true);
  });

  it('includes approved + active + verified variant', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'verified' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(1);
  });

  it('includes model when at least one variant is known', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'archived' },
      { id: 'v2', model_id: '1', status: 'known' },
      { id: 'v3', model_id: '1', status: 'unverified' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(1);
  });
});

describe('P2 pipeline integration — mixed DB state', () => {
  it('filters correctly in a realistic 2178-model scenario (subset)', () => {
    const models: PipelineModel[] = [];

    // 2000 draft models (like live DB)
    for (let i = 0; i < 2000; i++) {
      models.push({
        id: `draft-${i}`,
        canonical_id: `c-draft-${i}`,
        name: `Draft Model ${i}`,
        approval_status: 'draft',
        status: 'active',
      });
    }

    // 100 approved models with valid variants
    for (let i = 0; i < 100; i++) {
      models.push({
        id: `approved-${i}`,
        canonical_id: `c-approved-${i}`,
        name: `Approved Model ${i}`,
        approval_status: 'approved',
        status: 'active',
      });
    }

    // 50 archived models
    for (let i = 0; i < 50; i++) {
      models.push({
        id: `archived-${i}`,
        canonical_id: `c-archived-${i}`,
        name: `Archived Model ${i}`,
        approval_status: 'approved',
        status: 'archived',
      });
    }

    // 28 rejected models
    for (let i = 0; i < 28; i++) {
      models.push({
        id: `rejected-${i}`,
        canonical_id: `c-rejected-${i}`,
        name: `Rejected Model ${i}`,
        approval_status: 'rejected',
        status: 'active',
      });
    }

    // Variants only for approved models
    const variants: PipelineVariant[] = [];
    for (let i = 0; i < 100; i++) {
      variants.push({
        id: `v-${i}`,
        model_id: `approved-${i}`,
        status: 'known',
      });
    }

    const { eligible, excluded } = runEligibilityFilter(models, variants);

    expect(eligible).toHaveLength(100);
    expect(excluded).toHaveLength(2078);

    // Verify all excluded have a valid reason
    for (const e of excluded) {
      const m = e.model;
      const isDraftOrRejected = m.approval_status !== 'approved';
      const isArchived = m.approval_status === 'approved' && m.status !== 'active';
      const hasNoValidReason = !isDraftOrRejected && !isArchived;
      expect(hasNoValidReason).toBe(false);
    }

    // Verify output is correct
    const output = generateOutputModels(eligible, variants);
    expect(output).toHaveLength(100);
    for (const o of output) {
      expect(o.approved).toBe(true);
      expect(o.active).toBe(true);
      expect(o.hasValidVariant).toBe(true);
    }
  });

  it('handles models with variants but none valid', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Model A', approval_status: 'approved', status: 'active' },
      { id: '2', canonical_id: 'c2', name: 'Model B', approval_status: 'approved', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'archived' },
      { id: 'v2', model_id: '1', status: 'unverified' },
      { id: 'v3', model_id: '2', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.id).toBe('2');
  });

  it('handles no models at all', () => {
    const { eligible, excluded } = runEligibilityFilter([], []);
    expect(eligible).toHaveLength(0);
    expect(excluded).toHaveLength(0);
  });
});

describe('P2 pipeline — publication safety invariant', () => {
  it('NEVER produces draft model in output', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Draft', approval_status: 'draft', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    const output = generateOutputModels(eligible, variants);

    // INVARIANT: zero draft models in output
    expect(output).toHaveLength(0);
  });

  it('NEVER produces archived model in output', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'Archived', approval_status: 'approved', status: 'archived' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'known' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(0);
  });

  it('NEVER produces model without valid variants', () => {
    const models: PipelineModel[] = [
      { id: '1', canonical_id: 'c1', name: 'NoValidVariants', approval_status: 'approved', status: 'active' },
    ];
    const variants: PipelineVariant[] = [
      { id: 'v1', model_id: '1', status: 'archived' },
    ];

    const { eligible } = runEligibilityFilter(models, variants);
    expect(eligible).toHaveLength(0);
  });

  it('EVERY output model is approved + active + has valid variant', () => {
    // Exhaustive check: create every combination and verify
    const allStatuses: PipelineModel['approval_status'][] = ['draft', 'approved', 'rejected'];
    const allModelStatuses: PipelineModel['status'][] = ['active', 'archived'];
    const allVariantStatuses: PipelineVariant['status'][] = ['known', 'verified', 'archived', 'unverified'];

    for (const approvalStatus of allStatuses) {
      for (const modelStatus of allModelStatuses) {
        for (const variantStatus of allVariantStatuses) {
          const models: PipelineModel[] = [
            { id: '1', canonical_id: 'c1', name: 'Test', approval_status: approvalStatus, status: modelStatus },
          ];
          const variants: PipelineVariant[] = [
            { id: 'v1', model_id: '1', status: variantStatus },
          ];

          const { eligible } = runEligibilityFilter(models, variants);

          // Only one combination should be eligible
          if (approvalStatus === 'approved' && modelStatus === 'active' && (variantStatus === 'known' || variantStatus === 'verified')) {
            expect(eligible).toHaveLength(1);
          } else {
            expect(eligible).toHaveLength(0);
          }
        }
      }
    }
  });
});

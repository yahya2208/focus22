/**
 * P3-C — Actions UI Logic Tests
 *
 * Tests action state machine:
 *   - Approve pre-check (variant count guard)
 *   - Reject action flow
 *   - Double-submit prevention (actingOn state)
 *   - Optimistic concurrency error display
 *   - Reopen action on rejected models
 *
 * Pure unit tests. No database connection, no React rendering.
 */

import { describe, it, expect } from 'vitest';

// ─── State Model ─────────────────────────────────────────────────────────────

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

interface ActionState {
  actingOn: string | null;
  error: string | null;
  success: string | null;
}

// ─── Action Logic ────────────────────────────────────────────────────────────

function canAct(state: ActionState): boolean {
  return state.actingOn === null;
}

function isActingOn(state: ActionState, modelId: string): boolean {
  return state.actingOn === modelId;
}

function approvePreCheck(model: CatalogModelRow): { allowed: boolean; reason?: string } {
  if (model.approval_status !== 'draft') {
    return { allowed: false, reason: `Cannot approve: status is ${model.approval_status}` };
  }
  if (model.variant_count === 0) {
    return { allowed: false, reason: 'Cannot approve: no variants defined' };
  }
  return { allowed: true };
}

function rejectPreCheck(model: CatalogModelRow): { allowed: boolean; reason?: string } {
  if (model.approval_status === 'rejected') {
    return { allowed: false, reason: 'Already rejected' };
  }
  return { allowed: true };
}

function reopenPreCheck(model: CatalogModelRow): { allowed: boolean; reason?: string } {
  if (model.approval_status !== 'rejected') {
    return { allowed: false, reason: `Cannot reopen: status is ${model.approval_status}` };
  }
  return { allowed: true };
}

function isConcurrencyError(err: string | null): boolean {
  return err !== null && err.includes('modified by another user');
}

function buildApprovePayload(model: CatalogModelRow) {
  return {
    p_canonical_id: model.canonical_id,
    p_approve: true,
    p_expected_updated_at: model.updated_at,
  };
}

function buildRejectPayload(model: CatalogModelRow) {
  return {
    p_canonical_id: model.canonical_id,
    p_approve: false,
    p_expected_updated_at: model.updated_at,
  };
}

function buildReopenPayload(model: CatalogModelRow) {
  return {
    p_canonical_id: model.canonical_id,
    p_expected_updated_at: model.updated_at,
  };
}

function displayMessage(action: 'approve' | 'reject' | 'reopen', model: CatalogModelRow): string {
  const verb = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Reopened';
  return `${verb}: ${model.name}`;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DRAFT_MODEL: CatalogModelRow = {
  id: 'm1', canonical_id: 'test-phone', brand_id: 'test', name: 'Test Phone',
  status: 'active', approval_status: 'draft', variant_count: 3, updated_at: '2024-01-01T00:00:00Z',
};

const DRAFT_NO_VARIANTS: CatalogModelRow = {
  id: 'm2', canonical_id: 'empty-phone', brand_id: 'test', name: 'Empty Phone',
  status: 'active', approval_status: 'draft', variant_count: 0, updated_at: '2024-01-02T00:00:00Z',
};

const REJECTED_MODEL: CatalogModelRow = {
  id: 'm3', canonical_id: 'rejected-phone', brand_id: 'test', name: 'Rejected Phone',
  status: 'active', approval_status: 'rejected', variant_count: 2, updated_at: '2024-01-03T00:00:00Z',
};

const APPROVED_MODEL: CatalogModelRow = {
  id: 'm4', canonical_id: 'approved-phone', brand_id: 'test', name: 'Approved Phone',
  status: 'active', approval_status: 'approved', variant_count: 1, updated_at: '2024-01-04T00:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P3-C Actions — Approve Pre-check', () => {
  it('draft model with variants passes', () => {
    const result = approvePreCheck(DRAFT_MODEL);
    expect(result.allowed).toBe(true);
  });

  it('draft model with 0 variants is blocked', () => {
    const result = approvePreCheck(DRAFT_NO_VARIANTS);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no variants');
  });

  it('approved model is blocked', () => {
    const result = approvePreCheck(APPROVED_MODEL);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('approved');
  });

  it('rejected model is blocked', () => {
    const result = approvePreCheck(REJECTED_MODEL);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('rejected');
  });
});

describe('P3-C Actions — Reject Pre-check', () => {
  it('draft model passes', () => {
    const result = rejectPreCheck(DRAFT_MODEL);
    expect(result.allowed).toBe(true);
  });

  it('already rejected is blocked', () => {
    const result = rejectPreCheck(REJECTED_MODEL);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Already rejected');
  });

  it('approved model can be rejected', () => {
    const result = rejectPreCheck(APPROVED_MODEL);
    expect(result.allowed).toBe(true);
  });
});

describe('P3-C Actions — Reopen Pre-check', () => {
  it('rejected model passes', () => {
    const result = reopenPreCheck(REJECTED_MODEL);
    expect(result.allowed).toBe(true);
  });

  it('draft model is blocked', () => {
    const result = reopenPreCheck(DRAFT_MODEL);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('draft');
  });

  it('approved model is blocked', () => {
    const result = reopenPreCheck(APPROVED_MODEL);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('approved');
  });
});

describe('P3-C Actions — Double-Submit Prevention', () => {
  it('idle state allows action', () => {
    expect(canAct({ actingOn: null, error: null, success: null })).toBe(true);
  });

  it('acting state blocks action', () => {
    expect(canAct({ actingOn: 'm1', error: null, success: null })).toBe(false);
  });

  it('isActingOn matches correct model', () => {
    const state: ActionState = { actingOn: 'm1', error: null, success: null };
    expect(isActingOn(state, 'm1')).toBe(true);
    expect(isActingOn(state, 'm2')).toBe(false);
  });
});

describe('P3-C Actions — Concurrency Error', () => {
  it('detects concurrency error', () => {
    expect(isConcurrencyError('Row was modified by another user')).toBe(true);
  });

  it('non-concurrency error not detected', () => {
    expect(isConcurrencyError('Permission denied')).toBe(false);
  });

  it('null error not detected', () => {
    expect(isConcurrencyError(null)).toBe(false);
  });
});

describe('P3-C Actions — Payload Construction', () => {
  it('approve payload has correct fields', () => {
    const payload = buildApprovePayload(DRAFT_MODEL);
    expect(payload.p_canonical_id).toBe('test-phone');
    expect(payload.p_approve).toBe(true);
    expect(payload.p_expected_updated_at).toBe(DRAFT_MODEL.updated_at);
  });

  it('reject payload has p_approve false', () => {
    const payload = buildRejectPayload(DRAFT_MODEL);
    expect(payload.p_approve).toBe(false);
  });

  it('reopen payload has no p_approve', () => {
    const payload = buildReopenPayload(REJECTED_MODEL);
    expect('p_approve' in payload).toBe(false);
  });
});

describe('P3-C Actions — Success Messages', () => {
  it('approve message correct', () => {
    expect(displayMessage('approve', DRAFT_MODEL)).toBe('Approved: Test Phone');
  });

  it('reject message correct', () => {
    expect(displayMessage('reject', DRAFT_MODEL)).toBe('Rejected: Test Phone');
  });

  it('reopen message correct', () => {
    expect(displayMessage('reopen', REJECTED_MODEL)).toBe('Reopened: Rejected Phone');
  });
});

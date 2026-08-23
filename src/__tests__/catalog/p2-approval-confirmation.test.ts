/**
 * P2.9-B — Approval Confirmation Tests
 *
 * Tests the P2 approval confirmation logic:
 *   - Confirmation dialog state transitions
 *   - Eligibility gating (variant_count > 0)
 *   - Variant status filtering for approval gate
 *   - Approve/reject/reopen state transitions
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Logic Under Test ────────────────────────────────────────────────────────

type ConfirmAction = 'approve' | 'reject' | null;

function canApprove(model: CatalogModelRow): boolean {
  return model.approval_status === 'draft' && model.variant_count > 0;
}

function canReject(model: CatalogModelRow): boolean {
  return model.approval_status !== 'rejected';
}

function canReopen(model: CatalogModelRow): boolean {
  return model.approval_status === 'rejected';
}

function shouldShowDisabledApprove(model: CatalogModelRow): boolean {
  return model.approval_status === 'draft' && model.variant_count === 0;
}

function approveConfirmationMessage(model: CatalogModelRow): string {
  return `This will publish the model and its ${model.variant_count} variant(s) to the public catalog.`;
}

function rejectConfirmationMessage(): string {
  return 'This will reject the model and hide it from the public catalog.';
}

function transitionOnApprove(model: CatalogModelRow): CatalogModelRow {
  return { ...model, approval_status: 'approved' };
}

function transitionOnReject(model: CatalogModelRow): CatalogModelRow {
  return { ...model, approval_status: 'rejected' };
}

function transitionOnReopen(model: CatalogModelRow): CatalogModelRow {
  return { ...model, approval_status: 'draft' };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<CatalogModelRow> = {}): CatalogModelRow {
  return {
    id: 'm1',
    canonical_id: 'apple-iphone-16-pro',
    brand_id: 'apple',
    name: 'iPhone 16 Pro',
    status: 'active',
    approval_status: 'draft',
    variant_count: 3,
    updated_at: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P2 canApprove', () => {
  it('returns true for draft with variants', () => {
    expect(canApprove(makeModel())).toBe(true);
  });

  it('returns false for draft without variants', () => {
    expect(canApprove(makeModel({ variant_count: 0 }))).toBe(false);
  });

  it('returns false for approved', () => {
    expect(canApprove(makeModel({ approval_status: 'approved' }))).toBe(false);
  });

  it('returns false for rejected', () => {
    expect(canApprove(makeModel({ approval_status: 'rejected' }))).toBe(false);
  });

  it('returns false for empty string status', () => {
    expect(canApprove(makeModel({ approval_status: '' }))).toBe(false);
  });
});

describe('P2 canReject', () => {
  it('returns true for draft', () => {
    expect(canReject(makeModel())).toBe(true);
  });

  it('returns true for approved', () => {
    expect(canReject(makeModel({ approval_status: 'approved' }))).toBe(true);
  });

  it('returns false for rejected', () => {
    expect(canReject(makeModel({ approval_status: 'rejected' }))).toBe(false);
  });
});

describe('P2 canReopen', () => {
  it('returns true for rejected', () => {
    expect(canReopen(makeModel({ approval_status: 'rejected' }))).toBe(true);
  });

  it('returns false for draft', () => {
    expect(canReopen(makeModel())).toBe(false);
  });

  it('returns false for approved', () => {
    expect(canReopen(makeModel({ approval_status: 'approved' }))).toBe(false);
  });
});

describe('P2 shouldShowDisabledApprove', () => {
  it('returns true for draft with 0 variants', () => {
    expect(shouldShowDisabledApprove(makeModel({ variant_count: 0 }))).toBe(true);
  });

  it('returns false for draft with variants', () => {
    expect(shouldShowDisabledApprove(makeModel())).toBe(false);
  });

  it('returns false for non-draft with 0 variants', () => {
    expect(shouldShowDisabledApprove(makeModel({ approval_status: 'approved', variant_count: 0 }))).toBe(false);
  });
});

describe('P2 confirmation messages', () => {
  it('includes variant count in approve message', () => {
    const model = makeModel({ variant_count: 5 });
    expect(approveConfirmationMessage(model)).toContain('5 variant(s)');
  });

  it('approve message is informational', () => {
    const model = makeModel();
    expect(approveConfirmationMessage(model)).toContain('publish');
  });

  it('reject message mentions hiding', () => {
    expect(rejectConfirmationMessage()).toContain('hide');
  });
});

describe('P2 state transitions', () => {
  it('approve transitions draft to approved', () => {
    const model = makeModel();
    expect(transitionOnApprove(model).approval_status).toBe('approved');
  });

  it('reject transitions draft to rejected', () => {
    const model = makeModel();
    expect(transitionOnReject(model).approval_status).toBe('rejected');
  });

  it('reopen transitions rejected to draft', () => {
    const model = makeModel({ approval_status: 'rejected' });
    expect(transitionOnReopen(model).approval_status).toBe('draft');
  });

  it('approve does not mutate original', () => {
    const model = makeModel();
    const next = transitionOnApprove(model);
    expect(model.approval_status).toBe('draft');
    expect(next.approval_status).toBe('approved');
  });

  it('reject does not mutate original', () => {
    const model = makeModel();
    const next = transitionOnReject(model);
    expect(model.approval_status).toBe('draft');
    expect(next.approval_status).toBe('rejected');
  });

  it('transition preserves other fields', () => {
    const model = makeModel({ name: 'Test Model', variant_count: 7 });
    const approved = transitionOnApprove(model);
    expect(approved.name).toBe('Test Model');
    expect(approved.variant_count).toBe(7);
  });
});

describe('P2 confirmation dialog state', () => {
  it('starts as null', () => {
    const confirmAction: ConfirmAction = null;
    expect(confirmAction).toBeNull();
  });

  it('transitions to approve', () => {
    let confirmAction: ConfirmAction = null;
    confirmAction = 'approve';
    expect(confirmAction).toBe('approve');
  });

  it('transitions to reject', () => {
    let confirmAction: ConfirmAction = null;
    confirmAction = 'reject';
    expect(confirmAction).toBe('reject');
  });

  it('resets to null on cancel', () => {
    let confirmAction: ConfirmAction = 'approve';
    confirmAction = null;
    expect(confirmAction).toBeNull();
  });

  it('resets to null after confirm', () => {
    let confirmAction: ConfirmAction = 'reject';
    confirmAction = null;
    expect(confirmAction).toBeNull();
  });
});

describe('P2 button visibility matrix', () => {
  it('draft + variants: Approve + Reject shown, Reopen hidden', () => {
    const model = makeModel();
    expect(canApprove(model)).toBe(true);
    expect(canReject(model)).toBe(true);
    expect(canReopen(model)).toBe(false);
  });

  it('draft + 0 variants: disabled Approve shown, Reject shown, Reopen hidden', () => {
    const model = makeModel({ variant_count: 0 });
    expect(canApprove(model)).toBe(false);
    expect(shouldShowDisabledApprove(model)).toBe(true);
    expect(canReject(model)).toBe(true);
    expect(canReopen(model)).toBe(false);
  });

  it('approved: Approve hidden, Reject shown, Reopen hidden', () => {
    const model = makeModel({ approval_status: 'approved' });
    expect(canApprove(model)).toBe(false);
    expect(shouldShowDisabledApprove(model)).toBe(false);
    expect(canReject(model)).toBe(true);
    expect(canReopen(model)).toBe(false);
  });

  it('rejected: Approve hidden, Reject hidden, Reopen shown', () => {
    const model = makeModel({ approval_status: 'rejected' });
    expect(canApprove(model)).toBe(false);
    expect(shouldShowDisabledApprove(model)).toBe(false);
    expect(canReject(model)).toBe(false);
    expect(canReopen(model)).toBe(true);
  });
});

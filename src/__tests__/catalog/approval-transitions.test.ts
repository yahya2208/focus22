/**
 * P2 — Approval State Machine Tests
 *
 * Tests the P2 transition guards implemented in catalog_admin_approve_model:
 *   - draft → approved (requires active status + ≥1 valid variant)
 *   - draft → rejected (no additional condition)
 *   - rejected → approved BLOCKED (must reopen to draft first)
 *   - approved → rejected (allowed)
 *   - archived → approved BLOCKED (archived cannot be approved)
 *   - approved → approved BLOCKED (idempotent rejection)
 *   - Optimistic concurrency (stale updated_at detection)
 *
 * These are pure unit tests that validate the state machine logic.
 * They do NOT connect to a live database.
 */

import { describe, it, expect } from 'vitest';

// ─── State Machine Model ─────────────────────────────────────────────────────
//
// This is a TypeScript model of the P2 state machine for testability.
// The actual enforcement is in the SQL RPC; this tests the conceptual model.

type ApprovalStatus = 'draft' | 'approved' | 'rejected';
type ModelStatus = 'active' | 'archived';

interface ModelState {
  approval_status: ApprovalStatus;
  model_status: ModelStatus;
  valid_variants: number;
  updated_at: string;
}

interface TransitionResult {
  allowed: boolean;
  new_approval_status?: ApprovalStatus;
  reason?: string;
}

function canApprove(current: ModelState): TransitionResult {
  // D3: Active status gate
  if (current.model_status !== 'active') {
    return { allowed: false, reason: `status is ${current.model_status} (requires active)` };
  }

  // D2: Transition guard — only draft → approved
  if (current.approval_status !== 'draft') {
    return { allowed: false, reason: `approval_status is ${current.approval_status} (must be draft)` };
  }

  // Variant gate
  if (current.valid_variants === 0) {
    return { allowed: false, reason: 'requires >= 1 valid variant (has 0)' };
  }

  return { allowed: true, new_approval_status: 'approved' };
}

function canReject(_current: ModelState): TransitionResult {
  // Rejection is always allowed from any approval_status
  return { allowed: true, new_approval_status: 'rejected' };
}

function canReopen(current: ModelState): TransitionResult {
  // Reopen = change name via update_model, which resets to draft
  // Allowed from rejected status only (approved should be rejected first)
  if (current.approval_status !== 'rejected') {
    return { allowed: false, reason: `approval_status is ${current.approval_status} (reopen requires rejected)` };
  }
  return { allowed: true, new_approval_status: 'draft' };
}

function checkConcurrency(localUpdatedAt: string, serverUpdatedAt: string): TransitionResult {
  if (localUpdatedAt !== serverUpdatedAt) {
    return { allowed: false, reason: `concurrent modification: expected ${localUpdatedAt} but found ${serverUpdatedAt}` };
  }
  return { allowed: true };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P2 approval state machine', () => {
  describe('draft → approved', () => {
    it('allows when active + valid variant', () => {
      const result = canApprove({
        approval_status: 'draft',
        model_status: 'active',
        valid_variants: 3,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(true);
      expect(result.new_approval_status).toBe('approved');
    });

    it('blocks when no valid variants', () => {
      const result = canApprove({
        approval_status: 'draft',
        model_status: 'active',
        valid_variants: 0,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('valid variant');
    });

    it('blocks when archived', () => {
      const result = canApprove({
        approval_status: 'draft',
        model_status: 'archived',
        valid_variants: 1,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('archived');
    });
  });

  describe('rejected → approved', () => {
    it('blocks (must reopen to draft first)', () => {
      const result = canApprove({
        approval_status: 'rejected',
        model_status: 'active',
        valid_variants: 1,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('must be draft');
    });
  });

  describe('approved → approved', () => {
    it('blocks (must reject/reopen first)', () => {
      const result = canApprove({
        approval_status: 'approved',
        model_status: 'active',
        valid_variants: 1,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('must be draft');
    });
  });

  describe('draft → rejected', () => {
    it('allows from any approval_status', () => {
      const result = canReject({
        approval_status: 'draft',
        model_status: 'active',
        valid_variants: 0,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(true);
      expect(result.new_approval_status).toBe('rejected');
    });

    it('allows from approved (un-approve)', () => {
      const result = canReject({
        approval_status: 'approved',
        model_status: 'active',
        valid_variants: 1,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(true);
      expect(result.new_approval_status).toBe('rejected');
    });
  });

  describe('rejected → draft (reopen)', () => {
    it('allows reopening rejected models', () => {
      const result = canReopen({
        approval_status: 'rejected',
        model_status: 'active',
        valid_variants: 1,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(true);
      expect(result.new_approval_status).toBe('draft');
    });

    it('blocks reopening non-rejected models', () => {
      const result = canReopen({
        approval_status: 'draft',
        model_status: 'active',
        valid_variants: 1,
        updated_at: '2026-01-01T00:00:00Z',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('reopen requires rejected');
    });
  });

  describe('full lifecycle', () => {
    it('draft → approved → rejected → draft → approved', () => {
      const state: ModelState = {
        approval_status: 'draft',
        model_status: 'active',
        valid_variants: 2,
        updated_at: '2026-01-01T00:00:00Z',
      };

      // draft → approved
      const r1 = canApprove(state);
      expect(r1.allowed).toBe(true);
      state.approval_status = r1.new_approval_status!;

      // approved → rejected
      const r2 = canReject(state);
      expect(r2.allowed).toBe(true);
      state.approval_status = r2.new_approval_status!;

      // rejected → draft (reopen)
      const r3 = canReopen(state);
      expect(r3.allowed).toBe(true);
      state.approval_status = r3.new_approval_status!;

      // draft → approved (again)
      const r4 = canApprove(state);
      expect(r4.allowed).toBe(true);
      state.approval_status = r4.new_approval_status!;

      expect(state.approval_status).toBe('approved');
    });
  });
});

describe('P2 optimistic concurrency', () => {
  it('allows when timestamps match', () => {
    const result = checkConcurrency('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    expect(result.allowed).toBe(true);
  });

  it('blocks when timestamps differ', () => {
    const result = checkConcurrency('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('concurrent modification');
  });

  it('blocks when local is older than server', () => {
    const result = checkConcurrency('2026-01-01T00:00:00Z', '2026-08-17T12:00:00Z');
    expect(result.allowed).toBe(false);
  });
});

describe('P2 adversarial edge cases', () => {
  it('blocks approve with null approval_status (malformed row)', () => {
    const result = canApprove({
      approval_status: null as unknown as ApprovalStatus,
      model_status: 'active',
      valid_variants: 1,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('must be draft');
  });

  it('blocks approve with empty string approval_status', () => {
    const result = canApprove({
      approval_status: '' as ApprovalStatus,
      model_status: 'active',
      valid_variants: 1,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('must be draft');
  });

  it('blocks approve with null model_status', () => {
    const result = canApprove({
      approval_status: 'draft',
      model_status: null as unknown as ModelStatus,
      valid_variants: 1,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('requires active');
  });

  it('allows approve with negative valid_variants (impossible in SQL COUNT, but model is permissive)', () => {
    // In production SQL, COUNT(*) always returns >= 0, so negative is impossible.
    // The TypeScript model only checks === 0, which is correct for the SQL case.
    const result = canApprove({
      approval_status: 'draft',
      model_status: 'active',
      valid_variants: -1,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(true);
  });

  it('allows approve with very large valid_variants count', () => {
    const result = canApprove({
      approval_status: 'draft',
      model_status: 'active',
      valid_variants: 999999,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks concurrency check with null local timestamp', () => {
    const result = checkConcurrency(null as unknown as string, '2026-01-01T00:00:00Z');
    expect(result.allowed).toBe(false);
  });

  it('blocks concurrency check with null server timestamp', () => {
    const result = checkConcurrency('2026-01-01T00:00:00Z', null as unknown as string);
    expect(result.allowed).toBe(false);
  });

  it('allows concurrency check when both timestamps are null', () => {
    const result = checkConcurrency(null as unknown as string, null as unknown as string);
    expect(result.allowed).toBe(true);
  });

  it('blocks approve with future updated_at (clock skew)', () => {
    const result = checkConcurrency('2099-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('concurrent modification');
  });

  it('reject is always allowed from any adversarial state', () => {
    const adversarialStates: ModelState[] = [
      { approval_status: null as unknown as ApprovalStatus, model_status: 'active', valid_variants: 0, updated_at: '' },
      { approval_status: 'draft', model_status: null as unknown as ModelStatus, valid_variants: -1, updated_at: 'garbage' },
      { approval_status: 'approved', model_status: 'archived', valid_variants: 0, updated_at: '' },
    ];
    for (const state of adversarialStates) {
      const result = canReject(state);
      expect(result.allowed).toBe(true);
    }
  });

  it('reopen is blocked for draft (not rejected)', () => {
    const result = canReopen({
      approval_status: 'draft',
      model_status: 'active',
      valid_variants: 1,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(false);
  });

  it('reopen is blocked for approved (not rejected)', () => {
    const result = canReopen({
      approval_status: 'approved',
      model_status: 'active',
      valid_variants: 1,
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(result.allowed).toBe(false);
  });

  it('multiple rapid transitions: draft→approved→rejected→draft→approved in sequence', () => {
    let state: ModelState = {
      approval_status: 'draft',
      model_status: 'active',
      valid_variants: 1,
      updated_at: '2026-01-01T00:00:00Z',
    };

    // Step 1: draft → approved
    const r1 = canApprove(state);
    expect(r1.allowed).toBe(true);
    state = { ...state, approval_status: r1.new_approval_status!, updated_at: '2026-01-01T00:01:00Z' };

    // Step 2: approved → rejected
    const r2 = canReject(state);
    expect(r2.allowed).toBe(true);
    state = { ...state, approval_status: r2.new_approval_status!, updated_at: '2026-01-01T00:02:00Z' };

    // Step 3: rejected → draft
    const r3 = canReopen(state);
    expect(r3.allowed).toBe(true);
    state = { ...state, approval_status: r3.new_approval_status!, updated_at: '2026-01-01T00:03:00Z' };

    // Step 4: draft → approved again
    const r4 = canApprove(state);
    expect(r4.allowed).toBe(true);
    state = { ...state, approval_status: r4.new_approval_status! };

    expect(state.approval_status).toBe('approved');
  });
});

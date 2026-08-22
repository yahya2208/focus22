/**
 * Winner Persistence Fix — server-first restore contract.
 *
 * Covers the P1 fix "user loses winner status after storage clear / new device":
 *   1. recover_my_challenge_state is consulted BEFORE localStorage on mount.
 *   2. A server-confirmed submission restores 'submitted' without re-submitting.
 *   3. A server-confirmed claim is reused verbatim — no duplicate create_claim RPC.
 *   4. localStorage remains the fallback when the server reports no submission
 *      or when recovery fails (offline).
 *   5. guestSessionId is persisted alongside the submissionId for evidence chain.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useChallengeSubmission, type UseChallengeSubmissionResult } from '../../hooks/useChallengeSubmission';
import { createDefaultCalibrationProfile } from '../../core/calibration';
import { setActiveChallengeId } from '../../challenge/challenge-context';

// ── Mocks ────────────────────────────────────────────────────────────────────

const recoverRpc = vi.fn<(fn: string, args?: unknown) => Promise<unknown>>(async () => ({ data: null, error: { message: 'no recovery in this test' } }));
const otherRpc = vi.fn<(fn: string, args?: unknown) => Promise<unknown>>();
const mockRpc = vi.fn((fn: string, args?: unknown) =>
  fn === 'recover_my_challenge_state' ? recoverRpc(fn, args) : otherRpc(fn, args),
);

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

let mockAuthStatus: 'authenticated' | 'anonymous' | 'unauthenticated' | 'loading' = 'authenticated';

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: mockAuthStatus, user: { id: 'user-1', displayName: 'T' } }, researchRole: 'none' }),
}));

// ── Harness ──────────────────────────────────────────────────────────────────

let latest: UseChallengeSubmissionResult | null = null;

function Harness() {
  const result = useChallengeSubmission({
    authStatus: mockAuthStatus,
    userId: 'user-1',
    rawRts: [300, 280, 260],
    calibration: createDefaultCalibrationProfile(),
    sessionId: null,
    guestSessionId: 'guest-evidence-42',
  });
  latest = result;
  return null;
}

function mount(challengeId: string) {
  setActiveChallengeId(challengeId);
  return render(<Harness />);
}

const RECOVER_HIT = {
  has_submission: true,
  submission_id: 'sub-server-9',
  focus_score: 91,
  grade: 'A',
  personal_rank: 1,
  is_qualified: true,
};

beforeEach(() => {
  recoverRpc.mockClear();
  recoverRpc.mockImplementation(async () => ({ data: null, error: { message: 'no recovery in this test' } }));
  otherRpc.mockReset();
  localStorage.clear();
  mockAuthStatus = 'authenticated';
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('server-first restore (Winner Persistence Fix)', () => {
  it('1. probes recover_my_challenge_state before any submit and restores submitted state', async () => {
    recoverRpc.mockResolvedValue({ data: RECOVER_HIT, error: null });

    await act(async () => {
      mount('ch-fix-1');
    });

    expect(recoverRpc).toHaveBeenCalledWith('recover_my_challenge_state', expect.objectContaining({ p_challenge_id: 'ch-fix-1' }));
    expect(otherRpc).not.toHaveBeenCalled(); // never resubmits
    await act(async () => {});
    expect(latest?.status).toBe('submitted');
    expect(latest?.result?.submissionId).toBe('sub-server-9');
    expect(latest?.result?.focusScore).toBe(91);
  });

  it('2. restores a server-confirmed claim WITHOUT calling create claim RPC again', async () => {
    recoverRpc.mockResolvedValue({
      data: {
        ...RECOVER_HIT,
        claim: {
          claim_id: 'cl-srv-1',
          code: 'SRVCLM01',
          token: 'tok_srv',
          expires_at: '2099-01-01T00:00:00Z',
          status: 'claimed',
        },
      },
      error: null,
    });
    localStorage.setItem('focus_claim_data', JSON.stringify({
      challengeId: 'ch-fix-2',
      submissionId: 'sub-server-9',
      claimId: 'cl-srv-1',
      code: 'SRVCLM01',
      token: 'tok_srv',
      expiresAt: '2099-01-01T00:00:00Z',
    }));

    await act(async () => {
      mount('ch-fix-2');
    });

    expect(latest?.status).toBe('claimed');
    expect(latest?.claimResult?.code).toBe('SRVCLM01');
    expect(otherRpc).not.toHaveBeenCalled();
  });

  it.each(['pending', 'expired', 'revoked'] as const)(
    '2b. maps recovered claim status %s — never surfaces it as claimed',
    async (claimStatus) => {
      recoverRpc.mockResolvedValue({
        data: {
          ...RECOVER_HIT,
          claim: {
            claim_id: 'cl-srv-2',
            status: claimStatus,
            expires_at: '2099-01-01T00:00:00Z',
            claimed_at: null,
            is_guest_claim: false,
          },
        },
        error: null,
      });
      // Even a matching plaintext cache must not resurrect a claimed view
      localStorage.setItem('focus_claim_data', JSON.stringify({
        challengeId: 'ch-fix-2b',
        submissionId: 'sub-server-9',
        claimId: 'cl-srv-2',
        code: 'SRVCLM02',
        token: 'tok_srv2',
        expiresAt: '2099-01-01T00:00:00Z',
      }));

      await act(async () => {
        mount('ch-fix-2b');
      });

      expect(latest?.status).toBe('submitted'); // server truth preserved, NOT fabricated as claimed
      expect(latest?.claimResult).toBeNull();   // no code shown for pending/expired/revoked
      expect(otherRpc).not.toHaveBeenCalled();  // and still no duplicate creation attempt on restore
    },
  );

  it('2c. anonymous session reuses a recovered claim with zero claim RPCs', async () => {
    mockAuthStatus = 'anonymous';
    recoverRpc.mockResolvedValue({
      data: {
        ...RECOVER_HIT,
        claim: {
          claim_id: 'cl-srv-3',
          status: 'pending',
          expires_at: '2099-01-01T00:00:00Z',
          claimed_at: null,
          is_guest_claim: false,
        },
      },
      error: null,
    });

    await act(async () => {
      mount('ch-fix-2c');
    });

    expect(recoverRpc).toHaveBeenCalledTimes(1);
    // Recovery alone satisfies state — no create_challenge_claim / create_guest_claim fired
    expect(otherRpc).not.toHaveBeenCalled();
    expect(latest?.result?.submissionId).toBe('sub-server-9');
  });

  it('3. falls back to localStorage when server reports no submission', async () => {
    recoverRpc.mockResolvedValue({ data: { has_submission: false }, error: null });
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-fix-3',
      submissionId: 'sub-cache-3',
      focusScore: 77,
      grade: 'B',
      rank: 4,
      isQualified: true,
      isCurrentLeader: false,
    }));

    await act(async () => {
      mount('ch-fix-3');
    });

    expect(latest?.status).toBe('submitted');
    expect(latest?.result?.submissionId).toBe('sub-cache-3');
  });

  it('4. falls back to localStorage when recovery RPC fails (offline)', async () => {
    recoverRpc.mockRejectedValue(new Error('offline'));
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-fix-4',
      submissionId: 'sub-cache-4',
      focusScore: 60,
      grade: 'C',
      rank: 12,
      isQualified: false,
      isCurrentLeader: false,
    }));

    await act(async () => {
      mount('ch-fix-4');
    });

    expect(latest?.status).toBe('submitted');
    expect(latest?.result?.submissionId).toBe('sub-cache-4');
  });

  it('5. persists guestSessionId with the submission for the evidence chain', async () => {
    otherRpc.mockResolvedValue({ data: { submission_id: 'sub-new-5', focus_score: 80, grade: 'B', rank: 2, is_qualified: true, is_current_leader: false }, error: null });

    await act(async () => {
      mount('ch-fix-5');
    });

    await act(async () => {});

    const raw = localStorage.getItem('focus_challenge_submission_id');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { challengeId: string; submissionId: string; guestSessionId?: string };
    expect(parsed.challengeId).toBe('ch-fix-5');
    expect(parsed.submissionId).toBe('sub-new-5');
    expect(parsed.guestSessionId).toBe('guest-evidence-42');
  });
});

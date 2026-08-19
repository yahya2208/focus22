/**
 * P5.9 — Security & edge-case tests for the challenge system.
 *
 * Covers:
 *   - Expired challenge submission
 *   - Expired claim
 *   - NOT_YOUR_SUBMISSION
 *   - MAX_WINNERS_REACHED
 *   - CLAIM_EXISTS (duplicate claim / reused claim)
 *   - IDOR / authorization (unauthenticated claim creation)
 *   - Race / concurrent submission (duplicate nonce)
 *   - INVALID_RT_COUNT / INVALID_RT_RANGE boundary
 *   - Admin-only RPCs reject non-admin callers
 *   - Claim verify with invalid identifier
 *   - Challenge ended error
 *   - Challenge not started error
 *   - Admin process claim on non-pending claim
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

import {
  submitChallengeScore,
  createChallengeClaim,
  verifyClaimToken,
  getChallengeLeaderboard,
  getPersonalChallengeStats,
} from '../../challenge/challenge-service';
import {
  adminListChallenges,
  adminGetChallengeDetails,
  adminCreateChallenge,
  adminUpdateChallenge,
  adminProcessClaim,
} from '../../challenge/admin-service';
import type { ChallengeSubmitPayload } from '../../challenge/types';

beforeEach(() => {
  mockRpc.mockReset();
});

const VALID_PAYLOAD: ChallengeSubmitPayload = {
  challengeId: '00000000-0000-0000-0000-000000000001',
  rawRts: [200, 210, 195, 205, 215, 200, 210],
  displayLagMs: 16,
  inputLagMs: 12,
  platform: 'Android',
  sessionId: 'session-123',
};

// ── Expired Challenge ──────────────────────────────────────────────────────

describe('P5.9 — Expired / ended challenge', () => {
  it('rejects submission to an ended challenge', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Challenge has ended' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'CHALLENGE_ENDED',
    });
  });

  it('rejects submission to a challenge that has not started', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Challenge has not started' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_STARTED',
    });
  });

  it('rejects submission to a not-found challenge', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Challenge not found' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_FOUND',
    });
  });
});

// ── Expired Claim ──────────────────────────────────────────────────────────

describe('P5.9 — Expired claim', () => {
  it('verify returns expired status for an expired claim', async () => {
    mockRpc.mockResolvedValue({
      data: {
        claim_id: 'cl-exp',
        status: 'expired',
        challenge_name: 'Old Challenge',
        focus_score: 88,
        grade: 'A',
        display_name: 'Player1',
        expires_at: '2026-01-01T00:00:00Z',
        claimed_at: null,
      },
      error: null,
    });

    const result = await verifyClaimToken('EXPIRED123');
    expect(result.status).toBe('expired');
  });

  it('admin process claim rejects expired claim', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Claim has expired' },
    });

    await expect(adminProcessClaim('cl-exp', 'redeem')).rejects.toMatchObject({
      code: 'CLAIM_EXPIRED',
    });
  });
});

// ── NOT_YOUR_SUBMISSION ────────────────────────────────────────────────────

describe('P5.9 — NOT_YOUR_SUBMISSION (IDOR protection)', () => {
  it('claim creation rejects submission belonging to another user', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Submission does not belong to you' },
    });

    await expect(createChallengeClaim('sub-other-user')).rejects.toMatchObject({
      code: 'NOT_YOUR_SUBMISSION',
    });
  });
});

// ── MAX_WINNERS_REACHED ────────────────────────────────────────────────────

describe('P5.9 — MAX_WINNERS_REACHED', () => {
  it('rejects claim when max winners reached (generic message)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Maximum number of winners has been reached' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'MAX_WINNERS_REACHED',
    });
  });

  it('rejects claim when max winners for grade tier reached', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Maximum winners for this grade tier has been reached' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'MAX_WINNERS_REACHED',
    });
  });
});

// ── Duplicate / Reused Claim ───────────────────────────────────────────────

describe('P5.9 — CLAIM_EXISTS (duplicate / reused claim)', () => {
  it('rejects duplicate claim creation', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'A claim already exists for this submission' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'CLAIM_EXISTS',
    });
  });

  it('admin redeem rejects already-redeemed claim', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Claim is not in pending status' },
    });

    await expect(adminProcessClaim('cl-1', 'redeem')).rejects.toMatchObject({
      code: 'CLAIM_NOT_PENDING',
    });
  });

  it('admin revoke rejects non-pending claim', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Claim cannot be revoked in current status' },
    });

    await expect(adminProcessClaim('cl-1', 'revoke')).rejects.toMatchObject({
      code: 'CLAIM_NOT_PENDING',
    });
  });
});

// ── IDOR / Authorization ───────────────────────────────────────────────────

describe('P5.9 — IDOR / Authorization', () => {
  it('createChallengeClaim rejects unauthenticated user', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Authentication required to claim a prize' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('getPersonalChallengeStats rejects unauthenticated user', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Authentication required' },
    });

    await expect(getPersonalChallengeStats('ch-1')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('admin RPCs reject non-admin callers', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Admin access required' },
    });

    await expect(adminListChallenges()).rejects.toMatchObject({
      code: 'ADMIN_REQUIRED',
    });

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Admin access required' },
    });

    await expect(adminGetChallengeDetails('ch-1')).rejects.toMatchObject({
      code: 'ADMIN_REQUIRED',
    });

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Admin access required' },
    });

    await expect(adminCreateChallenge({ name: 'Test' })).rejects.toMatchObject({
      code: 'ADMIN_REQUIRED',
    });

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Admin access required' },
    });

    await expect(adminUpdateChallenge('ch-1', { name: 'New' })).rejects.toMatchObject({
      code: 'ADMIN_REQUIRED',
    });

    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Admin access required' },
    });

    await expect(adminProcessClaim('cl-1', 'redeem')).rejects.toMatchObject({
      code: 'ADMIN_REQUIRED',
    });
  });
});

// ── Race / Concurrent Submission ───────────────────────────────────────────

describe('P5.9 — Race / concurrent submission (duplicate nonce)', () => {
  it('rejects concurrent submission with same nonce', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: { submission_id: 'sub-1', focus_score: 80, grade: 'B', rank: 1, is_qualified: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Duplicate submission' },
      });

    const first = await submitChallengeScore(VALID_PAYLOAD);
    expect(first.submissionId).toBe('sub-1');

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'DUPLICATE_SUBMISSION',
    });
  });

  it('generates unique nonces so client retries are not rejected as duplicates', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: { submission_id: 'sub-1', focus_score: 80, grade: 'B', rank: 1, is_qualified: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { submission_id: 'sub-2', focus_score: 82, grade: 'B', rank: 1, is_qualified: true },
        error: null,
      });

    const r1 = await submitChallengeScore(VALID_PAYLOAD);
    const r2 = await submitChallengeScore(VALID_PAYLOAD);

    expect(r1.submissionId).not.toBe(r2.submissionId);

    const nonce1 = mockRpc.mock.calls[0]![1]!['p_nonce'] as string;
    const nonce2 = mockRpc.mock.calls[1]![1]!['p_nonce'] as string;
    expect(nonce1).not.toBe(nonce2);
  });
});

// ── Invalid RT count / range ───────────────────────────────────────────────

describe('P5.9 — Invalid RT boundaries', () => {
  it('rejects submission with wrong number of RTs', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Expected exactly 7 reaction times' },
    });

    await expect(submitChallengeScore({
      ...VALID_PAYLOAD,
      rawRts: [200, 210, 195],
    })).rejects.toMatchObject({
      code: 'INVALID_RT_COUNT',
    });
  });

  it('rejects RTs out of valid range (too low)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Reaction time out of valid range' },
    });

    await expect(submitChallengeScore({
      ...VALID_PAYLOAD,
      rawRts: [50, 210, 195, 205, 215, 200, 210],
    })).rejects.toMatchObject({
      code: 'INVALID_RT_RANGE',
    });
  });

  it('rejects invalid calibration data', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Invalid display lag' },
    });

    await expect(submitChallengeScore({
      ...VALID_PAYLOAD,
      displayLagMs: -1,
    })).rejects.toMatchObject({
      code: 'INVALID_CALIBRATION',
    });
  });
});

// ── Leaderboard edge cases ─────────────────────────────────────────────────

describe('P5.9 — Leaderboard edge cases', () => {
  it('returns empty array on null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await getChallengeLeaderboard('ch-1');
    expect(result).toEqual([]);
  });

  it('returns empty array on empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const result = await getChallengeLeaderboard('ch-1');
    expect(result).toEqual([]);
  });

  it('handles challenge not found for leaderboard', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Challenge not found' },
    });

    await expect(getChallengeLeaderboard('nonexistent')).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_FOUND',
    });
  });
});

// ── Claim verify edge cases ────────────────────────────────────────────────

describe('P5.9 — Claim verify edge cases', () => {
  it('verify returns invalid status for nonexistent code', async () => {
    mockRpc.mockResolvedValue({
      data: {
        claim_id: '',
        status: 'invalid',
        challenge_name: '',
        focus_score: 0,
        grade: '',
        display_name: '',
        expires_at: '',
        claimed_at: null,
      },
      error: null,
    });

    const result = await verifyClaimToken('NONEXISTENT');
    expect(result.status).toBe('invalid');
  });

  it('verify returns revoked status', async () => {
    mockRpc.mockResolvedValue({
      data: {
        claim_id: 'cl-rev',
        status: 'revoked',
        challenge_name: 'Test',
        focus_score: 90,
        grade: 'A',
        display_name: 'Player',
        expires_at: '2026-12-31T23:59:59Z',
        claimed_at: null,
      },
      error: null,
    });

    const result = await verifyClaimToken('revoked-token');
    expect(result.status).toBe('revoked');
  });

  it('verify returns claimed status with claimedAt', async () => {
    mockRpc.mockResolvedValue({
      data: {
        claim_id: 'cl-done',
        status: 'claimed',
        challenge_name: 'Test',
        focus_score: 90,
        grade: 'A',
        display_name: 'Player',
        expires_at: '2026-12-31T23:59:59Z',
        claimed_at: '2026-08-19T12:00:00Z',
      },
      error: null,
    });

    const result = await verifyClaimToken('done-token');
    expect(result.status).toBe('claimed');
    expect(result.claimedAt).toBe('2026-08-19T12:00:00Z');
  });
});

// ── Admin RPC edge cases ───────────────────────────────────────────────────

describe('P5.9 — Admin RPC edge cases', () => {
  it('adminGetChallengeDetails rejects unknown challenge', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Challenge not found' },
    });

    await expect(adminGetChallengeDetails('nonexistent')).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_FOUND',
    });
  });

  it('adminProcessClaim rejects invalid action', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Invalid action' },
    });

    await expect(adminProcessClaim('cl-1', 'redeem')).rejects.toMatchObject({
      code: 'INVALID_ACTION',
    });
  });

  it('adminListChallenges returns empty on null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await adminListChallenges();
    expect(result).toEqual([]);
  });
});

// ── Network / unknown errors ───────────────────────────────────────────────

describe('P5.9 — Network / unknown error handling', () => {
  it('wraps non-Error throws as NETWORK_ERROR', async () => {
    mockRpc.mockRejectedValue('ECONNREFUSED');

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('wraps Error objects with unknown messages as UNKNOWN_ERROR', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Something entirely unexpected' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });

  it('admin wrapError handles non-Error throws', async () => {
    mockRpc.mockRejectedValue('timeout');

    await expect(adminListChallenges()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('admin wrapError handles unknown Error messages', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Totally unknown admin error' },
    });

    await expect(adminListChallenges()).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });
});

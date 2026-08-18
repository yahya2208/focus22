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

describe('Challenge service — submitChallengeScore', () => {
  it('calls submit_challenge_score RPC with correct parameters', async () => {
    mockRpc.mockResolvedValue({
      data: {
        submission_id: 'sub-1',
        focus_score: 85,
        grade: 'B',
        rank: 3,
        is_qualified: true,
      },
      error: null,
    });

    const result = await submitChallengeScore(VALID_PAYLOAD);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [rpcName, params] = mockRpc.mock.calls[0]!;
    expect(rpcName).toBe('submit_challenge_score');
    expect(params.p_challenge_id).toBe(VALID_PAYLOAD.challengeId);
    expect(params.p_raw_rts).toEqual(VALID_PAYLOAD.rawRts);
    expect(params.p_display_lag_ms).toBe(16);
    expect(params.p_input_lag_ms).toBe(12);
    expect(params.p_platform).toBe('Android');
    expect(params.p_session_id).toBe('session-123');
    expect(typeof params.p_nonce).toBe('string');
    expect(params.p_nonce).toHaveLength(32);

    expect(result.submissionId).toBe('sub-1');
    expect(result.focusScore).toBe(85);
    expect(result.grade).toBe('B');
    expect(result.rank).toBe(3);
    expect(result.isQualified).toBe(true);
  });

  it('generates a fresh nonce for each submission (never reuses)', async () => {
    mockRpc.mockResolvedValue({ data: { submission_id: 's1', focus_score: 80, grade: 'B', rank: 1, is_qualified: true }, error: null });

    await submitChallengeScore(VALID_PAYLOAD);
    await submitChallengeScore(VALID_PAYLOAD);

    const nonce1 = mockRpc.mock.calls[0]![1]!['p_nonce'] as string;
    const nonce2 = mockRpc.mock.calls[1]![1]!['p_nonce'] as string;
    expect(nonce1).not.toBe(nonce2);
  });

  it('nonce is cryptographically random (not Math.random)', async () => {
    mockRpc.mockResolvedValue({ data: { submission_id: 's1', focus_score: 80, grade: 'B', rank: 1, is_qualified: true }, error: null });
    const spy = vi.spyOn(crypto, 'getRandomValues');

    await submitChallengeScore(VALID_PAYLOAD);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does NOT send pre-computed scores to the server', async () => {
    mockRpc.mockResolvedValue({ data: { submission_id: 's1', focus_score: 80, grade: 'B', rank: 1, is_qualified: true }, error: null });

    await submitChallengeScore(VALID_PAYLOAD);

    const params = mockRpc.mock.calls[0]![1]!;
    expect(params).not.toHaveProperty('focus_score');
    expect(params).not.toHaveProperty('grade');
    expect(params).not.toHaveProperty('rt_score');
    expect(params).not.toHaveProperty('consistency_score');
    expect(params).not.toHaveProperty('fatigue_score');
    expect(params).not.toHaveProperty('is_qualified');
    expect(params).not.toHaveProperty('rank');
  });

  it('throws structured error for duplicate nonce', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Duplicate submission' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'DUPLICATE_SUBMISSION',
    });
  });

  it('throws structured error for inactive challenge', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Challenge is not active' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_ACTIVE',
    });
  });

  it('throws structured error for rate limit exceeded', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Rate limit exceeded' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('throws structured error for invalid RT range', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Reaction time out of valid range' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'INVALID_RT_RANGE',
    });
  });

  it('throws NETWORK_ERROR for non-Error throws', async () => {
    mockRpc.mockRejectedValue('connection refused');

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('maps unknown errors to UNKNOWN_ERROR', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Something completely unexpected happened' },
    });

    await expect(submitChallengeScore(VALID_PAYLOAD)).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });

  it('server response is authoritative — client never overrides', async () => {
    mockRpc.mockResolvedValue({
      data: { submission_id: 's1', focus_score: 42, grade: 'D', rank: 99, is_qualified: false },
      error: null,
    });

    const result = await submitChallengeScore(VALID_PAYLOAD);
    expect(result.focusScore).toBe(42);
    expect(result.grade).toBe('D');
    expect(result.rank).toBe(99);
    expect(result.isQualified).toBe(false);
  });
});

describe('Challenge service — createChallengeClaim', () => {
  it('calls create_challenge_claim RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { claim_id: 'c1', code: 'ABCD1234', token: 'tok_abc', expires_at: '2026-08-19T00:00:00Z' },
      error: null,
    });

    const result = await createChallengeClaim('sub-1');
    expect(mockRpc).toHaveBeenCalledWith('create_challenge_claim', { p_submission_id: 'sub-1' });
    expect(result.claimId).toBe('c1');
    expect(result.code).toBe('ABCD1234');
    expect(result.token).toBe('tok_abc');
  });

  it('throws AUTH_REQUIRED for unauthenticated user', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Authentication required to claim a prize' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('throws SUBMISSION_NOT_QUALIFIED for unqualified submission', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Submission is not qualified for a prize' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'SUBMISSION_NOT_QUALIFIED',
    });
  });

  it('throws CLAIM_EXISTS for duplicate claim', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'A claim already exists for this submission' },
    });

    await expect(createChallengeClaim('sub-1')).rejects.toMatchObject({
      code: 'CLAIM_EXISTS',
    });
  });
});

describe('Challenge service — verifyClaimToken', () => {
  it('calls verify_claim_token RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        status: 'pending',
        challenge_name: 'Test Challenge',
        focus_score: 90,
        grade: 'A',
        display_name: 'Player1',
        expires_at: '2026-08-19T00:00:00Z',
        claimed_at: null,
      },
      error: null,
    });

    const result = await verifyClaimToken('ABCD1234');
    expect(mockRpc).toHaveBeenCalledWith('verify_claim_token', { p_identifier: 'ABCD1234' });
    expect(result.status).toBe('pending');
    expect(result.challengeName).toBe('Test Challenge');
    expect(result.displayName).toBe('Player1');
  });
});

describe('Challenge service — getChallengeLeaderboard', () => {
  it('calls get_challenge_leaderboard RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { rank: 1, display_name: 'P1', focus_score: 95, grade: 'A', submitted_at: '2026-08-18T00:00:00Z' },
        { rank: 2, display_name: 'P2', focus_score: 88, grade: 'B', submitted_at: '2026-08-18T01:00:00Z' },
      ],
      error: null,
    });

    const result = await getChallengeLeaderboard('ch-1', 'weekly', 10, 0);
    expect(result).toHaveLength(2);
    expect(result[0]!.displayName).toBe('P1');
    expect(result[1]!.focusScore).toBe(88);
  });

  it('returns empty array on null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await getChallengeLeaderboard('ch-1');
    expect(result).toEqual([]);
  });
});

describe('Challenge service — getPersonalChallengeStats', () => {
  it('calls get_personal_challenge_stats RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        best_score: 92,
        best_grade: 'A',
        total_submissions: 5,
        last_submission_at: '2026-08-18T00:00:00Z',
        personal_rank: 3,
      },
      error: null,
    });

    const result = await getPersonalChallengeStats('ch-1');
    expect(result.bestScore).toBe(92);
    expect(result.totalSubmissions).toBe(5);
    expect(result.personalRank).toBe(3);
  });

  it('throws AUTH_REQUIRED for unauthenticated user', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Authentication required' },
    });

    await expect(getPersonalChallengeStats('ch-1')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
});

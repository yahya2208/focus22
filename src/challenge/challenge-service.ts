/**
 * Challenge System — Client Service (P3)
 *
 * Thin, secure client layer over the approved P2 RPCs.
 *
 * SECURITY INVARIANTS:
 *   - The client NEVER calculates, submits, or overrides:
 *       focus_score, grade, RT score, consistency score, fatigue score,
 *       qualification status, rank
 *   - All scoring is server-authoritative via compute_challenge_score()
 *   - Nonces are generated via Web Crypto API (never Math.random)
 *   - Nonces are generated immediately before each submission
 *   - No database/internal implementation details leak to users
 *
 * ALGORITHM SOURCE:
 *   All RPC functions are defined in supabase/challenge-system/03-challenge-rpcs.sql
 */

import { getSupabaseClient } from '../core/supabase/client';
import { generateNonce } from './nonce';
import { REACTION } from '../core/scientific/constants';
import type {
  ChallengeSubmitPayload,
  ChallengeSubmitResult,
  ChallengeClaimResult,
  GuestClaimResult,
  GuestOwnershipTransferResult,
  ChallengeVerifyResult,
  LeaderboardEntry,
  LeaderboardPeriod,
  PersonalChallengeStats,
  ChallengePublicInfo,
  CurrentLeaderRecoveryState,
  ChallengeError,
  ChallengeErrorCode,
} from './types';

// ── Error Mapping ────────────────────────────────────────────────────────────

const RPC_ERROR_MAP: ReadonlyMap<string, ChallengeErrorCode> = new Map([
  ['Challenge not found', 'CHALLENGE_NOT_FOUND'],
  ['Challenge is not active', 'CHALLENGE_NOT_ACTIVE'],
  ['Challenge has not started', 'CHALLENGE_NOT_STARTED'],
  ['Challenge has ended', 'CHALLENGE_ENDED'],
  ['Challenge has not been finalized', 'CHALLENGE_NOT_FINALIZED'],
  ['Duplicate submission', 'DUPLICATE_SUBMISSION'],
  ['Rate limit exceeded', 'RATE_LIMIT_EXCEEDED'],
  ['Expected exactly 7 reaction times', 'INVALID_RT_COUNT'],
  ['Reaction time out of valid range', 'INVALID_RT_RANGE'],
  ['Invalid display lag', 'INVALID_CALIBRATION'],
  ['Invalid input lag', 'INVALID_CALIBRATION'],
  ['Authentication required to claim a prize', 'AUTH_REQUIRED'],
  ['Authentication required', 'AUTH_REQUIRED'],
  ['Submission does not belong to you', 'NOT_YOUR_SUBMISSION'],
  ['Submission is not qualified for a prize', 'SUBMISSION_NOT_QUALIFIED'],
  ['Submission not found', 'CHALLENGE_NOT_FOUND'],
  ['A claim already exists for this submission', 'CLAIM_EXISTS'],
  ['Maximum number of winners has been reached', 'MAX_WINNERS_REACHED'],
  ['Maximum winners for this grade tier has been reached', 'MAX_WINNERS_REACHED'],
  ['Claim has expired', 'CLAIM_EXPIRED'],
  ['Claim is not in pending status', 'CLAIM_NOT_PENDING'],
  ['Claim cannot be revoked in current status', 'CLAIM_NOT_PENDING'],
  ['Claim not found', 'CHALLENGE_NOT_FOUND'],
  ['Invalid action', 'INVALID_ACTION'],
  ['Admin access required', 'ADMIN_REQUIRED'],
]);

function mapRpcError(errorMessage: string): ChallengeError {
  for (const [pattern, code] of RPC_ERROR_MAP) {
    if (errorMessage.includes(pattern)) {
      return { code, message: errorMessage };
    }
  }
  return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
}

function wrapError(error: unknown): ChallengeError {
  if (error && typeof error === 'object' && 'message' in error) {
    const rawMsg = String((error as { message: unknown }).message);
    const mapped = mapRpcError(rawMsg);
    console.error('[CHALLENGE CLAIM DEBUG] wrapError mapped:', { rawMessage: rawMsg, mappedCode: mapped.code, mappedMessage: mapped.message, errorKeys: Object.keys(error as object) });
    return mapped;
  }
  if (typeof error === 'string') {
    const mapped = mapRpcError(error);
    if (mapped.code !== 'UNKNOWN_ERROR') return mapped;
  }
  return { code: 'NETWORK_ERROR', message: 'Network error — please try again' };
}

// ── Submission ───────────────────────────────────────────────────────────────

/**
 * Submits a game result to the challenge system.
 *
 * The server recomputes the score from raw RTs using compute_challenge_score().
 * The client MUST NOT send any pre-computed score values.
 *
 * @returns The server-computed result including focus score, grade, rank, and
 *          qualification status.
 * @throws ChallengeError on validation, rate limit, or network errors.
 */
export async function submitChallengeScore(
  payload: ChallengeSubmitPayload,
): Promise<ChallengeSubmitResult> {
  const nonce = generateNonce();
  const roundedRts = payload.rawRts.map((rt) => Math.round(rt));

  for (const rt of roundedRts) {
    if (rt < REACTION.MIN_RT_MS || rt > REACTION.MAX_RT_MS) {
      throw { code: 'INVALID_RT_RANGE', message: 'Reaction time out of valid range' } as ChallengeError;
    }
  }

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('submit_challenge_score', {
      p_challenge_id: payload.challengeId,
      p_raw_rts: roundedRts,
      p_display_lag_ms: payload.displayLagMs,
      p_input_lag_ms: payload.inputLagMs,
      p_platform: payload.platform,
      p_nonce: nonce,
      p_session_id: payload.sessionId ?? null,
      p_guest_session_id: payload.guestSessionId ?? null,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    submission_id: string;
    focus_score: number;
    grade: string;
    rank: number;
    is_qualified: boolean;
    is_current_leader: boolean;
  };

  return {
    submissionId: row.submission_id,
    focusScore: row.focus_score,
    grade: row.grade as ChallengeSubmitResult['grade'],
    rank: row.rank,
    isQualified: row.is_qualified,
    isCurrentLeader: row.is_current_leader,
  };
}

// ── Claim ────────────────────────────────────────────────────────────────────

/**
 * Creates a prize claim for a qualified submission.
 * Requires authentication.
 *
 * @returns Claim credentials (code, token) — shown to user ONCE, never stored.
 * @throws ChallengeError on auth, validation, or limit errors.
 */
export async function createChallengeClaim(
  submissionId: string,
): Promise<ChallengeClaimResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('create_challenge_claim', {
      p_submission_id: submissionId,
    }));
  } catch (e) {
    console.error('[CHALLENGE CLAIM DEBUG] createChallengeClaim threw:', e);
    throw wrapError(e);
  }

  if (error) {
    console.error('[CHALLENGE CLAIM DEBUG] createChallengeClaim rpc error:', {
      rpc: 'create_challenge_claim',
      submissionId,
      status: (error as Record<string, unknown>)?.status ?? (error as Record<string, unknown>)?.statusCode ?? 'unknown',
      code: (error as Record<string, unknown>)?.code ?? 'unknown',
      message: (error as Record<string, unknown>)?.message ?? 'unknown',
      details: (error as Record<string, unknown>)?.details ?? 'none',
      hint: (error as Record<string, unknown>)?.hint ?? 'none',
    });
    throw wrapError(error);
  }
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    claim_id: string;
    code: string;
    token: string;
    expires_at: string;
  };

  return {
    claimId: row.claim_id,
    code: row.code,
    token: row.token,
    expiresAt: row.expires_at,
  };
}

// ── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verifies a claim code or token (e.g. during QR scan or manual entry).
 * Accessible without authentication (shop staff may not have accounts).
 *
 * @returns Claim status and display information.
 */
export async function verifyClaimToken(
  identifier: string,
): Promise<ChallengeVerifyResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('verify_claim_token', {
      p_identifier: identifier,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    claim_id: string;
    status: string;
    challenge_name: string;
    focus_score: number;
    grade: string;
    display_name: string;
    expires_at: string;
    claimed_at: string | null;
    is_guest_claim: boolean;
  };

  return {
    claimId: row.claim_id,
    status: row.status as ChallengeVerifyResult['status'],
    challengeName: row.challenge_name,
    focusScore: row.focus_score,
    grade: row.grade,
    displayName: row.display_name,
    expiresAt: row.expires_at,
    claimedAt: row.claimed_at,
    isGuestClaim: row.is_guest_claim,
  };
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

/**
 * Fetches the public leaderboard for a challenge.
 * Returns only safe fields: rank, display_name, focus_score, grade, submitted_at.
 * NEVER exposes raw RTs, calibration, user IDs, or session IDs.
 */
export async function getChallengeLeaderboard(
  challengeId: string,
  period: LeaderboardPeriod = 'all_time',
  limit = 50,
  offset = 0,
): Promise<LeaderboardEntry[]> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('get_challenge_leaderboard', {
      p_challenge_id: challengeId,
      p_period: period,
      p_limit: limit,
      p_offset: offset,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) return [];

  return (data as Array<{
    rank: number;
    display_name: string;
    focus_score: number;
    grade: string;
    submitted_at: string;
  }>).map((row) => ({
    rank: row.rank,
    displayName: row.display_name,
    focusScore: row.focus_score,
    grade: row.grade,
    submittedAt: row.submitted_at,
  }));
}

// ── Personal Stats ───────────────────────────────────────────────────────────

/**
 * Fetches the current user's personal stats for a challenge.
 * Requires authentication.
 */
export async function getPersonalChallengeStats(
  challengeId: string,
): Promise<PersonalChallengeStats> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('get_personal_challenge_stats', {
      p_challenge_id: challengeId,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    best_score: number | null;
    best_grade: string | null;
    total_submissions: number;
    last_submission_at: string | null;
    personal_rank: number;
  };

  return {
    bestScore: row.best_score,
    bestGrade: row.best_grade,
    totalSubmissions: row.total_submissions,
    lastSubmissionAt: row.last_submission_at,
    personalRank: row.personal_rank,
  };
}

// ── Recovery ─────────────────────────────────────────────────────────────────

/**
 * Recovers the current leader state after a browser refresh.
 * Requires authentication.
 *
 * @returns Recovery state including submission, rank, leadership status.
 *          is_current_leader is INFORMATIONAL ONLY — no claim rights.
 * @throws ChallengeError on auth or network errors.
 */
export async function recoverCurrentLeaderState(
  challengeId: string,
): Promise<CurrentLeaderRecoveryState> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('recover_current_leader_state', {
      p_challenge_id: challengeId,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    submission_id: string | null;
    focus_score?: number;
    grade?: string;
    rank?: number;
    is_qualified?: boolean;
    is_current_leader?: boolean;
  };

  return {
    submissionId: row.submission_id,
    focusScore: row.focus_score,
    grade: row.grade,
    rank: row.rank,
    isQualified: row.is_qualified,
    isCurrentLeader: row.is_current_leader,
  };
}

// ── Public Challenge Info ────────────────────────────────────────────────────

/**
 * Fetches safe public information for a challenge page.
 * Accessible without authentication (anon + authenticated).
 *
 * @returns Challenge details, top 5 leaderboard, and user's own stats (if authenticated).
 * @throws ChallengeError on not-found or network errors.
 */
export async function getChallengePublicInfo(
  challengeId: string,
): Promise<ChallengePublicInfo> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('get_challenge_public_info', {
      p_challenge_id: challengeId,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    challenge: {
      id: string;
      name: string;
      description: string | null;
      status: string;
      starts_at: string | null;
      ends_at: string | null;
      prize_description: string | null;
      is_finalized: boolean;
      final_winner_name: string | null;
      winner_submission_id: string | null;
    };
    top_5: Array<{
      rank: number;
      display_name: string;
      focus_score: number;
      grade: string;
    }> | null;
    user: {
      best_score: number | null;
      best_grade: string | null;
      best_submission_id: string | null;
      personal_rank: number;
      total_submissions: number;
    } | null;
  };

  return {
    challenge: {
      id: row.challenge.id,
      name: row.challenge.name,
      description: row.challenge.description,
      status: row.challenge.status as ChallengePublicInfo['challenge']['status'],
      startsAt: row.challenge.starts_at,
      endsAt: row.challenge.ends_at,
      prizeDescription: row.challenge.prize_description,
      isFinalized: row.challenge.is_finalized,
      finalWinnerName: row.challenge.final_winner_name,
      winnerSubmissionId: row.challenge.winner_submission_id,
    },
    top5: (row.top_5 ?? []).map((e) => ({
      rank: e.rank,
      displayName: e.display_name,
      focusScore: e.focus_score,
      grade: e.grade,
    })),
    user: row.user ? {
      bestScore: row.user.best_score,
      bestGrade: row.user.best_grade,
      bestSubmissionId: row.user.best_submission_id,
      personalRank: row.user.personal_rank,
      totalSubmissions: row.user.total_submissions,
    } : null,
  };
}

// ── Guest Claim ───────────────────────────────────────────────────────────────

/**
 * Transfers a guest submission to the authenticated user's account.
 * Requires authentication.
 * Must be called BEFORE claiming — unlocks the claim button.
 *
 * @returns Transfer confirmation including updated rank.
 */
export async function claimGuestSubmission(
  submissionId: string,
): Promise<GuestOwnershipTransferResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('claim_guest_submission', {
      p_submission_id: submissionId,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    submission_id: string;
    focus_score: number;
    grade: string;
    rank: number;
  };

  return {
    submissionId: row.submission_id,
    focusScore: row.focus_score,
    grade: row.grade,
    rank: row.rank,
  };
}

/**
 * Creates a prize claim for a guest submission (anonymous flow).
 * No authentication required — uses guest_session_id.
 *
 * @returns Guest claim credentials (code, token) — shown once, never stored.
 */
export async function createGuestClaim(
  submissionId: string,
  guestSessionId: string,
): Promise<GuestClaimResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('create_guest_claim', {
      p_submission_id: submissionId,
      p_guest_session_id: guestSessionId,
    }));
  } catch (e) {
    console.error('[CHALLENGE CLAIM DEBUG] createGuestClaim threw:', e);
    throw wrapError(e);
  }

  if (error) {
    console.error('[CHALLENGE CLAIM DEBUG] createGuestClaim rpc error:', {
      rpc: 'create_guest_claim',
      submissionId,
      guestSessionId: guestSessionId.substring(0, 8) + '...',
      status: (error as Record<string, unknown>)?.status ?? (error as Record<string, unknown>)?.statusCode ?? 'unknown',
      code: (error as Record<string, unknown>)?.code ?? 'unknown',
      message: (error as Record<string, unknown>)?.message ?? 'unknown',
      details: (error as Record<string, unknown>)?.details ?? 'none',
      hint: (error as Record<string, unknown>)?.hint ?? 'none',
    });
    throw wrapError(error);
  }
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    claim_id: string;
    code: string;
    token: string;
    expires_at: string;
  };

  return {
    claimId: row.claim_id,
    code: row.code,
    token: row.token,
    expiresAt: row.expires_at,
  };
}

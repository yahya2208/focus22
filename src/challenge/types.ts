/**
 * Challenge System — Type Definitions (P3)
 *
 * All scoring, grading, qualification, and rank fields are SERVER-AUTHORITATIVE.
 * The client NEVER computes, stores, or overrides these values.
 */

// ── Submission ───────────────────────────────────────────────────────────────

export interface ChallengeSubmitPayload {
  readonly challengeId: string;
  readonly rawRts: readonly number[];
  readonly displayLagMs: number;
  readonly inputLagMs: number;
  readonly platform: string;
  readonly sessionId?: string;
}

export interface ChallengeSubmitResult {
  readonly submissionId: string;
  readonly focusScore: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly rank: number;
  readonly isQualified: boolean;
}

// ── Claim ────────────────────────────────────────────────────────────────────

export interface ChallengeClaimResult {
  readonly claimId: string;
  readonly code: string;
  readonly token: string;
  readonly expiresAt: string;
}

// ── Verify ───────────────────────────────────────────────────────────────────

export type ClaimVerifyStatus = 'pending' | 'claimed' | 'expired' | 'revoked' | 'invalid';

export interface ChallengeVerifyResult {
  readonly status: ClaimVerifyStatus;
  readonly challengeName: string;
  readonly focusScore: number;
  readonly grade: string;
  readonly displayName: string;
  readonly expiresAt: string;
  readonly claimedAt: string | null;
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export type LeaderboardPeriod = 'all_time' | 'weekly' | 'daily';

export interface LeaderboardEntry {
  readonly rank: number;
  readonly displayName: string;
  readonly focusScore: number;
  readonly grade: string;
  readonly submittedAt: string;
}

// ── Personal Stats ───────────────────────────────────────────────────────────

export interface PersonalChallengeStats {
  readonly bestScore: number | null;
  readonly bestGrade: string | null;
  readonly totalSubmissions: number;
  readonly lastSubmissionAt: string | null;
  readonly personalRank: number;
}

// ── Error Types ──────────────────────────────────────────────────────────────

export type ChallengeErrorCode =
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_NOT_ACTIVE'
  | 'CHALLENGE_NOT_STARTED'
  | 'CHALLENGE_ENDED'
  | 'DUPLICATE_SUBMISSION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_RT_COUNT'
  | 'INVALID_RT_RANGE'
  | 'INVALID_CALIBRATION'
  | 'AUTH_REQUIRED'
  | 'NOT_YOUR_SUBMISSION'
  | 'SUBMISSION_NOT_QUALIFIED'
  | 'CLAIM_EXISTS'
  | 'MAX_WINNERS_REACHED'
  | 'CLAIM_EXPIRED'
  | 'CLAIM_NOT_PENDING'
  | 'INVALID_ACTION'
  | 'ADMIN_REQUIRED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface ChallengeError {
  readonly code: ChallengeErrorCode;
  readonly message: string;
}

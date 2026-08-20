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
  readonly guestSessionId?: string;
}

export interface ChallengeSubmitResult {
  readonly submissionId: string;
  readonly focusScore: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly rank: number;
  readonly isQualified: boolean;
  readonly isCurrentLeader: boolean;
}

// ── Claim ────────────────────────────────────────────────────────────────────

export interface ChallengeClaimResult {
  readonly claimId: string;
  readonly code: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface GuestClaimResult {
  readonly claimId: string;
  readonly code: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface GuestOwnershipTransferResult {
  readonly submissionId: string;
  readonly focusScore: number;
  readonly grade: string;
  readonly rank: number;
}

// ── Public Challenge Info ───────────────────────────────────────────────────

export interface ChallengePublicInfo {
  readonly challenge: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly status: ChallengeStatus;
    readonly startsAt: string | null;
    readonly endsAt: string | null;
    readonly prizeDescription: string | null;
    readonly isFinalized: boolean;
    readonly finalWinnerName: string | null;
    readonly winnerSubmissionId: string | null;
  };
  readonly top5: ReadonlyArray<{
    readonly rank: number;
    readonly displayName: string;
    readonly focusScore: number;
    readonly grade: string;
  }>;
  readonly user: {
    readonly bestScore: number | null;
    readonly bestGrade: string | null;
    readonly bestSubmissionId: string | null;
    readonly personalRank: number;
    readonly totalSubmissions: number;
  } | null;
}

// ── Current Leader Recovery ────────────────────────────────────────────────

export interface CurrentLeaderRecoveryState {
  readonly submissionId: string | null;
  readonly focusScore?: number;
  readonly grade?: string;
  readonly rank?: number;
  readonly isQualified?: boolean;
  readonly isCurrentLeader?: boolean;
}

// ── Verify ───────────────────────────────────────────────────────────────────

export type ClaimVerifyStatus = 'pending' | 'claimed' | 'expired' | 'revoked' | 'invalid';

export interface ChallengeVerifyResult {
  readonly claimId: string;
  readonly status: ClaimVerifyStatus;
  readonly challengeName: string;
  readonly focusScore: number;
  readonly grade: string;
  readonly displayName: string;
  readonly expiresAt: string;
  readonly claimedAt: string | null;
  readonly isGuestClaim: boolean;
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
  | 'CHALLENGE_NOT_FINALIZED'
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

// ── Admin Types ──────────────────────────────────────────────────────────────

export type ChallengeStatus = 'draft' | 'active' | 'paused' | 'ended' | 'archived';

export interface AdminChallengeRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly campaignId: string | null;
  readonly status: ChallengeStatus;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly participantCount: number;
  readonly qualifiedCount: number;
  readonly claimCount: number;
  readonly createdAt: string;
}

export interface AdminChallengeDetail {
  readonly challenge: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly campaign_id: string | null;
    readonly status: ChallengeStatus;
    readonly starts_at: string | null;
    readonly ends_at: string | null;
    readonly qualification_rules: Record<string, unknown>;
    readonly prize_config: Record<string, unknown>;
    readonly created_by: string;
    readonly created_at: string;
    readonly final_winner_submission_id: string | null;
  };
  readonly participantCount: number;
  readonly qualifiedCount: number;
  readonly claimCount: number;
  readonly pendingClaims: number;
  readonly redeemedClaims: number;
  readonly winnerSubmissionId: string | null;
  readonly winnerName: string | null;
  readonly winnerScore: number | null;
  readonly winnerGrade: string | null;
  readonly winnerIsGuest: boolean;
  readonly winnerClaimStatus: string | null;
  readonly winnerClaimId: string | null;
}

export interface AdminCreateChallengeParams {
  readonly name: string;
  readonly description?: string;
  readonly campaignId?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly qualificationRules?: Record<string, unknown>;
  readonly prizeConfig?: Record<string, unknown>;
}

export interface AdminUpdateChallengeParams {
  readonly name?: string;
  readonly description?: string;
  readonly status?: ChallengeStatus;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly qualificationRules?: Record<string, unknown>;
  readonly prizeConfig?: Record<string, unknown>;
  readonly campaignId?: string;
}

export type ClaimProcessAction = 'redeem' | 'revoke';

export interface AdminClaimProcessResult {
  readonly status: string;
}

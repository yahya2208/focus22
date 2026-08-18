/**
 * Challenge System — Public API (P3 + P4)
 *
 * Re-export all public types and service functions.
 */

export {
  submitChallengeScore,
  createChallengeClaim,
  verifyClaimToken,
  getChallengeLeaderboard,
  getPersonalChallengeStats,
} from './challenge-service';

export { generateNonce, isValidNonceFormat } from './nonce';

export { getActiveChallengeId, setActiveChallengeId } from './challenge-context';

export type { SubmissionStatus, UseChallengeSubmissionResult, UseChallengeSubmissionParams } from '../hooks/useChallengeSubmission';

export type {
  ChallengeSubmitPayload,
  ChallengeSubmitResult,
  ChallengeClaimResult,
  ChallengeVerifyResult,
  LeaderboardEntry,
  LeaderboardPeriod,
  PersonalChallengeStats,
  ChallengeError,
  ChallengeErrorCode,
  ClaimVerifyStatus,
} from './types';

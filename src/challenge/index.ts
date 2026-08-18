/**
 * Challenge System — Public API (P3)
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

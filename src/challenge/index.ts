/**
 * Challenge System — Public API (P3 + P4 + P5)
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

export {
  adminListChallenges,
  adminGetChallengeDetails,
  adminCreateChallenge,
  adminUpdateChallenge,
  adminProcessClaim,
} from './admin-service';

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
  ChallengeStatus,
  AdminChallengeRow,
  AdminChallengeDetail,
  AdminCreateChallengeParams,
  AdminUpdateChallengeParams,
  ClaimProcessAction,
  AdminClaimProcessResult,
} from './types';

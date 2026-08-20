/**
 * Challenge System — Public API (P3 + P4 + P5)
 *
 * Re-export all public types and service functions.
 */

export {
  submitChallengeScore,
  createChallengeClaim,
  recoverCurrentLeaderState,
  getChallengePublicInfo,
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
  finalizeChallenge,
} from './admin-service';

export type { FinalizeChallengeResult } from './admin-service';

export { generateNonce, isValidNonceFormat } from './nonce';

export { getActiveChallengeId, setActiveChallengeId } from './challenge-context';

export type { SubmissionStatus, UseChallengeSubmissionResult, UseChallengeSubmissionParams } from '../hooks/useChallengeSubmission';

export type {
  ChallengeSubmitPayload,
  ChallengeSubmitResult,
  ChallengeClaimResult,
  ChallengeVerifyResult,
  ChallengePublicInfo,
  CurrentLeaderRecoveryState,
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

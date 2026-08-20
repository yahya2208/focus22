/**
 * Challenge System — Admin Service (P5)
 *
 * Thin client wrappers over the 5 admin RPCs.
 * All RPCs are SECURITY DEFINER with catalog_is_admin() gate.
 */

import { getSupabaseClient } from '../core/supabase/client';
import type {
  AdminChallengeRow,
  AdminChallengeDetail,
  AdminCreateChallengeParams,
  AdminUpdateChallengeParams,
  ClaimProcessAction,
  AdminClaimProcessResult,
  ChallengeError,
} from './types';

function wrapError(error: unknown): ChallengeError {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    if (msg.includes('Admin access required')) return { code: 'ADMIN_REQUIRED', message: msg };
    if (msg.includes('Challenge not found')) return { code: 'CHALLENGE_NOT_FOUND', message: msg };
    if (msg.includes('Claim not found')) return { code: 'CHALLENGE_NOT_FOUND', message: msg };
    if (msg.includes('Claim is not in pending status') || msg.includes('Claim cannot be revoked in current status')) return { code: 'CLAIM_NOT_PENDING', message: msg };
    if (msg.includes('Claim has expired')) return { code: 'CLAIM_EXPIRED', message: msg };
    if (msg.includes('Invalid action')) return { code: 'INVALID_ACTION', message: msg };
    return { code: 'UNKNOWN_ERROR', message: msg };
  }
  return { code: 'NETWORK_ERROR', message: 'Network error — please try again' };
}

// ── List Challenges ──────────────────────────────────────────────────────────

export async function adminListChallenges(
  status?: string | null,
  limit = 50,
  offset = 0,
): Promise<AdminChallengeRow[]> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('admin_list_challenges', {
      p_status: status ?? null,
      p_limit: limit,
      p_offset: offset,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) return [];

  return (data as Array<{
    id: string;
    name: string;
    description: string | null;
    campaign_id: string | null;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    participant_count: number;
    qualified_count: number;
    claim_count: number;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    campaignId: row.campaign_id,
    status: row.status as AdminChallengeRow['status'],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    participantCount: row.participant_count,
    qualifiedCount: row.qualified_count,
    claimCount: row.claim_count,
    createdAt: row.created_at,
  }));
}

// ── Get Challenge Details ────────────────────────────────────────────────────

export async function adminGetChallengeDetails(
  challengeId: string,
): Promise<AdminChallengeDetail> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('admin_get_challenge_details', {
      p_challenge_id: challengeId,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    challenge: AdminChallengeDetail['challenge'];
    participant_count: number;
    qualified_count: number;
    claim_count: number;
    pending_claims: number;
    redeemed_claims: number;
    winner_submission_id: string | null;
    winner_name: string | null;
    winner_score: number | null;
    winner_grade: string | null;
    winner_is_guest: boolean;
    winner_claim_status: string | null;
    winner_claim_id: string | null;
  };

  return {
    challenge: row.challenge,
    participantCount: row.participant_count,
    qualifiedCount: row.qualified_count,
    claimCount: row.claim_count,
    pendingClaims: row.pending_claims,
    redeemedClaims: row.redeemed_claims,
    winnerSubmissionId: row.winner_submission_id,
    winnerName: row.winner_name,
    winnerScore: row.winner_score,
    winnerGrade: row.winner_grade,
    winnerIsGuest: row.winner_is_guest,
    winnerClaimStatus: row.winner_claim_status,
    winnerClaimId: row.winner_claim_id,
  };
}

// ── Create Challenge ─────────────────────────────────────────────────────────

export async function adminCreateChallenge(
  params: AdminCreateChallengeParams,
): Promise<AdminChallengeDetail['challenge']> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('admin_create_challenge', {
      p_name: params.name,
      p_description: params.description ?? null,
      p_campaign_id: params.campaignId ?? null,
      p_starts_at: params.startsAt ?? null,
      p_ends_at: params.endsAt ?? null,
      p_qualification_rules: params.qualificationRules ?? {},
      p_prize_config: params.prizeConfig ?? {},
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  return data as AdminChallengeDetail['challenge'];
}

// ── Update Challenge ─────────────────────────────────────────────────────────

export async function adminUpdateChallenge(
  challengeId: string,
  params: AdminUpdateChallengeParams,
): Promise<AdminChallengeDetail['challenge']> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.status !== undefined) updates.status = params.status;
  if (params.startsAt !== undefined) updates.starts_at = params.startsAt;
  if (params.endsAt !== undefined) updates.ends_at = params.endsAt;
  if (params.qualificationRules !== undefined) updates.qualification_rules = params.qualificationRules;
  if (params.prizeConfig !== undefined) updates.prize_config = params.prizeConfig;
  if (params.campaignId !== undefined) updates.campaign_id = params.campaignId;

  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('admin_update_challenge', {
      p_challenge_id: challengeId,
      p_updates: updates,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  return data as AdminChallengeDetail['challenge'];
}

// ── Process Claim ────────────────────────────────────────────────────────────

export async function adminProcessClaim(
  claimId: string,
  action: ClaimProcessAction,
): Promise<AdminClaimProcessResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('admin_process_claim', {
      p_claim_id: claimId,
      p_action: action,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  return { status: (data as { status: string }).status };
}

// ── Finalize Challenge ───────────────────────────────────────────────────────

export interface FinalizeChallengeResult {
  readonly winnerId: string | null;
  readonly focusScore: number | null;
  readonly grade: string | null;
  readonly displayName: string | null;
  readonly alreadyFinalized: boolean;
}

/**
 * Finalizes a challenge after it has ended.
 * Requires admin authorization. Atomic and idempotent.
 *
 * @returns Final winner information, or null winner if no qualified submissions.
 * @throws ChallengeError on auth, validation, or network errors.
 */
export async function finalizeChallenge(
  challengeId: string,
): Promise<FinalizeChallengeResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('finalize_challenge', {
      p_challenge_id: challengeId,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    winner_id?: string | null;
    winner?: string | null;
    focus_score?: number | null;
    grade?: string | null;
    display_name?: string | null;
    already_finalized?: boolean;
    message?: string;
  };

  return {
    winnerId: row.winner_id ?? row.winner ?? null,
    focusScore: row.focus_score ?? null,
    grade: row.grade ?? null,
    displayName: row.display_name ?? null,
    alreadyFinalized: row.already_finalized ?? false,
  };
}

// ── Process Guest Claim ───────────────────────────────────────────────────────

/**
 * Admin processes a guest claim (redeem or revoke).
 * Requires admin authorization.
 *
 * @returns Updated claim status.
 */
export async function adminProcessGuestClaim(
  claimId: string,
  action: ClaimProcessAction,
): Promise<AdminClaimProcessResult> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await getSupabaseClient().rpc('admin_process_guest_claim', {
      p_claim_id: claimId,
      p_action: action,
    }));
  } catch (e) {
    throw wrapError(e);
  }

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  return { status: (data as { status: string }).status };
}

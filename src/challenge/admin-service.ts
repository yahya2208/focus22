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
    if (msg.includes('Claim is not in pending status')) return { code: 'CLAIM_NOT_PENDING', message: msg };
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
  const { data, error } = await getSupabaseClient().rpc('admin_list_challenges', {
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  });

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
  const { data, error } = await getSupabaseClient().rpc('admin_get_challenge_details', {
    p_challenge_id: challengeId,
  });

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  const row = data as {
    challenge: AdminChallengeDetail['challenge'];
    participant_count: number;
    qualified_count: number;
    claim_count: number;
    pending_claims: number;
    redeemed_claims: number;
  };

  return {
    challenge: row.challenge,
    participantCount: row.participant_count,
    qualifiedCount: row.qualified_count,
    claimCount: row.claim_count,
    pendingClaims: row.pending_claims,
    redeemedClaims: row.redeemed_claims,
  };
}

// ── Create Challenge ─────────────────────────────────────────────────────────

export async function adminCreateChallenge(
  params: AdminCreateChallengeParams,
): Promise<AdminChallengeDetail['challenge']> {
  const { data, error } = await getSupabaseClient().rpc('admin_create_challenge', {
    p_name: params.name,
    p_description: params.description ?? null,
    p_campaign_id: params.campaignId ?? null,
    p_starts_at: params.startsAt ?? null,
    p_ends_at: params.endsAt ?? null,
    p_qualification_rules: params.qualificationRules ?? {},
    p_prize_config: params.prizeConfig ?? {},
  });

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

  const { data, error } = await getSupabaseClient().rpc('admin_update_challenge', {
    p_challenge_id: challengeId,
    p_updates: updates,
  });

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  return data as AdminChallengeDetail['challenge'];
}

// ── Process Claim ────────────────────────────────────────────────────────────

export async function adminProcessClaim(
  claimId: string,
  action: ClaimProcessAction,
): Promise<AdminClaimProcessResult> {
  const { data, error } = await getSupabaseClient().rpc('admin_process_claim', {
    p_claim_id: claimId,
    p_action: action,
  });

  if (error) throw wrapError(error);
  if (!data) throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as ChallengeError;

  return { status: (data as { status: string }).status };
}

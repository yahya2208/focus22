import { getSupabaseClient } from '../core/supabase/client';

/**
 * Pilot workspace eligibility (P1 — UI visibility ONLY, never authority).
 *
 * Source of truth for *detection*: the caller's OWN membership rows, read
 * through the pre-existing RLS self-read policies —
 *   "Operator read own membership" (00070, user_id = auth.uid()) and
 *   "Courier read own membership"  (00068, user_id = auth.uid()),
 * backed by GRANT SELECT ON pilot_store_operators / pilot_couriers
 * TO authenticated. No new RPC, no backend change of any kind.
 *
 * What this module NEVER does:
 * - It never grants, implies, or enforces backend authority. Every pilot
 *   action stays guarded server-side (fn_admin_uid / active-membership
 *   re-checks / RLS). A crafted membership list in the client grants nothing.
 * - It never rewrites public.users.role and never invents a global role:
 *   operator/courier remain membership rows, not application roles.
 *
 * Multiple-membership precedence (least surprise, entry visibility only):
 *   operational (active + ready) > not-ready (active, not ready)
 *     > pending > suspended/inactive > none.
 * An admin/super_admin global role is always eligible to *view* (they already
 * manage via fn_admin_uid()); data shown remains server-filtered.
 */
export type PilotMembershipStatus =
  | 'pending'
  | 'active'
  | 'inactive'
  | 'suspended'
  | string;

export interface PilotMembership {
  readonly storeId: string;
  readonly status: PilotMembershipStatus;
  readonly operationalReady: boolean;
}

export type PilotEntryState =
  | 'none'
  | 'pending'
  | 'not-ready'
  | 'suspended'
  | 'operational';

function toMembership(row: Record<string, unknown>): PilotMembership {
  return {
    storeId: String(row['store_id'] ?? ''),
    status: String(row['status'] ?? ''),
    operationalReady: row['operational_ready'] === true,
  };
}

/** Own operator memberships (RLS restricts to caller rows; [] when none). */
export async function fetchMyOperatorMemberships(
  userId: string,
): Promise<PilotMembership[]> {
  const { data, error } = await getSupabaseClient()
    .from('pilot_store_operators')
    .select('store_id, status, operational_ready')
    .eq('user_id', userId);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toMembership);
}

/** Own courier memberships (RLS restricts to caller rows; [] when none). */
export async function fetchMyCourierMemberships(
  userId: string,
): Promise<PilotMembership[]> {
  const { data, error } = await getSupabaseClient()
    .from('pilot_couriers')
    .select('store_id, status, operational_ready')
    .eq('user_id', userId);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toMembership);
}

/** Best entry state across (possibly several) memberships. */
export function resolvePilotEntryState(
  memberships: readonly PilotMembership[],
): PilotEntryState {
  if (memberships.length === 0) return 'none';
  if (memberships.some((m) => m.status === 'active' && m.operationalReady)) {
    return 'operational';
  }
  if (memberships.some((m) => m.status === 'active')) return 'not-ready';
  if (memberships.some((m) => m.status === 'pending')) return 'pending';
  return 'suspended';
}

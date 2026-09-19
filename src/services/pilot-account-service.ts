/**
 * Family account service (Gate A).
 *
 * Wraps the server-authoritative family/account RPCs added by 00100:
 *   - pilot_my_family()   → the caller's active principal membership + family.
 *   - pilot_my_account()  → SUM(ledger.amount)-based balance + open debts.
 *
 * There is no client-side balance math anywhere: the balance arrives as a
 * single server-computed number. `debts` is display-only tracking of the
 * uncovered remainder of PURCHASE ledger rows — it is never added to the
 * balance on the client (mirroring the 00103 invariant).
 */
import { getSupabaseClient } from '../core/supabase/client';

export interface PilotFamily {
  readonly member_id: string;
  readonly user_id: string;
  readonly family_id: string;
  readonly role: string;
  readonly status: string;
  readonly family_name: string;
  readonly family_name_ar: string | null;
  readonly family_status: string;
  readonly neighborhood?: string | null;
  readonly neighborhood_name?: string | null;
  readonly neighborhood_name_ar?: string | null;
  readonly store?: string | null;
  readonly store_name?: string | null;
  readonly store_name_ar?: string | null;
}

export interface PilotAccountDebt {
  readonly order_id: string;
  readonly order_number: string;
  readonly original_total: number;
  readonly covered: number;
  readonly remaining: number;
  readonly status: string;
  readonly created_at: string;
}

export interface PilotAccount {
  readonly linked: boolean;
  readonly family_id?: string | null;
  readonly balance: number;
  readonly debts: readonly PilotAccountDebt[];
}

export type PilotAccountRoute = 'account' | 'orders';

/** The caller's family membership (server-derived; NULL when not linked). */
export async function fetchMyFamily(): Promise<PilotFamily | null> {
  const { data, error } = await getSupabaseClient().rpc('pilot_my_family');
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return (Array.isArray(data) && data.length > 0 ? data[0] : null) as PilotFamily | null;
}

/** The caller's account view: SUM(ledger)-based balance + open debts (display only). */
export async function fetchMyAccount(): Promise<PilotAccount> {
  const { data, error } = await getSupabaseClient().rpc('pilot_my_account');
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return (data ?? { linked: false, balance: 0, debts: [] }) as PilotAccount;
}

/* ————————————————— admin family management (Gate B, ADMIN ONLY) ————————————————— */

/**
 * One family member row from `pilot_admin_list_family_members` (00100).
 * `balance` is the server-computed SUM(ledger.amount) for that family — the
 * client never recomputes it.
 */
export interface PilotFamilyMember {
  readonly member_id: string;
  readonly family_id: string;
  readonly family_name: string;
  readonly user_id: string;
  readonly user_email: string;
  readonly role: string;
  readonly status: string;
  readonly created_at: string;
  readonly balance: number;
}

/** Result of `pilot_admin_deposit` (00100). */
export interface DepositResult {
  readonly family_id: string;
  readonly deposited: number;
  readonly balance_after: number;
}

/** Result of `pilot_admin_provision_family_member` (00100). */
export interface ProvisionResult {
  readonly family_id: string;
  readonly user_id: string;
  readonly status: string;
}

/** Admin lookup of every family member with their server-computed family balance. */
export async function adminListFamilyMembers(): Promise<PilotFamilyMember[]> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_list_family_members');
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return (data ?? []) as PilotFamilyMember[];
}

/**
 * Admin: record cash that was physically received. This is the ONLY
 * CASH_DEPOSIT path (the server also pays down open debts FIFO). A family or
 * store operator can never call it; the server re-checks admin identity.
 */
export async function adminDeposit(
  familyId: string,
  amount: number,
  note = '',
): Promise<DepositResult> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_deposit', {
    p_family_id: familyId,
    p_amount: amount,
    p_note: note,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as DepositResult;
}

/**
 * Admin: bind a user to a family (one active principal per family; a user is
 * bound to exactly one family for life). The server enforces both invariants.
 */
export async function adminProvisionFamilyMember(
  userId: string,
  familyId: string,
  status: 'active' | 'inactive' = 'active',
): Promise<ProvisionResult> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_provision_family_member', {
    p_user_id: userId,
    p_family_id: familyId,
    p_status: status,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as ProvisionResult;
}
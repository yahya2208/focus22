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

/* ————————————————— family contact profile (Gate V1.3, display-only) ————————————————— */

/**
 * The caller's OWN family contact profile (checkout prefill). Server-scoped:
 * the RPC resolves the family from auth.uid() and can never return another
 * family's data. NULL when the caller has no linked family. This is profile
 * text only — disjoint from ledger/balance/debts, which stay server-computed.
 */
export interface PilotFamilyContact {
  readonly family_id: string;
  readonly contact_name: string | null;
  readonly contact_phone: string | null;
  readonly contact_address: string | null;
  readonly contact_notes: string | null;
}

export async function fetchMyFamilyContact(): Promise<PilotFamilyContact | null> {
  const { data, error } = await getSupabaseClient().rpc('pilot_my_family_contact_get');
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  if (data == null) return null;
  const row = (Array.isArray(data) ? data[0] : data) as PilotFamilyContact | null;
  return row;
}

/**
 * Persist the caller's OWN family contact profile. Fire-and-forget safe:
 * call only AFTER the official order succeeds — a save failure must never
 * fail or fake the financial result. Throws on transport/server errors so
 * callers can surface a SEPARATE, non-financial notice.
 */
export async function saveMyFamilyContact(input: {
  name: string;
  phone: string;
  address: string;
  notes: string;
}): Promise<PilotFamilyContact> {
  const { data, error } = await getSupabaseClient().rpc('pilot_my_family_contact_set', {
    p_name: input.name,
    p_phone: input.phone,
    p_address: input.address,
    p_notes: input.notes,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as PilotFamilyContact;
}

/* ————————————————— admin family management (Gate B, ADMIN ONLY) ————————————————— */

/**
 * Admin: read-only ledger history for one family (Gate V1.8). Display-only:
 * SUM(ledger.amount) stays the single balance source; nothing here mutates.
 */
export interface FamilyLedgerEntry {
  readonly id: string;
  readonly created_at: string;
  readonly transaction_type: string;
  readonly amount: number;
  readonly related_order_id: string | null;
  readonly order_number: string | null;
  readonly reference: string;
  readonly note: string;
  readonly balance_after: number;
}

export async function adminFamilyLedger(
  familyId: string,
  limit = 100,
): Promise<FamilyLedgerEntry[]> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_family_ledger', {
    p_family_id: familyId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  const payload = (data ?? {}) as { entries?: FamilyLedgerEntry[] };
  return payload.entries ?? [];
}

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

/** Result of `pilot_admin_upsert_family` (00065) — exactly what the RPC returns. */
export interface UpsertFamilyResult {
  readonly id: string;
  readonly slug: string;
}

/**
 * Admin: create (or update by slug) a family group. Thin wrapper over the
 * existing RPC — the four fields pass through verbatim, no client logic.
 */
export async function adminUpsertFamily(input: {
  name: string;
  nameAr: string;
  slug: string;
  description: string;
}): Promise<UpsertFamilyResult> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_upsert_family', {
    p_name: input.name,
    p_name_ar: input.nameAr,
    p_slug: input.slug,
    p_description: input.description,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return data as UpsertFamilyResult;
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
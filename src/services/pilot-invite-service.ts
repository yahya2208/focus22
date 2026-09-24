/**
 * Pilot invitation lifecycle (Gate 1B) — client-side service + pure rules.
 *
 * The DB is the single source of truth; this module is a THIN typed client for
 * the admin RPCs + Edge Function, plus pure, deterministic helpers that mirror
 * the approved state machine so the UI renders correct chips/actions and the
 * rules are unit-testable without I/O.
 *
 * Guarantees enforced here:
 *   - Responses are sanitized to { ok, code } only (test 17) — no user_id,
 *     invitation_id, email, token or secret ever leaves the Edge Function.
 *   - A member who is operational (active + operational_ready) is ALWAYS
 *     rendered "جاهز للعمل" with no send/resend affordance, and the server also
 *     rejects the call (ALREADY_OPERATIONAL) — both layers protect the existing
 *     courier (manouniyahya00@gmail.com) and every other operational member.
 */

import { getSupabaseClient } from '../core/supabase/client';

/* ——————————————————————————— Types ——————————————————————————— */

export type InvitationStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'COMPLETED';
export type InvitationChannel = 'invite' | 'magic_link';
export type InviteClassKey = 'A' | 'B' | 'C' | 'D' | 'E';
export type ConfirmedVia = 'none' | 'email_confirmed_at' | 'confirmed_at' | 'both';
export type InvitationFailureOutcome = 'determinate' | 'indeterminate';

export interface InvitationRow {
  readonly invite_email: string;
  readonly member_kind: string;
  readonly channel: InvitationChannel | string;
  readonly status: InvitationStatus | string;
  readonly sent_count: number;
  readonly first_sent_at: string | null;
  readonly last_sent_at: string | null;
  readonly pending_at: string | null;
  readonly accepted_at: string | null;
  readonly password_set_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InviteResult {
  readonly ok: boolean;
  readonly code: string;
}

export const INVITE_RESPONSE_CODES: readonly string[] = [
  'ALREADY_OPERATIONAL',
  'INVITATION_NOT_REQUIRED',
  'INVITATION_SENT',
  'INVITATION_RESENT',
  'INVITATION_NOT_FOUND',
  'INVITATION_COMPLETED',
  'INVITATION_FINALIZE_FAILED',
  'COOLDOWN_ACTIVE',
  'MAX_SENDS_REACHED',
  'MEMBERSHIP_CONFLICT',
  'MEMBERSHIP_PROVISION_FAILED',
  'INVITE_DISPATCH_FAILED',
  'INVITE_DISPATCH_AMBIGUOUS',
  'IDENTITY_LINK_FAILED',
  'RESERVATION_FAILED',
  'RESERVATION_INCONSISTENT',
  'CLASSIFY_FAILED',
  'CLASSIFY_INCONSISTENT',
  'NOT_AUTHORIZED',
  'ARGUMENTS_INVALID',
  'PASSWORD_NOT_ALLOWED',
  'STORE_NOT_FOUND',
  'SERVER_MISCONFIGURED',
  'METHOD_NOT_ALLOWED',
] as const;

export const MAX_SENDS = 5 as const;
export const RESEND_COOLDOWN_MS = 60_000 as const;

function isKnownCode(code: string): boolean {
  return (INVITE_RESPONSE_CODES as readonly string[]).includes(code);
}

/* ——————————————————————— Classification (mirrors SQL) ————————————————————— */

export interface ClassifyInput {
  readonly exists: boolean;
  readonly confirmedVia: ConfirmedVia;
  readonly hasPassword: boolean;
  readonly membershipStatus: string;
  readonly operational: boolean;
  readonly roleMatch: boolean;
}

/**
 * Server-authoritative class decision, mirrored here only for deterministic
 * UI/EF-logic testing. Real authorization happens inside the DB classify RPC.
 *
 *   A existing operational            -> never invite / never provision-touch
 *   B confirmed + password            -> provision-only, no invitation email
 *   C confirmed + no password         -> magic_link channel, never recreate
 *   D existing unconfirmed            -> invite channel, never recreate
 *   E no identity                     -> invite channel (new identity)
 */
export function classifyInvitee(input: ClassifyInput): InviteClassKey | 'CONFLICT' {
  if (!input.exists) return 'E';
  if (input.membershipStatus === 'active') {
    return input.operational ? 'A' : 'CONFLICT';
  }
  if (input.confirmedVia !== 'none') {
    return input.hasPassword ? 'B' : 'C';
  }
  return 'D';
}

export function chooseChannel(cls: InviteClassKey): InvitationChannel {
  return cls === 'C' ? 'magic_link' : 'invite';
}

/** Claimed step ordering for tests: reserve MUST precede the auth dispatch. */
export type FlowStep = 'classify' | 'reserve' | 'auth' | 'mark_sent' | 'provision';
export function planFlow(_cls: InviteClassKey, hasMembership: boolean): FlowStep[] {
  const steps: FlowStep[] = ['classify', 'reserve', 'auth', 'mark_sent'];
  if (!hasMembership) steps.push('provision');
  return steps;
}

/* ——————————————————— Resend state machine (approved) ——————————————————— */

export interface InvitationLike {
  readonly status: InvitationStatus;
  readonly sentCount: number;
  readonly lastSentAt: string | null;
  readonly pendingAt: string | null;
}

export type ResendDecision =
  | { readonly allowed: true; readonly retryAfterMs: number }
  | {
      readonly allowed: false;
      readonly code: 'COOLDOWN_ACTIVE' | 'MAX_SENDS_REACHED' | 'INVITATION_COMPLETED';
      readonly retryAfterMs: number;
    };

/**
 * Approved rules:
 *   - sent_count counts SUCCESSFUL dispatches only; >= MAX_SENDS blocks all retries.
 *   - COMPLETED rows never resend.
 *   - After a success (SENT/ACCEPTED): cooldown from last_sent_at (60s).
 *   - While PENDING with no successful send: only an INDETERMINATE prior
 *     failure gates a retry — 60s from pending_at. A determinate failure
 *     allows an immediate retry (nothing was dispatched).
 */
export function resendDecision(
  invitation: InvitationLike,
  nowMs: number,
  lastOutcome: InvitationFailureOutcome | null,
): ResendDecision {
  if (invitation.sentCount >= MAX_SENDS) {
    return { allowed: false, code: 'MAX_SENDS_REACHED', retryAfterMs: 0 };
  }
  if (invitation.status === 'COMPLETED') {
    return { allowed: false, code: 'INVITATION_COMPLETED', retryAfterMs: 0 };
  }

  const toMs = (value: string | null): number | null => {
    if (!value) return null;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  };

  if (invitation.status === 'SENT' || invitation.status === 'ACCEPTED') {
    const t = toMs(invitation.lastSentAt);
    if (t !== null && nowMs - t < RESEND_COOLDOWN_MS) {
      const wait = RESEND_COOLDOWN_MS - (nowMs - t);
      return { allowed: false, code: 'COOLDOWN_ACTIVE', retryAfterMs: wait };
    }
  } else if (invitation.status === 'PENDING' && invitation.sentCount === 0) {
    const t = toMs(invitation.pendingAt);
    if (lastOutcome === 'indeterminate' && t !== null && nowMs - t < RESEND_COOLDOWN_MS) {
      const wait = RESEND_COOLDOWN_MS - (nowMs - t);
      return { allowed: false, code: 'COOLDOWN_ACTIVE', retryAfterMs: wait };
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

/* ——————————————————————— Response safety (test 17) ——————————————————————— */

const ALLOWED_RESPONSE_KEYS: ReadonlySet<string> = new Set(['ok', 'code']);

/**
 * Invariant: the Edge Function may only ever surface these two keys; the code
 * must be one of the known machine codes. Guards against leaking user_id,
 * invitation_id, emails, tokens or any secret into a client-visible payload.
 */
export function assertSafeResponse(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error('UNSAFE_RESPONSE_SHAPE');
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.every((k) => ALLOWED_RESPONSE_KEYS.has(k))) {
    throw new Error('UNSAFE_RESPONSE_KEYS');
  }
  if (!('ok' in record) || !('code' in record)) {
    throw new Error('UNSAFE_RESPONSE_FIELDS');
  }
  if (typeof record.code !== 'string' || !isKnownCode(record.code)) {
    throw new Error('UNSAFE_RESPONSE_CODE');
  }
  const encoded = JSON.stringify(record);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(encoded)) {
    throw new Error('UNSAFE_RESPONSE_UUID');
  }
}

export function assertNoDeletePower(serviceCalls: readonly string[]): void {
  if (serviceCalls.some((c) => /deleteUser/i.test(c))) {
    throw new Error('DELETE_USER_FORBIDDEN');
  }
}

/* ——————————————————————— Admin UI chip state ——————————————————————— */

export interface ChipView {
  readonly labelKey: string;
  readonly canSend: boolean;
  readonly canResend: boolean;
}

/**
 * Approved Admin states:
 *   operational                      -> "جاهز للعمل", NO buttons
 *   no invitation row                -> "لا توجد دعوة" + Send
 *   PENDING                          -> "قيد الإرسال" + Retry (same row)
 *   SENT / ACCEPTED                  -> "مرسلة"/"تم قبولها" + Resend
 *   COMPLETED                        -> "اكتملت", NO buttons
 */
export function invitationChip(input: {
  readonly operational: boolean;
  readonly invitation: InvitationRow | null;
}): ChipView {
  if (input.operational) {
    return { labelKey: 'invite.status.operational', canSend: false, canResend: false };
  }
  const inv = input.invitation;
  if (!inv) {
    return { labelKey: 'invite.status.noInvitation', canSend: true, canResend: false };
  }
  switch (inv.status) {
    case 'PENDING':
      return { labelKey: 'invite.status.pending', canSend: false, canResend: true };
    case 'SENT':
      return { labelKey: 'invite.status.sent', canSend: false, canResend: true };
    case 'ACCEPTED':
      return { labelKey: 'invite.status.accepted', canSend: false, canResend: true };
    case 'COMPLETED':
      return { labelKey: 'invite.status.completed', canSend: false, canResend: false };
    default:
      return { labelKey: 'invite.status.noInvitation', canSend: true, canResend: false };
  }
}

/** Admin may only invoke the invitation action when the chip allows it. */
export function isOperationalMember(status: string, operationalReady: boolean): boolean {
  return status === 'active' && operationalReady;
}

/* ——————————————————————— Client I/O (thin, typed) ——————————————————————— */

async function invokePilotInvite(body: Record<string, unknown>): Promise<InviteResult> {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke('pilot-invite', { body });
  if (!error) {
    if (!data || typeof data !== 'object' || !('ok' in data) || !('code' in data)) {
      throw new Error('INVITE_RPC_MALFORMED');
    }
    const result = data as unknown as InviteResult;
    assertSafeResponse(result);
    return result;
  }
  // Non-2xx from the Edge Function surfaces as FunctionsHttpError with the
  // response body attached; business codes (COOLDOWN_ACTIVE 429, etc.) live
  // there and must not be lost.
  const response = (error as unknown as { context?: { response?: Response } }).context?.response;
  let text = '';
  try {
    if (response) text = await response.clone().text();
  } catch {
    text = '';
  }
  if (text) {
    try {
      const parsed = JSON.parse(text) as InviteResult;
      assertSafeResponse(parsed);
      return parsed;
    } catch {
      // fall through to the generic failure below
    }
  }
  throw new Error('INVITE_RPC_FAILED');
}

export async function adminListInvitations(storeId: string): Promise<InvitationRow[]> {
  const { data, error } = await getSupabaseClient().rpc('pilot_admin_list_invitations', {
    p_store_id: storeId,
  });
  if (error) throw new Error(error.message ?? 'RPC_ERROR');
  return (data ?? []) as InvitationRow[];
}

/** The caller's own invitation row as proven by `pilot_get_my_invitation`
 * (00093, SECURITY DEFINER, keyed on auth.uid()). THIS is the object identity
 * source for the invite gate — never a URL/state/email claim. */
export interface MyInvitation {
  readonly id: string;
  readonly user_id: string;
  readonly invite_email: string;
  readonly member_kind: string;
  readonly channel: string;
  readonly status: string;
  readonly password_set_at: string | null;
  readonly created_at: string;
}

/** Read-only, caller-scoped. Fails closed: any RPC error -> null. */
export async function fetchMyLiveInvitation(): Promise<MyInvitation | null> {
  const { data, error } = await getSupabaseClient().rpc('pilot_get_my_invitation');
  if (error) return null;
  const rows = Array.isArray(data) ? (data as MyInvitation[]) : [];
  return rows[0] ?? null;
}

export interface SendInvitationArgs {
  readonly storeId: string;
  readonly role: 'operator' | 'courier';
  readonly email: string;
  readonly displayName?: string;
  readonly reason?: string;
}

export async function sendInvitation(args: SendInvitationArgs): Promise<InviteResult> {
  return invokePilotInvite({
    action: 'send',
    role: args.role,
    email: args.email,
    store_id: args.storeId,
    display_name: args.displayName ?? '',
    reason: args.reason ?? '',
  });
}

export async function resendInvitation(args: SendInvitationArgs): Promise<InviteResult> {
  return invokePilotInvite({
    action: 'resend',
    role: args.role,
    email: args.email,
    store_id: args.storeId,
    display_name: args.displayName ?? '',
    reason: args.reason ?? '',
  });
}

/* —————————————————— Family invitations (Vegetables lane) —————————————————— */

/**
 * Family-only invitation input. There is deliberately NO role field: this
 * entry point can only ever send `member_kind: 'family'`, so a family invite
 * can never be mis-sent as operator/courier by construction.
 */
export interface SendFamilyInvitationArgs {
  readonly storeId: string;
  readonly email: string;
  readonly displayName?: string;
  readonly reason?: string;
}

function familyInviteBody(action: 'send' | 'resend', args: SendFamilyInvitationArgs): Record<string, unknown> {
  return {
    action,
    role: 'family',
    email: args.email,
    store_id: args.storeId,
    display_name: args.displayName ?? '',
    reason: args.reason ?? '',
  };
}

export async function sendFamilyInvitation(args: SendFamilyInvitationArgs): Promise<InviteResult> {
  return invokePilotInvite(familyInviteBody('send', args));
}

export async function resendFamilyInvitation(args: SendFamilyInvitationArgs): Promise<InviteResult> {
  return invokePilotInvite(familyInviteBody('resend', args));
}

/**
 * Maps a machine code to the screen's existing `pilot.error.*` i18n namespace.
 * These codes are stored in the same `error` state as every other admin error,
 * so the existing tError(...) wrapper renders them identically.
 */
export function messageKeyFor(code: string): string {
  switch (code) {
    case 'ALREADY_OPERATIONAL':
      return 'INVITE_ALREADY_OPERATIONAL';
    case 'INVITATION_NOT_REQUIRED':
      return 'INVITE_NOT_REQUIRED';
    case 'INVITATION_COMPLETED':
      return 'INVITE_COMPLETED';
    case 'COOLDOWN_ACTIVE':
      return 'INVITE_COOLDOWN';
    case 'MAX_SENDS_REACHED':
      return 'INVITE_MAX_SENDS';
    case 'MEMBERSHIP_CONFLICT':
    case 'MEMBERSHIP_PROVISION_FAILED':
      return 'INVITE_MEMBERSHIP';
    case 'INVITE_DISPATCH_AMBIGUOUS':
      return 'INVITE_AMBIGUOUS';
    case 'IDENTITY_LINK_FAILED':
    case 'INVITATION_FINALIZE_FAILED':
      return 'INVITE_FINALIZE';
    default:
      return 'INVITE_SEND_FAILED';
  }
}

export function successMessageKeyFor(isResend: boolean): string {
  return isResend ? 'INVITE_RESENT_OK' : 'INVITE_SENT_OK';
}
import type { PilotEntryState } from '../../services/pilot-membership-service';

/**
 * Pure invite-completion logic (P2-A). No side effects, no secrets, no I/O —
 * fully unit-testable. UI/session wiring lives in InviteSetupScreen.
 */

export type SetupPasswordError = 'required' | 'too-short' | 'mismatch' | null;

/** Mirrors the app's password rule (AdminSetupScreen: min 8 chars). */
export function validateSetupPassword(
  password: string,
  confirm: string,
): SetupPasswordError {
  if (!password) return 'required';
  if (password.length < 8) return 'too-short';
  if (password !== confirm) return 'mismatch';
  return null;
}

export type InviteFailureKind = 'link-expired' | 'weak-password' | 'setup-failed';

/**
 * Maps a Supabase Auth error to a human failure class. Only the class leaves
 * this function — raw messages (which may contain request internals) are
 * never surfaced to users.
 */
export function mapInviteSetupError(message: string): InviteFailureKind {
  const m = (message ?? '').toLowerCase();
  if (
    m.includes('expired') ||
    m.includes('invalid') ||
    m.includes('token') ||
    m.includes('session') ||
    m.includes('not authenticated') ||
    m.includes('unauthenticated') ||
    m.includes('identity mismatch')
  ) {
    return 'link-expired';
  }
  if (
    m.includes('weak') ||
    m.includes('short') ||
    m.includes('should be different') ||
    m.includes('same password') ||
    m.includes('password should')
  ) {
    return 'weak-password';
  }
  return 'setup-failed';
}

export type InviteDestination =
  | { readonly route: 'pilot-courier'; readonly mode: 'workspace' }
  | { readonly route: 'pilot-store-ops'; readonly mode: 'workspace' }
  | { readonly route: 'home'; readonly mode: 'pending' | 'orientation' | 'none' };

/**
 * Post-setup routing from verified membership state (never from email,
 * display name, URL parameters, or any frontend-only role claim).
 * Courier-operational wins on ties: the invitation context is courier-first.
 */
export function resolveInviteDestination(args: {
  readonly courierEntry: PilotEntryState;
  readonly operatorEntry: PilotEntryState;
  readonly isAdmin: boolean;
}): InviteDestination {
  if (args.courierEntry === 'operational') {
    return { route: 'pilot-courier', mode: 'workspace' };
  }
  if (args.operatorEntry === 'operational') {
    return { route: 'pilot-store-ops', mode: 'workspace' };
  }
  if (
    args.courierEntry === 'pending' ||
    args.operatorEntry === 'pending'
  ) {
    return { route: 'home', mode: 'pending' };
  }
  if (
    args.courierEntry !== 'none' ||
    args.operatorEntry !== 'none' ||
    args.isAdmin
  ) {
    return { route: 'home', mode: 'orientation' };
  }
  return { route: 'home', mode: 'none' };
}

/* ————————————————————————— Invite identity gate ————————————————————————— */

export type InviteSessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated';

export type InviteGateStatus = 'loading' | 'needs-session' | 'invalid-invite' | 'ready';

/** The fields the gate reads from the 00093 proof (invitation OWNED by the
 *  current session user). */
export interface GateInvitation {
  readonly user_id: string;
  readonly status: string;
  readonly password_set_at: string | null;
}

/**
 * Gate 1B fix — the password form must ONLY render after the DB-backed proof
 * (pilot_get_my_invitation, keyed on auth.uid()) confirms the invitation
 * belongs to the authenticated session user. Any other path fails closed.
 *
 *   loading        -> auth or the 00093 proof is still resolving
 *   needs-session  -> no authenticated identity; cannot prove ownership
 *   invalid-invite -> authenticated, but no LIVE invitation bound to THIS
 *                     user (missing / foreign / password already set)
 *   ready          -> form allowed
 */
export function resolveInviteGate(args: {
  readonly sessionStatus: InviteSessionStatus;
  readonly sessionUserId: string | null;
  readonly invitation: GateInvitation | null;
}): InviteGateStatus {
  if (args.sessionStatus === 'loading') return 'loading';
  if (args.sessionStatus !== 'authenticated' || !args.sessionUserId) {
    return 'needs-session';
  }
  if (!args.invitation) return 'invalid-invite';
  if (args.invitation.user_id !== args.sessionUserId) return 'invalid-invite';
  if (args.invitation.password_set_at !== null) return 'invalid-invite';
  if (
    args.invitation.status !== 'PENDING' &&
    args.invitation.status !== 'SENT' &&
    args.invitation.status !== 'ACCEPTED'
  ) {
    return 'invalid-invite';
  }
  return 'ready';
}

export type InviteIdentityCheck = 'match' | 'mismatch' | 'missing';

/** Submit-time re-proof used by setAccountPassword's defense-in-depth guard. */
export function checkInviteIdentity(
  sessionUserId: string | null,
  boundUserId: string | null,
): InviteIdentityCheck {
  if (!sessionUserId || !boundUserId) return 'missing';
  return sessionUserId === boundUserId ? 'match' : 'mismatch';
}

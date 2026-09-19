/**
 * GATE 1B — pilot-invite-service pure rules (deterministic, no I/O).
 * Covers the approved state machine: A..E classification, channel choice,
 * reserve-before-auth step ordering, resend cooldown/max/completed gates,
 * response safety (test 17), the no-delete invariant, and the Admin chip map.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyInvitee,
  chooseChannel,
  planFlow,
  resendDecision,
  assertSafeResponse,
  assertNoDeletePower,
  invitationChip,
  isOperationalMember,
  messageKeyFor,
  successMessageKeyFor,
  MAX_SENDS,
  RESEND_COOLDOWN_MS,
  type ClassifyInput,
  type InvitationLike,
  type InvitationRow,
} from '../../services/pilot-invite-service';

const base = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({
  exists: true,
  confirmedVia: 'none',
  hasPassword: false,
  membershipStatus: 'none',
  operational: false,
  roleMatch: true,
  ...over,
});

function row(over: Partial<InvitationRow> = {}): InvitationRow {
  return {
    invite_email: 'x@focus.local',
    member_kind: 'courier',
    channel: 'invite',
    status: 'PENDING',
    sent_count: 0,
    first_sent_at: null,
    last_sent_at: null,
    pending_at: '2026-09-13T09:00:00Z',
    accepted_at: null,
    password_set_at: null,
    completed_at: null,
    created_at: '2026-09-13T09:00:00Z',
    updated_at: '2026-09-13T09:00:00Z',
    ...over,
  };
}

/** camelCase adaptation of InvitationRow matching the resendDecision contract. */
function invitationLike(over: Partial<InvitationLike> = {}): InvitationLike {
  return {
    status: 'PENDING',
    sentCount: 0,
    lastSentAt: null,
    pendingAt: '2026-09-13T09:00:00Z',
    ...over,
  };
}

describe('classifyInvitee (mirrors SQL classification)', () => {
  it('classifies a nonexistent identity as E', () => {
    expect(classifyInvitee(base({ exists: false }))).toBe('E');
  });

  it('classifies an existing OPERATIONAL member as A (zero-write guard)', () => {
    expect(
      classifyInvitee(base({ membershipStatus: 'active', operational: true })),
    ).toBe('A');
  });

  it('treats active + NOT ready as a conflict (review, never invite)', () => {
    expect(classifyInvitee(base({ membershipStatus: 'active', operational: false }))).toBe('CONFLICT');
  });

  it('confirmed + password = B (provision-only, no email)', () => {
    expect(
      classifyInvitee(base({ confirmedVia: 'email_confirmed_at', hasPassword: true })),
    ).toBe('B');
  });

  it('confirmed + credential-less = C (magic link, never recreate)', () => {
    expect(classifyInvitee(base({ confirmedVia: 'confirmed_at', hasPassword: false }))).toBe('C');
  });

  it('unconfirmed = D (invite, never recreate)', () => {
    expect(classifyInvitee(base({}))).toBe('D');
  });
});

describe('chooseChannel', () => {
  it('uses magic_link ONLY for class C; everything else is invite', () => {
    expect(chooseChannel('C')).toBe('magic_link');
    expect(chooseChannel('D')).toBe('invite');
    expect(chooseChannel('E')).toBe('invite');
    expect(chooseChannel('B')).toBe('invite');
  });
});

describe('planFlow — reserve MUST precede the auth dispatch', () => {
  it('orders classify -> reserve -> auth -> mark_sent', () => {
    const steps = planFlow('E', true);
    expect(steps).toEqual(['classify', 'reserve', 'auth', 'mark_sent']);
    expect(steps.indexOf('reserve')).toBeLessThan(steps.indexOf('auth'));
  });

  it('appends provision at the END only when a membership is missing', () => {
    expect(planFlow('E', false)).toEqual(['classify', 'reserve', 'auth', 'mark_sent', 'provision']);
    expect(planFlow('D', true)).toEqual(['classify', 'reserve', 'auth', 'mark_sent']);
  });
});

describe('resendDecision (approved cooldown/max rules)', () => {
  const now = Date.parse('2026-09-13T09:01:00Z');

  it('blocks everything after MAX_SENDS successful dispatches', () => {
    const d = resendDecision(invitationLike({ status: 'PENDING', sentCount: MAX_SENDS }), now, null);
    expect(d).toMatchObject({ allowed: false, code: 'MAX_SENDS_REACHED' });
  });

  it('never resends a COMPLETED row', () => {
    const d = resendDecision(invitationLike({ status: 'COMPLETED' }), now, null);
    expect(d).toMatchObject({ allowed: false, code: 'INVITATION_COMPLETED' });
  });

  it('SENT enforces a 60s cooldown from last_sent_at', () => {
    const d = resendDecision(
      invitationLike({ status: 'SENT', sentCount: 1, lastSentAt: new Date(now - 1_000).toISOString() }),
      now,
      null,
    );
    expect(d).toMatchObject({ allowed: false, code: 'COOLDOWN_ACTIVE' });
    if (!d.allowed) expect(d.retryAfterMs).toBe(RESEND_COOLDOWN_MS - 1_000);
  });

  it('ACCEPTED keeps the same cooldown gate', () => {
    const d = resendDecision(
      invitationLike({ status: 'ACCEPTED', sentCount: 1, lastSentAt: new Date(now - 1_500).toISOString() }),
      now,
      null,
    );
    expect(d).toMatchObject({ allowed: false, code: 'COOLDOWN_ACTIVE' });
  });

  it('allows an immediate retry after a DETERMINATE failure (nothing dispatched)', () => {
    const d = resendDecision(
      invitationLike({ status: 'PENDING', sentCount: 0, pendingAt: new Date(now - 10_000).toISOString() }),
      now,
      'determinate',
    );
    expect(d).toMatchObject({ allowed: true });
  });

  it('gates an INDETERMINATE failure retry 60s from pending_at', () => {
    const d = resendDecision(
      invitationLike({ status: 'PENDING', sentCount: 0, pendingAt: new Date(now - 5_000).toISOString() }),
      now,
      'indeterminate',
    );
    expect(d).toMatchObject({ allowed: false, code: 'COOLDOWN_ACTIVE' });
  });

  it('indeterminate gating does not apply once a send already succeeded', () => {
    const d = resendDecision(
      invitationLike({ status: 'PENDING', sentCount: 1, pendingAt: new Date(now - 5_000).toISOString() }),
      now,
      'indeterminate',
    );
    expect(d).toMatchObject({ allowed: true });
  });

  it('no row + no outcome -> allowed', () => {
    const d = resendDecision(invitationLike({ status: 'PENDING', sentCount: 0, pendingAt: null }), now, null);
    expect(d).toMatchObject({ allowed: true });
  });
});

describe('assertSafeResponse (test 17 contract)', () => {
  it('accepts the exact { ok, code } shape', () => {
    expect(() => assertSafeResponse({ ok: true, code: 'INVITATION_SENT' })).not.toThrow();
  });

  it('rejects any extra client-visible key (user_id, invitation_id, email…)', () => {
    expect(() => assertSafeResponse({ ok: true, code: 'INVITATION_SENT', user_id: 'u1' })).toThrow(
      'UNSAFE_RESPONSE_KEYS',
    );
  });

  it('rejects missing ok/code fields', () => {
    expect(() => assertSafeResponse({ ok: true })).toThrow('UNSAFE_RESPONSE_FIELDS');
  });

  it('rejects an undocumented machine code', () => {
    expect(() => assertSafeResponse({ ok: true, code: 'TOKEN_IS_HERE' })).toThrow(
      'UNSAFE_RESPONSE_CODE',
    );
  });

  it('rejects a payload that sneaks a UUID into an allowed key', () => {
    expect(() =>
      assertSafeResponse({
        ok: true,
        code: 'cafebeef-cafe-cafe-cafe-cafebeefcafe',
      }),
    ).toThrow();
  });
});

describe('assertNoDeletePower', () => {
  it('forbids any service call that would delete the identity', () => {
    expect(() => assertNoDeletePower(['auth.admin.inviteUserByEmail', 'auth.admin.deleteUser'])).toThrow(
      'DELETE_USER_FORBIDDEN',
    );
    expect(() => assertNoDeletePower(['auth.admin.inviteUserByEmail', 'auth.signInWithOtp'])).not.toThrow();
  });
});

describe('invitationChip (Admin UI state map)', () => {
  it('operational members render ready with NO buttons (manouniyahya00 protection)', () => {
    const chip = invitationChip({ operational: true, invitation: row({ status: 'SENT' }) });
    expect(chip).toMatchObject({
      labelKey: 'invite.status.operational',
      canSend: false,
      canResend: false,
    });
  });

  it('no invitation row -> SEND', () => {
    const chip = invitationChip({ operational: false, invitation: null });
    expect(chip).toMatchObject({ labelKey: 'invite.status.noInvitation', canSend: true, canResend: false });
  });

  it('PENDING -> retry (same row, never a fresh send)', () => {
    const chip = invitationChip({ operational: false, invitation: row({ status: 'PENDING' }) });
    expect(chip).toMatchObject({ labelKey: 'invite.status.pending', canSend: false, canResend: true });
  });

  it('SENT / ACCEPTED -> resend', () => {
    expect(invitationChip({ operational: false, invitation: row({ status: 'SENT' }) }).canResend).toBe(true);
    expect(invitationChip({ operational: false, invitation: row({ status: 'ACCEPTED' }) }).canResend).toBe(true);
  });

  it('COMPLETED -> no buttons', () => {
    const chip = invitationChip({ operational: false, invitation: row({ status: 'COMPLETED' }) });
    expect(chip).toMatchObject({ canSend: false, canResend: false, labelKey: 'invite.status.completed' });
  });
});

describe('isOperationalMember', () => {
  it('is operational only for active + ready', () => {
    expect(isOperationalMember('active', true)).toBe(true);
    expect(isOperationalMember('pending', true)).toBe(false);
    expect(isOperationalMember('active', false)).toBe(false);
  });
});

describe('message mapping to existing i18n namespaces', () => {
  it('maps server codes onto pilot.error.* codes', () => {
    expect(messageKeyFor('COOLDOWN_ACTIVE')).toBe('INVITE_COOLDOWN');
    expect(messageKeyFor('MAX_SENDS_REACHED')).toBe('INVITE_MAX_SENDS');
    expect(messageKeyFor('MEMBERSHIP_CONFLICT')).toBe('INVITE_MEMBERSHIP');
    expect(messageKeyFor('INVITE_DISPATCH_AMBIGUOUS')).toBe('INVITE_AMBIGUOUS');
    expect(messageKeyFor('ALREADY_OPERATIONAL')).toBe('INVITE_ALREADY_OPERATIONAL');
    expect(messageKeyFor('UNKNOWN')).toBe('INVITE_SEND_FAILED');
  });

  it('success codes are distinct for send vs resend', () => {
    expect(successMessageKeyFor(false)).toBe('INVITE_SENT_OK');
    expect(successMessageKeyFor(true)).toBe('INVITE_RESENT_OK');
  });
});
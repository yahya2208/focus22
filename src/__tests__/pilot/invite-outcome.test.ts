/**
 * P3 — no-op vs sent distinction (+ P4 redirect pin).
 * INVITATION_NOT_REQUIRED must never classify as a sent invitation.
 * The Edge admin-invite call must keep using `redirectTo` (admin-API key).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { toInviteOutcome } from '../../services/pilot-invite-service';

describe('toInviteOutcome — P3 no-op honesty', () => {
  it('1: INVITATION_NOT_REQUIRED classifies as noop, not sent', () => {
    expect(toInviteOutcome({ ok: true, code: 'INVITATION_NOT_REQUIRED' })).toEqual({ kind: 'noop' });
  });

  it('2: successful invite classifies as sent (fresh vs resend preserved)', () => {
    expect(toInviteOutcome({ ok: true, code: 'INVITATION_SENT' })).toEqual({ kind: 'sent', resent: false });
    expect(toInviteOutcome({ ok: true, code: 'INVITATION_RESENT' })).toEqual({ kind: 'sent', resent: true });
  });

  it('3: dispatch failure stays an error with its code', () => {
    expect(toInviteOutcome({ ok: false, code: 'INVITE_DISPATCH_FAILED' })).toEqual({ kind: 'error', code: 'INVITE_DISPATCH_FAILED' });
    expect(toInviteOutcome({ ok: false, code: 'COOLDOWN_ACTIVE' })).toEqual({ kind: 'error', code: 'COOLDOWN_ACTIVE' });
  });
});

describe('P4 redirect pin — Edge admin invite key', () => {
  const EDGE = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/functions/pilot-invite/index.ts'),
    'utf-8',
  );

  it('4: admin invite passes redirectTo (never the client key emailRedirectTo)', () => {
    expect(EDGE).toContain('...(redirectTo ? { redirectTo } : {})');
    // The client-API key must never appear as an object property (it is
    // silently dropped by admin.inviteUserByEmail); mentions in comments
    // documenting this exact pitfall are allowed.
    expect(EDGE).not.toMatch(/emailRedirectTo\s*:/);
  });
});

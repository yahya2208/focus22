import { describe, expect, it } from 'vitest';
import {
  checkInviteIdentity,
  mapInviteSetupError,
  resolveInviteDestination,
  resolveInviteGate,
  validateSetupPassword,
} from '../../core/auth/invite-setup';

describe('validateSetupPassword', () => {
  it('requires a password', () => {
    expect(validateSetupPassword('', '')).toBe('required');
  });
  it('enforces minimum length', () => {
    expect(validateSetupPassword('short1', 'short1')).toBe('too-short');
    expect(validateSetupPassword('longenough1', 'longenough1')).toBeNull();
  });
  it('requires confirmation match', () => {
    expect(validateSetupPassword('longenough1', 'different2')).toBe('mismatch');
  });
});

describe('mapInviteSetupError (never surfaces raw messages)', () => {
  it('maps expired/invalid/session failures to link-expired', () => {
    expect(mapInviteSetupError('Email link is expired')).toBe('link-expired');
    expect(mapInviteSetupError('invalid JWT: unable to parse')).toBe('link-expired');
    expect(mapInviteSetupError('Auth session missing')).toBe('link-expired');
  });
  it('maps weak-password failures', () => {
    expect(mapInviteSetupError('Password should be at least 6 characters')).toBe(
      'weak-password',
    );
    expect(mapInviteSetupError('New password should be different')).toBe('weak-password');
  });
  it('falls back to setup-failed for unknown errors', () => {
    expect(mapInviteSetupError('Something odd happened')).toBe('setup-failed');
    expect(mapInviteSetupError('')).toBe('setup-failed');
  });
});

describe('resolveInviteDestination (membership-verified routing only)', () => {
  const none = { courierEntry: 'none', operatorEntry: 'none', isAdmin: false } as const;
  it('no membership resolves home/none', () => {
    expect(resolveInviteDestination(none)).toEqual({ route: 'home', mode: 'none' });
  });
  it('operational courier wins', () => {
    expect(
      resolveInviteDestination({ ...none, courierEntry: 'operational' }),
    ).toEqual({ route: 'pilot-courier', mode: 'workspace' });
  });
  it('operational operator resolves store ops', () => {
    expect(
      resolveInviteDestination({ ...none, operatorEntry: 'operational' }),
    ).toEqual({ route: 'pilot-store-ops', mode: 'workspace' });
  });
  it('courier wins ties over operator', () => {
    expect(
      resolveInviteDestination({ courierEntry: 'operational', operatorEntry: 'operational', isAdmin: false }),
    ).toEqual({ route: 'pilot-courier', mode: 'workspace' });
  });
  it('pending resolves home/pending (never a workspace)', () => {
    expect(
      resolveInviteDestination({ ...none, courierEntry: 'pending' }),
    ).toEqual({ route: 'home', mode: 'pending' });
    expect(
      resolveInviteDestination({ ...none, operatorEntry: 'pending' }),
    ).toEqual({ route: 'home', mode: 'pending' });
  });
  it('suspended/not-ready resolves orientation, never workspace', () => {
    expect(
      resolveInviteDestination({ ...none, courierEntry: 'suspended' }),
    ).toEqual({ route: 'home', mode: 'orientation' });
    expect(
      resolveInviteDestination({ ...none, operatorEntry: 'not-ready' }),
    ).toEqual({ route: 'home', mode: 'orientation' });
  });
  it('admin without membership resolves home/orientation', () => {
    expect(
      resolveInviteDestination({ ...none, isAdmin: true }),
    ).toEqual({ route: 'home', mode: 'orientation' });
  });
});

describe('resolveInviteGate (Gate 1B identity proof)', () => {
  const liveInvite = {
    user_id: 'u-invitee',
    status: 'SENT',
    password_set_at: null,
  };
  const base = {
    sessionStatus: 'authenticated',
    sessionUserId: 'u-invitee',
    invitation: liveInvite,
  } as const;

  it('loading session -> loading', () => {
    expect(resolveInviteGate({ ...base, sessionStatus: 'loading' })).toBe('loading');
  });
  it('A: valid invite + matching session -> ready', () => {
    expect(resolveInviteGate(base)).toBe('ready');
  });
  it('B: stale unrelated authenticated session -> invalid-invite', () => {
    expect(resolveInviteGate({ ...base, sessionUserId: 'u-other' })).toBe('invalid-invite');
  });
  it('C: no session -> needs-session', () => {
    expect(resolveInviteGate({ ...base, sessionStatus: 'unauthenticated', sessionUserId: null })).toBe('needs-session');
    expect(resolveInviteGate({ ...base, sessionStatus: 'anonymous', sessionUserId: 'u-guest' })).toBe('needs-session');
  });
  it('C2: authenticated but missing user id -> needs-session', () => {
    expect(resolveInviteGate({ ...base, sessionUserId: null })).toBe('needs-session');
  });
  it('D: invitation already password_set -> invalid-invite', () => {
    expect(
      resolveInviteGate({ ...base, invitation: { ...liveInvite, password_set_at: '2026-01-01T00:00:00Z' } }),
    ).toBe('invalid-invite');
  });
  it('D2: non-live invitation status -> invalid-invite', () => {
    expect(
      resolveInviteGate({ ...base, invitation: { ...liveInvite, status: 'COMPLETED' } }),
    ).toBe('invalid-invite');
  });
  it('no invitation row -> invalid-invite', () => {
    expect(resolveInviteGate({ ...base, invitation: null })).toBe('invalid-invite');
  });
});

describe('checkInviteIdentity (submit-time defense-in-depth)', () => {
  it('match', () => {
    expect(checkInviteIdentity('u-invitee', 'u-invitee')).toBe('match');
  });
  it('mismatch', () => {
    expect(checkInviteIdentity('u-other', 'u-invitee')).toBe('mismatch');
  });
  it('missing', () => {
    expect(checkInviteIdentity(null, 'u-invitee')).toBe('missing');
    expect(checkInviteIdentity('u-invitee', null)).toBe('missing');
    expect(checkInviteIdentity(null, null)).toBe('missing');
  });
});

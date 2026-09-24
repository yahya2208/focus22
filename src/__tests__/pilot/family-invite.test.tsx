/**
 * GATE V1.6.4 — family invitation lane tests.
 * Family entry can only ever send role:'family' (no role parameter exists);
 * staff wrappers unchanged; destination resolves to the family hub;
 * resend rules apply identically regardless of kind.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { resolveInviteDestination } from '../../core/auth/invite-setup';
import { resendDecision } from '../../services/pilot-invite-service';

const invokeMock = vi.fn();

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ functions: { invoke: invokeMock } }),
}));

const liveInvitation = vi.hoisted(() => ({
  row: null as null | {
    id: string;
    user_id: string;
    invite_email: string;
    member_kind: string;
    channel: string;
    status: string;
    password_set_at: string | null;
    created_at: string;
  },
}));

vi.mock('../../services/pilot-invite-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/pilot-invite-service')>();
  return {
    ...actual,
    fetchMyLiveInvitation: vi.fn(async () => liveInvitation.row),
  };
});

import {
  sendFamilyInvitation,
  resendFamilyInvitation,
} from '../../services/pilot-invite-service';
import { InviteSetupScreen } from '../../screens/auth/InviteSetupScreen';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => vi.fn() };
});
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({
    status: 'ready',
    courierEntry: 'none',
    operatorEntry: 'none',
    isAdmin: false,
  }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'u-fam' } },
    service: { setAccountPassword: vi.fn(async () => {}) },
  }),
}));

describe('family invitation service wrappers', () => {
  beforeEach(() => invokeMock.mockReset());

  it('sendFamilyInvitation always sends role family with the store + email', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, code: 'INVITATION_SENT' }, error: null });
    await sendFamilyInvitation({ storeId: 's1', email: 'Fam@Example.com' });
    expect(invokeMock).toHaveBeenCalledWith('pilot-invite', {
      body: expect.objectContaining({ action: 'send', role: 'family', store_id: 's1' }),
    });
    const body = invokeMock.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body.role).toBe('family');
    expect(body).not.toHaveProperty('password');
  });

  it('resendFamilyInvitation sends a resend for the family kind only', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, code: 'INVITATION_RESENT' }, error: null });
    await resendFamilyInvitation({ storeId: 's1', email: 'fam@example.com' });
    const body = invokeMock.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({ action: 'resend', role: 'family', email: 'fam@example.com' }),
    );
  });
});

describe('resolveInviteDestination — family lane', () => {
  const base = { courierEntry: 'none', operatorEntry: 'none', isAdmin: false } as const;

  it('routes family invitations to the family hub', () => {
    expect(resolveInviteDestination({ ...base, memberKind: 'family' })).toEqual({
      route: 'pilot-family-home',
      mode: 'family',
    });
  });

  it('leaves staff routing byte-identical without a kind', () => {
    expect(resolveInviteDestination({ ...base, courierEntry: 'operational' })).toEqual({
      route: 'pilot-courier',
      mode: 'workspace',
    });
    expect(resolveInviteDestination({ ...base })).toEqual({ route: 'home', mode: 'none' });
  });
});

describe('resendDecision — kind-agnostic lifecycle', () => {
  it('applies cooldown/max/completed rules to a family-kind row', () => {
    const row = { status: 'SENT', sentCount: 1, lastSentAt: new Date().toISOString(), pendingAt: null };
    expect(resendDecision(row as never, Date.now(), null).allowed).toBe(false);
    expect(
      resendDecision({ ...row, status: 'COMPLETED' } as never, Date.now(), null),
    ).toEqual(expect.objectContaining({ allowed: false }));
  });
});

describe('InviteSetupScreen — family panel', () => {
  it('shows family wording + family-home CTA after password setup', async () => {
    liveInvitation.row = {
      id: 'i1',
      user_id: 'u-fam',
      invite_email: 'fam@example.com',
      member_kind: 'family',
      channel: 'invite',
      status: 'ACCEPTED',
      password_set_at: null,
      created_at: '',
    };

    render(<InviteSetupScreen />);
    fireEvent.change(await screen.findByLabelText('login.password'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.change(screen.getByLabelText('inviteSetup.confirmPassword'), {
      target: { value: 'StrongPass123' },
    });
    fireEvent.click(screen.getByText('inviteSetup.setPassword'));

    expect(await screen.findByText('inviteSetup.familyWelcome')).toBeTruthy();
    expect(screen.getByText('inviteSetup.familyOpenHome')).toBeTruthy();
    fireEvent.click(screen.getByText('inviteSetup.familyOpenHome'));
  });
});

describe('family invitation failure containment', () => {
  beforeEach(() => invokeMock.mockReset());

  it('propagates Edge dispatch failure without fabricating SENT', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: ' FunctionsFetchError ' } });
    await expect(sendFamilyInvitation({ storeId: 's1', email: 'fam@example.com' })).rejects.toThrow();
  });

  it('propagates reservation failure codes without marking sent', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: false, code: 'INVITATION_COMPLETED' }, error: null });
    const res = await resendFamilyInvitation({ storeId: 's1', email: 'fam@example.com' }).catch(() => null);
    expect(res === null || (res as { ok: boolean }).ok === false).toBe(true);
  });

  it('never sends service-role material from the browser lane', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, code: 'INVITATION_SENT' }, error: null });
    await sendFamilyInvitation({ storeId: 's1', email: 'fam@example.com' });
    const body = invokeMock.mock.calls[0]![1].body as Record<string, unknown>;
    for (const v of Object.values(body)) {
      expect(typeof v === 'string' && v.startsWith('eyJ')).toBe(false);
    }
    expect(body).not.toHaveProperty('service_role');
    expect(body).not.toHaveProperty('serviceRole');
  });
});

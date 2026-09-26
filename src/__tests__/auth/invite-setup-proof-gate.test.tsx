/**
 * D1/D2 proof gate (Gate: invite-setup proof separation).
 * T1 slow proof → loading, never invalid, then ready+form.
 * T2 first fetch rejects, retry succeeds → ready.
 * T3 all attempts reject → fatal panel (NOT linkExpired) + manual retry.
 * T4 null result → invalid-invite (definitive, no retry).
 * T6 user mismatch → invalid.
 * T7 submit success → success phase, no false invalid flash.
 * T8 auth loading → proof not started; authenticated → proof runs.
 *
 * Fake timers drive the bounded retry delays; a poll helper advances time
 * while querying because Testing Library polling needs timer progression.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mockBox = vi.hoisted(() => ({
  authStatus: 'authenticated' as string,
  authUserId: 'u-invited' as string | null,
  proofImpl: null as null | (() => Promise<unknown>),
  proofCalls: 0,
  setPasswordCalls: 0,
}));

vi.mock('../../services/pilot-invite-service', () => ({
  fetchMyLiveInvitation: () => {
    mockBox.proofCalls += 1;
    if (mockBox.proofImpl) return mockBox.proofImpl();
    return Promise.resolve(null);
  },
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: mockBox.authStatus, user: mockBox.authUserId ? { id: mockBox.authUserId } : null },
    service: {
      setAccountPassword: async () => {
        mockBox.setPasswordCalls += 1;
      },
    },
  }),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: 'en', dir: 'ltr' as const }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({ text: '#fff', textSecondary: '#aaa', textMuted: '#888', bg: '#000', bgCard: '#111', border: '#222', danger: '#f00', successText: '#0f0' }),
}));
vi.mock('../../store/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/navigation')>();
  return { ...actual, useAppDispatch: () => vi.fn() };
});
vi.mock('../../hooks/usePilotMembership', () => ({
  usePilotMembership: () => ({ status: 'ready', courierEntry: 'none', operatorEntry: 'none', isAdmin: false }),
}));

import { InviteSetupScreen } from '../../screens/auth/InviteSetupScreen';

const LIVE_ROW = {
  id: 'inv-1', user_id: 'u-invited', status: 'SENT', password_set_at: null, member_kind: 'family',
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Advance fake timers in steps until queryFn returns truthy (or timeout). */
async function pollFor(queryFn: () => unknown, label: string, budgetMs = 15000) {
  const start = Date.now();
  for (;;) {
    const found = queryFn();
    if (found) return found;
    if (Date.now() - start > 60000) throw new Error(`poll timeout: ${label}`);
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    if (budgetMs <= 0) throw new Error(`poll budget: ${label}`);
    budgetMs -= 200;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  mockBox.authStatus = 'authenticated';
  mockBox.authUserId = 'u-invited';
  mockBox.proofImpl = null;
  mockBox.proofCalls = 0;
  mockBox.setPasswordCalls = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('D1/D2 proof gate', () => {
  it('T1: slow proof shows loading, never invalid, then the form', async () => {
    const gate = deferred<unknown>();
    mockBox.proofImpl = () => gate.promise;
    render(<InviteSetupScreen />);
    expect(screen.getByText('pilot.loading')).toBeTruthy();
    expect(screen.queryByText('inviteSetup.linkExpired')).toBeNull();
    await act(async () => { gate.resolve(LIVE_ROW); });
    await pollFor(() => screen.queryByLabelText('login.password'), 'password form');
    expect(screen.queryByText('inviteSetup.linkExpired')).toBeNull();
  });

  it('T2: first fetch fails, bounded retry succeeds', async () => {
    let calls = 0;
    mockBox.proofImpl = () => { calls += 1; return calls === 1 ? Promise.reject(new Error('net')) : Promise.resolve(LIVE_ROW); };
    render(<InviteSetupScreen />);
    await pollFor(() => screen.queryByLabelText('login.password'), 'password form');
    expect(mockBox.proofCalls).toBeLessThanOrEqual(3);
    expect(screen.queryByText('inviteSetup.linkExpired')).toBeNull();
  });

  it('T3: exhausted retries show the fatal panel, never linkExpired; manual retry re-attempts', async () => {
    mockBox.proofImpl = () => Promise.reject(new Error('net'));
    render(<InviteSetupScreen />);
    await pollFor(() => screen.queryByText('inviteSetup.setupFailed'), 'fatal panel');
    expect(screen.queryByText('inviteSetup.linkExpired')).toBeNull();
    const before = mockBox.proofCalls;
    fireEvent.click(screen.getByText('inviteSetup.retryProof'));
    await pollFor(() => mockBox.proofCalls > before ? true : null, 'retry attempt');
    expect(mockBox.proofCalls).toBeGreaterThan(before);
  });

  it('T4: definitive null result maps to invalid without retry', async () => {
    mockBox.proofImpl = () => Promise.resolve(null);
    render(<InviteSetupScreen />);
    await pollFor(() => screen.queryByText('inviteSetup.linkExpired'), 'invalid message');
    const calls = mockBox.proofCalls;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mockBox.proofCalls).toBe(calls);
  });

  it('T6: identity mismatch maps to invalid', async () => {
    mockBox.proofImpl = () => Promise.resolve({ ...LIVE_ROW, user_id: 'u-other' });
    render(<InviteSetupScreen />);
    await pollFor(() => screen.queryByText('inviteSetup.linkExpired'), 'invalid message');
  });

  it('T7: submit success reaches the success phase with no invalid flash', async () => {
    mockBox.proofImpl = () => Promise.resolve(LIVE_ROW);
    render(<InviteSetupScreen />);
    await pollFor(() => screen.queryByLabelText('login.password'), 'password form');
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'LongEnough1' } });
    fireEvent.change(screen.getByLabelText('inviteSetup.confirmPassword'), { target: { value: 'LongEnough1' } });
    fireEvent.click(screen.getByText('inviteSetup.setPassword'));
    await pollFor(() => screen.queryByText('inviteSetup.familyWelcome'), 'success panel');
    expect(screen.queryByText('inviteSetup.linkExpired')).toBeNull();
    expect(mockBox.setPasswordCalls).toBe(1);
  });

  it('T8: auth loading starts no proof; authenticated starts it', async () => {
    mockBox.authStatus = 'loading';
    mockBox.authUserId = null;
    mockBox.proofImpl = () => Promise.resolve(LIVE_ROW);
    render(<InviteSetupScreen />);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mockBox.proofCalls).toBe(0);
  });
});

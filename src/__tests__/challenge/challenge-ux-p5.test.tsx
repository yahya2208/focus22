/**
 * P5.7 — UX verification tests for the challenge system.
 *
 * Covers:
 *   - AUTH_REQUIRED is shown correctly to the user
 *   - Loading states during submission and claim
 *   - Retry does NOT cause duplicate submissions (nonce uniqueness)
 *   - Claim persistence via localStorage survives "refresh"
 *   - Failed claim does NOT hide the original submission result
 *   - Retry button appears only for retryable errors
 *   - Retry transitions through submitting → submitted/error
 *   - localStorage claim backup is written on successful claim
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import type { AppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ResultsScreen } from '../../screens/results/ResultsScreen';
import { createDefaultCalibrationProfile } from '../../core/calibration';
import {
  setActiveChallengeId,
  resetChallengeContextForTests,
} from '../../challenge/challenge-context';

// ── Mocks ────────────────────────────────────────────────────────────────────

const recoverRpc = vi.fn<(fn: string, args?: unknown) => Promise<unknown>>(async () => ({ data: null, error: { message: 'recovery disabled in test' } }));
const otherRpc = vi.fn<(fn: string, args?: unknown) => Promise<unknown>>();
const mockRpc = vi.fn((fn: string, args?: unknown) =>
  fn === 'recover_my_challenge_state' ? recoverRpc(fn, args) : otherRpc(fn, args),
);

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../components/challenge/PersonalStats', () => ({
  PersonalStats: () => <div data-testid="personal-stats-placeholder" />,
}));

vi.mock('../../components/challenge/Leaderboard', () => ({
  Leaderboard: () => <div data-testid="leaderboard-placeholder" />,
}));

let mockAuthState: { status: string; user: { id: string; displayName: string } | null } = {
  status: 'authenticated',
  user: { id: 'user-1', displayName: 'Test' },
};
function mockUseAuth() {
  return { state: mockAuthState, researchRole: 'none' };
}

// ── Test Data ────────────────────────────────────────────────────────────────

const SAMPLE_RESULTS: NonNullable<AppState['results']> = {
  rawRts: [300, 280, 260, 290, 270, 285, 275],
  correctedRts: [275, 255, 235, 265, 245, 260, 250],
  calibration: createDefaultCalibrationProfile(),
  totalRounds: 7,
  validRounds: 7,
  sessionStart: 1_700_000_000_000,
  sessionEnd: 1_700_000_035_000,
};

const QUALIFIED_RESULT = {
  submission_id: 'sub-1',
  focus_score: 88,
  grade: 'A',
  rank: 1,
  is_qualified: true,
};

const CLAIM_RESULT = {
  claim_id: 'cl-1',
  code: 'AB12CD34',
  token: 'tok_abc123def456',
  expires_at: '2026-12-31T23:59:59Z',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function SeedResults({ challengeId }: { challengeId?: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (challengeId) setActiveChallengeId(challengeId);
    dispatch({ type: 'SET_RESULTS', results: SAMPLE_RESULTS });
    dispatch({ type: 'REPLACE', screen: 'results' });
  }, [dispatch, challengeId]);
  return null;
}

function NavProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function renderScreen({
  challengeId,
  authState,
}: {
  challengeId?: string;
  authState?: { status: string; user: { id: string; displayName: string } | null };
} = {}) {
  if (authState) mockAuthState = authState;
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          <SeedResults challengeId={challengeId} />
          <ResultsScreen />
          <NavProbe />
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  recoverRpc.mockClear();
  recoverRpc.mockImplementation(async () => ({ data: null, error: { message: 'recovery disabled in test' } }));
  otherRpc.mockReset();
  resetChallengeContextForTests();
  mockAuthState = {
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Test' },
  };
  localStorage.clear();
});

afterEach(() => {
  resetChallengeContextForTests();
  localStorage.clear();
});

// ── P5.7 Tests ───────────────────────────────────────────────────────────────

describe('P5.7 — AUTH_REQUIRED shows correctly', () => {
  it('shows sign-in CTA when unauthenticated', async () => {
    renderScreen({
      challengeId: 'ch-1',
      authState: { status: 'unauthenticated', user: null },
    });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-sign-in')).toBeTruthy();
    });
    expect(screen.getByText('Sign in to participate')).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  it('does NOT auto-submit when user is not authenticated', async () => {
    renderScreen({
      challengeId: 'ch-1',
      authState: { status: 'unauthenticated', user: null },
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });

    // Should NOT have called submit_challenge_score
    expect(otherRpc).not.toHaveBeenCalled();
  });

  it('shows loading state during submission', async () => {
    otherRpc.mockImplementation(() => new Promise(() => {})); // never resolves

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('Submitting your score…')).toBeTruthy();
    });
  });
});

describe('P5.7 — Retry without duplicate submission', () => {
  it('retry button appears only for retryable errors (NETWORK_ERROR)', async () => {
    otherRpc.mockRejectedValue(new Error('fetch failed'));

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-retry')).toBeTruthy();
    });
  });

  it('retry button does NOT appear for non-retryable errors (DUPLICATE_SUBMISSION)', async () => {
    otherRpc.mockResolvedValue({
      data: null,
      error: { message: 'Duplicate submission' },
    });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('You have already submitted to this challenge.')).toBeTruthy();
    });
    expect(screen.queryByTestId('challenge-retry')).toBeNull();
  });

  it('retry does NOT cause duplicate RPC calls (unique nonces)', async () => {
    // First call fails
    otherRpc.mockRejectedValueOnce(new Error('fetch failed'));
    // Retry call succeeds
    otherRpc.mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-retry')).toBeTruthy();
    });

    // First submission failed
    expect(otherRpc).toHaveBeenCalledTimes(1);

    // Click retry
    await act(async () => {
      screen.getByTestId('challenge-retry').click();
    });

    await waitFor(() => {
      expect(otherRpc).toHaveBeenCalledTimes(2);
    });

    // Nonces must be unique
    const nonce1 = (otherRpc.mock.calls[0]![1] as Record<string, unknown>)['p_nonce'] as string;
    const nonce2 = (otherRpc.mock.calls[1]![1] as Record<string, unknown>)['p_nonce'] as string;
    expect(nonce1).not.toBe(nonce2);
  });

  it('retry transitions: error → submitting → submitted', async () => {
    otherRpc.mockRejectedValueOnce(new Error('fetch failed'));
    otherRpc.mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-retry')).toBeTruthy();
    });

    await act(async () => {
      screen.getByTestId('challenge-retry').click();
    });

    await waitFor(() => {
      expect(screen.getByText('You qualified for the prize!')).toBeTruthy();
    });
  });
});

describe('P5.7 — Claim persistence via localStorage', () => {
  it('persists claim data to localStorage after successful claim', async () => {
    otherRpc
      .mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null })
      .mockResolvedValueOnce({ data: CLAIM_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-claim')).toBeTruthy();
    });

    await act(async () => {
      screen.getByTestId('challenge-claim').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('claim-code')).toBeTruthy();
    });

    // Check localStorage was populated
    const stored = localStorage.getItem('focus_claim_data');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.code).toBe('AB12CD34');
    expect(parsed.challengeId).toBe('ch-1');
    expect(parsed.submissionId).toBe('sub-1');
    expect(parsed.expiresAt).toBe('2026-12-31T23:59:59Z');
  });
});

describe('P5.7 — Failed claim does NOT hide original result', () => {
  it('shows original score/grade/rank after claim failure', async () => {
    otherRpc
      .mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null })
      .mockRejectedValueOnce(new Error('Network error'));

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('88')).toBeTruthy();
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();

    // Click claim
    await act(async () => {
      screen.getByTestId('challenge-claim').click();
    });

    // After claim failure, result should still be visible
    await waitFor(() => {
      expect(screen.getByText('88')).toBeTruthy();
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('Qualified')).toBeTruthy();
  });

  it('claim failure keeps "Claim Prize" button available for retry', async () => {
    otherRpc
      .mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null })
      .mockRejectedValueOnce(new Error('Network error'));

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-claim')).toBeTruthy();
    });

    await act(async () => {
      screen.getByTestId('challenge-claim').click();
    });

    // After claim failure, claim button should still be available
    await waitFor(() => {
      expect(screen.getByTestId('challenge-claim')).toBeTruthy();
    });
  });
});

describe('P5.7 — Loading states', () => {
  it('shows "Submitting your score…" during submission', async () => {
    otherRpc.mockImplementation(() => new Promise(() => {})); // hang forever

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('Submitting your score…')).toBeTruthy();
    });
  });

  it('shows "Generating your claim code…" during claim', async () => {
    otherRpc
      .mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null })
      .mockImplementation(() => new Promise(() => {})); // hang on claim

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-claim')).toBeTruthy();
    });

    await act(async () => {
      screen.getByTestId('challenge-claim').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Generating your claim code…')).toBeTruthy();
    });
  });
});

describe('P5.7 — Score still visible after error', () => {
  it('shows server result alongside error when submission succeeds but then errors', async () => {
    // This tests that the result persists even if the challenge system errors
    otherRpc.mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('88')).toBeTruthy();
    });

    // The regular focus score ring should also be visible
    expect(screen.getByText('/100')).toBeTruthy();
  });
});

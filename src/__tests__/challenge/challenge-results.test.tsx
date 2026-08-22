/**
 * P4 Tests — Challenge Results UI integration.
 *
 * Covers:
 *   - Normal non-challenge result remains unchanged
 *   - Challenge card does NOT render when no challenge context
 *   - Authenticated challenge submission flow
 *   - Unauthenticated challenge state (sign-in CTA)
 *   - Qualified result with server-authoritative score/grade/rank
 *   - Non-qualified result (no claim button)
 *   - Duplicate-submit prevention
 *   - RPC/server errors
 *   - Claim flow (button → code shown once)
 *   - Auto-advance paused during challenge context
 *   - Auto-advance resumes when no challenge
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import type { AppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ResultsScreen, RESULTS_SHOWROOM_AUTO_ADVANCE_MS } from '../../screens/results/ResultsScreen';
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

vi.mock('../../components/challenge/PersonalStats', () => ({
  PersonalStats: () => <div data-testid="personal-stats-placeholder" />,
}));

vi.mock('../../components/challenge/Leaderboard', () => ({
  Leaderboard: () => <div data-testid="leaderboard-placeholder" />,
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

let mockAuthState: { status: string; user: { id: string; displayName: string } | null } = { status: 'authenticated', user: { id: 'user-1', displayName: 'Test' } };
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

const NOT_QUALIFIED_RESULT = {
  submission_id: 'sub-2',
  focus_score: 45,
  grade: 'D',
  rank: 42,
  is_qualified: false,
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

function renderScreen({ challengeId, authState }: { challengeId?: string; authState?: { status: string; user: { id: string; displayName: string } | null } } = {}) {
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

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  recoverRpc.mockClear();
  recoverRpc.mockImplementation(async () => ({ data: null, error: { message: 'recovery disabled in test' } }));
  otherRpc.mockReset();
  resetChallengeContextForTests();
  mockAuthState = { status: 'authenticated', user: { id: 'user-1', displayName: 'Test' } };
  localStorage.clear();
});

afterEach(() => {
  resetChallengeContextForTests();
});

describe('P4 — Normal non-challenge result remains unchanged', () => {
  it('renders results and auto-advances to showroom without challenge card', () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      expect(screen.getByText('/100')).toBeTruthy();
      expect(screen.queryByTestId('challenge-result-card')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    } finally {
      vi.useRealTimers();
    }
  });

  it('challenge card is NOT rendered when challengeId is null', () => {
    renderScreen();
    expect(screen.queryByTestId('challenge-result-card')).toBeNull();
  });
});

describe('P4 — Authenticated challenge submission', () => {
  it('auto-submits when challengeId is present and user is authenticated', async () => {
    otherRpc.mockResolvedValue({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(otherRpc).toHaveBeenCalledTimes(1);
    });

    const [rpcName, params] = otherRpc.mock.calls[0]! as [string, Record<string, unknown>];
    expect(rpcName).toBe('submit_challenge_score');
    expect(params.p_challenge_id).toBe('ch-1');
  });

  it('does NOT auto-advance when in challenge context', async () => {
    vi.useFakeTimers();
    otherRpc.mockResolvedValue({ data: QUALIFIED_RESULT, error: null });

    try {
      renderScreen({ challengeId: 'ch-1' });
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS + 1000);
      });
      expect(screen.getByTestId('screen').textContent).toBe('results');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('P4 — Unauthenticated challenge state', () => {
  it('shows sign-in CTA when user is not authenticated', async () => {
    otherRpc.mockResolvedValue({ data: null, error: { message: 'Authentication required' } });

    renderScreen({
      challengeId: 'ch-1',
      authState: { status: 'unauthenticated', user: null },
    });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-sign-in')).toBeTruthy();
    });
  });

  it('shows sign-in CTA when user status is loading', async () => {
    renderScreen({
      challengeId: 'ch-1',
      authState: { status: 'loading', user: null },
    });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-sign-in')).toBeTruthy();
    });
  });
});

describe('P4 — Qualified result with server-authoritative score/grade/rank', () => {
  it('displays server score, grade, and rank after submission', async () => {
    otherRpc.mockResolvedValue({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('88')).toBeTruthy();
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('Qualified')).toBeTruthy();
    expect(screen.getByText('You qualified for the prize!')).toBeTruthy();
  });

  it('shows claim button when qualified', async () => {
    otherRpc.mockResolvedValue({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-claim')).toBeTruthy();
    });
  });
});

describe('P4 — Non-qualified result', () => {
  it('does NOT show claim button when not qualified', async () => {
    otherRpc.mockResolvedValue({ data: NOT_QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('45')).toBeTruthy();
    });
    expect(screen.queryByTestId('challenge-claim')).toBeNull();
    expect(screen.queryByText('Qualified')).toBeNull();
    expect(screen.queryByText('You qualified for the prize!')).toBeNull();
  });

  it('shows neutral message for non-qualified', async () => {
    otherRpc.mockResolvedValue({ data: NOT_QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('Score submitted to the challenge.')).toBeTruthy();
    });
  });
});

describe('P4 — Duplicate-submit prevention', () => {
  it('only calls RPC once even if hook re-renders', async () => {
    otherRpc.mockResolvedValue({ data: QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(otherRpc).toHaveBeenCalledTimes(1);
    });
  });
});

describe('P4 — RPC/server errors', () => {
  it('shows rate-limit error message', async () => {
    otherRpc.mockResolvedValue({
      data: null,
      error: { message: 'Rate limit exceeded' },
    });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('Too many submissions. Please try again in a moment.')).toBeTruthy();
    });
  });

  it('shows generic error for unknown errors', async () => {
    otherRpc.mockResolvedValue({
      data: null,
      error: { message: 'Something unexpected' },
    });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('Could not submit your score. Please try again.')).toBeTruthy();
    });
  });

  it('shows network error for thrown exceptions', async () => {
    otherRpc.mockRejectedValue(new Error('fetch failed'));

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByText('Could not submit your score. Please try again.')).toBeTruthy();
    });
  });
});

describe('P4 — Claim flow', () => {
  it('does not show claim code for non-qualified results', async () => {
    otherRpc.mockResolvedValue({ data: NOT_QUALIFIED_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-result-card')).toBeTruthy();
    }, { timeout: 3000 });

    expect(screen.queryByTestId('challenge-claim')).toBeNull();
    await waitFor(() => {
      expect(screen.getByText('45')).toBeTruthy();
    });
    expect(screen.queryByTestId('claim-code')).toBeNull();
  });

  it('shows claim code after claiming', async () => {
    otherRpc
      .mockResolvedValueOnce({ data: QUALIFIED_RESULT, error: null })
      .mockResolvedValueOnce({ data: CLAIM_RESULT, error: null });

    renderScreen({ challengeId: 'ch-1' });

    await waitFor(() => {
      expect(screen.getByTestId('challenge-claim')).toBeTruthy();
    });

    const claimBtn = screen.getByTestId('challenge-claim');
    await act(async () => {
      claimBtn.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('claim-code')).toBeTruthy();
    });
    expect(screen.getByText('AB12CD34')).toBeTruthy();
  });
});

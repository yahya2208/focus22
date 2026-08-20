/**
 * Regression tests — Challenge result restoration after page refresh (P1).
 *
 * Covers:
 *   - useChallengeSubmission restores result from localStorage on mount
 *   - useChallengeSubmission prevents auto-submit when result already restored
 *   - useChallengeSubmission prevents auto-submit when rawRts is empty
 *   - ResultsScreen renders challenge-only path when no game results but result exists
 *   - localStorage result persists correct data after submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ResultsScreen } from '../../screens/results/ResultsScreen';
import { createDefaultCalibrationProfile } from '../../core/calibration';
import {
  setActiveChallengeId,
  resetChallengeContextForTests,
} from '../../challenge/challenge-context';

const mockRpc = vi.fn();

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
  useAuth: () => ({ state: { status: 'authenticated', user: { id: 'user-1', displayName: 'Test' } }, researchRole: 'none' }),
}));

const SAMPLE_RESULTS = {
  rawRts: [300, 280, 260, 290, 270, 285, 275],
  correctedRts: [275, 255, 235, 265, 245, 260, 250],
  calibration: createDefaultCalibrationProfile(),
  totalRounds: 7,
  validRounds: 7,
  sessionStart: 1_700_000_000_000,
  sessionEnd: 1_700_000_035_000,
};

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

function renderWithResults(challengeId?: string) {
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

function renderWithoutResults(challengeId?: string) {
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          {challengeId && (
            <SeedChallengeOnly challengeId={challengeId} />
          )}
          <ResultsScreen />
          <NavProbe />
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

function SeedChallengeOnly({ challengeId }: { challengeId: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    setActiveChallengeId(challengeId);
    dispatch({ type: 'REPLACE', screen: 'results' });
  }, [challengeId, dispatch]);
  return null;
}

beforeEach(() => {
  mockRpc.mockReset();
  resetChallengeContextForTests();
  localStorage.clear();
});

describe('Result restoration from localStorage', () => {
  it('restores result from stored data and does not re-submit', async () => {
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-restore-1',
      submissionId: 'sub-restore-1',
      focusScore: 88,
      grade: 'A',
      rank: 1,
      isQualified: true,
      isCurrentLeader: true,
      timestamp: Date.now(),
    }));

    renderWithoutResults('ch-restore-1');

    await waitFor(() => {
      expect(screen.getByText('88')).toBeTruthy();
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.queryByText('Qualified')).toBeTruthy();

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('sets status to claimed when both result and claim are stored', async () => {
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-restore-2',
      submissionId: 'sub-restore-2',
      focusScore: 92,
      grade: 'A+',
      rank: 1,
      isQualified: true,
      isCurrentLeader: true,
      timestamp: Date.now(),
    }));
    localStorage.setItem('focus_claim_data', JSON.stringify({
      submissionId: 'sub-restore-2',
      claimId: 'cl-restore-2',
      code: 'AB12CD34',
      token: 'tok_restore',
      expiresAt: '2099-12-31T23:59:59Z',
      challengeId: 'ch-restore-2',
    }));

    renderWithoutResults('ch-restore-2');

    await waitFor(() => {
      expect(screen.getByTestId('claim-code')).toBeTruthy();
    });
    expect(screen.getByText('AB12CD34')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('ignores stored result for a different challenge ID', async () => {
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-other',
      submissionId: 'sub-other',
      focusScore: 50,
      grade: 'C',
      rank: 10,
      isQualified: false,
      isCurrentLeader: false,
      timestamp: Date.now(),
    }));

    mockRpc.mockResolvedValue({ data: { submission_id: 'sub-1', focus_score: 75, grade: 'B', rank: 3, is_qualified: false, is_current_leader: false }, error: null });

    setActiveChallengeId('ch-different');
    renderWithResults('ch-different');

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('75')).toBeTruthy();
  });

  it('does not restore expired claim data', async () => {
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-restore-3',
      submissionId: 'sub-restore-3',
      focusScore: 92,
      grade: 'A',
      rank: 1,
      isQualified: true,
      isCurrentLeader: true,
      timestamp: Date.now(),
    }));
    localStorage.setItem('focus_claim_data', JSON.stringify({
      submissionId: 'sub-restore-3',
      claimId: 'cl-restore-3',
      code: 'EXPIRED',
      token: 'tok_expired',
      expiresAt: '2020-01-01T00:00:00Z',
      challengeId: 'ch-restore-3',
    }));

    renderWithoutResults('ch-restore-3');

    await waitFor(() => {
      expect(screen.getByText('92')).toBeTruthy();
    });
    expect(screen.queryByTestId('claim-code')).toBeNull();
  });
});

describe('ResultsScreen challenge-only render path', () => {
  it('shows ChallengeResultCard when no game results but challenge result exists', async () => {
    localStorage.setItem('focus_challenge_result', JSON.stringify({
      challengeId: 'ch-p1',
      submissionId: 'sub-p1',
      focusScore: 65,
      grade: 'B',
      rank: 5,
      isQualified: false,
      isCurrentLeader: false,
      timestamp: Date.now(),
    }));

    renderWithoutResults('ch-p1');

    await waitFor(() => {
      expect(screen.getByText('65')).toBeTruthy();
    });
    expect(screen.getByTestId('challenge-result-card')).toBeTruthy();
    expect(screen.getByTestId('personal-stats-placeholder')).toBeTruthy();
    expect(screen.getByTestId('leaderboard-placeholder')).toBeTruthy();
  });

  it('shows no-results fallback when not in challenge and no results', () => {
    render(
      <AppProvider>
        <ThemeProvider>
          <TranslationProvider>
            <ResultsScreen />
          </TranslationProvider>
        </ThemeProvider>
      </AppProvider>,
    );
    expect(screen.getByText(/No results/i)).toBeTruthy();
  });
});

describe('Prevents auto-submit with empty rawRts', () => {
  it('does not submit when rawRts is empty even with valid challenge ID', async () => {
    mockRpc.mockResolvedValue({ data: { submission_id: 'sub-1', focus_score: 88, grade: 'A', rank: 1, is_qualified: true, is_current_leader: true }, error: null });

    render(
      <AppProvider>
        <ThemeProvider>
          <TranslationProvider>
            <EmptyRtsChallenge challengeId="ch-empty" />
            <ResultsScreen />
          </TranslationProvider>
        </ThemeProvider>
      </AppProvider>,
    );

    await new Promise(r => setTimeout(r, 200));
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

function EmptyRtsChallenge({ challengeId }: { challengeId: string }) {
  useEffect(() => {
    setActiveChallengeId(challengeId);
  }, [challengeId]);
  return null;
}

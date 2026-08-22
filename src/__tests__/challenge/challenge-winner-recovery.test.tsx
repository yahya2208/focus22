/**
 * Challenge Winner Recovery — ChallengeWinnerScreen submissionId fallback.
 *
 * Covers:
 *   a. Local submissionId (localStorage) is preferred when available
 *   b. Route submissionId is preferred when available
 *   c. Server bestSubmissionId is used when local/route submissionId is unavailable
 *   d. Final winner comparison uses final_winner_submission_id (not isCurrentLeader)
 *   e. Provisional isCurrentLeader is never treated as final winner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ChallengeWinnerScreen } from '../../screens/challenge/ChallengeWinnerScreen';
import {
  setActiveChallengeId,
  resetChallengeContextForTests,
} from '../../challenge/challenge-context';
import type { ChallengePublicInfo } from '../../challenge/types';

const mockGetChallengePublicInfo = vi.fn();

vi.mock('../../challenge/challenge-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../challenge/challenge-service')>();
  return {
    ...actual,
    getChallengePublicInfo: (...args: unknown[]) => mockGetChallengePublicInfo(...args),
  };
});

vi.mock('../../components/challenge/WinnerCertificate', () => ({
  WinnerCertificate: () => <div data-testid="winner-certificate" />,
}));

vi.mock('../../components/challenge/ClaimReceipt', () => ({
  ClaimReceipt: () => <div data-testid="claim-receipt" />,
}));

let mockAuthState: { status: string; user: Record<string, unknown> | null } = {
  status: 'authenticated',
  user: { id: 'user-1', displayName: 'Test Player' },
};

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

function makePublicInfo(overrides: Partial<{
  isFinalized: boolean;
  winnerSubmissionId: string | null;
  finalWinnerName: string | null;
  userBestSubmissionId: string | null;
  userBestScore: number | null;
  userBestGrade: string | null;
}> = {}): ChallengePublicInfo {
  return {
    challenge: {
      id: 'ch-winner-1',
      name: 'Test Challenge',
      description: 'A test challenge',
      status: 'ended',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
      prizeDescription: 'Free phone',
      isFinalized: overrides.isFinalized ?? true,
      finalWinnerName: overrides.finalWinnerName ?? 'Test Player',
      winnerSubmissionId: overrides.winnerSubmissionId ?? 'sub-winner-1',
    },
    top5: [
      { rank: 1, displayName: 'Test Player', focusScore: 95, grade: 'A' },
    ],
    user: {
      bestScore: overrides.userBestScore ?? 95,
      bestGrade: overrides.userBestGrade ?? 'A',
      bestSubmissionId: overrides.userBestSubmissionId ?? null,
      personalRank: 1,
      totalSubmissions: 1,
    },
  };
}

function SeedToWinner({
  challengeId,
  submissionId,
}: {
  challengeId: string;
  submissionId?: string;
}) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    setActiveChallengeId(challengeId);
    dispatch({
      type: 'REPLACE',
      screen: 'challenge-winner',
      params: {
        challenge_id: challengeId,
        ...(submissionId ? { submissionId } : {}),
      },
    });
  }, [challengeId, submissionId, dispatch]);
  return null;
}

function renderWinner(opts: {
  challengeId?: string;
  routeSubmissionId?: string;
  localStorageSubmissionId?: string;
  publicInfoOverrides?: Parameters<typeof makePublicInfo>[0];
} = {}) {
  const cid = opts.challengeId ?? 'ch-winner-1';
  mockGetChallengePublicInfo.mockResolvedValue(makePublicInfo(opts.publicInfoOverrides));

  if (opts.localStorageSubmissionId) {
    localStorage.setItem('focus_challenge_submission_id', JSON.stringify({
      challengeId: cid,
      submissionId: opts.localStorageSubmissionId,
    }));
  }

  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          <SeedToWinner challengeId={cid} submissionId={opts.routeSubmissionId} />
          <ChallengeWinnerScreen />
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  mockGetChallengePublicInfo.mockReset();
  resetChallengeContextForTests();
  localStorage.clear();
  mockAuthState = {
    status: 'authenticated',
    user: { id: 'user-1', displayName: 'Test Player' },
  };
});

describe('ChallengeWinnerScreen — submissionId resolution', () => {
  it('a. resolves winner status from server truth even when localStorage holds a different id', async () => {
    renderWinner({
      localStorageSubmissionId: 'sub-local-1',
      publicInfoOverrides: {
        winnerSubmissionId: 'sub-server-1',
        userBestSubmissionId: 'sub-server-1',
        finalWinnerName: 'Test Player',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('You Won!')).toBeTruthy();
    });
    expect(mockGetChallengePublicInfo).toHaveBeenCalledTimes(1);
  });

  it('b. ignores URL submissionId — spoofed route params cannot grant winner status', async () => {
    renderWinner({
      routeSubmissionId: 'sub-winner-1',
      localStorageSubmissionId: 'sub-local-different',
      publicInfoOverrides: {
        // Server says this user's own best submission does NOT match the winner
        winnerSubmissionId: 'sub-winner-1',
        userBestSubmissionId: null,
        finalWinnerName: 'Test Player',
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/finalized/i)).toBeTruthy();
    });
    expect(screen.queryByText('You Won!')).toBeNull();
  });

  it('c. uses server bestSubmissionId when local/route submissionId unavailable', async () => {
    renderWinner({
      publicInfoOverrides: {
        winnerSubmissionId: 'sub-server-1',
        userBestSubmissionId: 'sub-server-1',
        finalWinnerName: 'Test Player',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('You Won!')).toBeTruthy();
    });
  });

  it('d. shows Challenge Finalized (not You Won!) when user is not the winner', async () => {
    renderWinner({
      localStorageSubmissionId: 'sub-not-winner',
      publicInfoOverrides: {
        winnerSubmissionId: 'sub-other-player',
        finalWinnerName: 'Other Player',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Challenge Finalized')).toBeTruthy();
    });
    expect(screen.queryByText('You Won!')).toBeNull();
  });

  it('e. does not treat isCurrentLeader as final winner', async () => {
    renderWinner({
      localStorageSubmissionId: 'sub-local-leader',
      publicInfoOverrides: {
        isFinalized: true,
        winnerSubmissionId: 'sub-other-player',
        finalWinnerName: 'Other Player',
        userBestSubmissionId: 'sub-local-leader',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Challenge Finalized')).toBeTruthy();
    });
    expect(screen.queryByText('You Won!')).toBeNull();
    expect(screen.getByText('Other Player')).toBeTruthy();
  });

  it('c2. shows non-winner banner when no submissionId available at all', async () => {
    renderWinner({
      publicInfoOverrides: {
        isFinalized: true,
        winnerSubmissionId: 'sub-someone-else',
        finalWinnerName: 'Someone Else',
        userBestSubmissionId: null,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Challenge Finalized')).toBeTruthy();
    });
    expect(screen.queryByText('You Won!')).toBeNull();
  });
});

describe('ChallengeWinnerScreen — unfinalized challenge', () => {
  it('shows not-finalized message when challenge is not finalized', async () => {
    renderWinner({
      localStorageSubmissionId: 'sub-1',
      publicInfoOverrides: {
        isFinalized: false,
        winnerSubmissionId: null,
        finalWinnerName: null,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/not been finalized/i)).toBeTruthy();
    });
  });
});

describe('ChallengeWinnerScreen — no challenge', () => {
  it('shows no-challenge message when no challenge ID is available', () => {
    render(
      <AppProvider>
        <ThemeProvider>
          <TranslationProvider>
            <ChallengeWinnerScreen />
          </TranslationProvider>
        </ThemeProvider>
      </AppProvider>,
    );
    expect(screen.getByText('No challenge selected.')).toBeTruthy();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import fs from 'fs';
import path from 'path';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import type { AppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { BackProvider, useBack } from '../../core/navigation/BackProvider';
import { ResultsScreen, RESULTS_SHOWROOM_AUTO_ADVANCE_MS } from '../../screens/results/ResultsScreen';
import { createDefaultCalibrationProfile } from '../../core/calibration';
import { EDGES } from '../../core/navigation/reachability';

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'user-1', displayName: 'Test' } },
    researchRole: 'none',
  }),
}));

const SAMPLE_RESULTS: NonNullable<AppState['results']> = {
  rawRts: [300, 280, 260, 290, 270],
  correctedRts: [275, 255, 235, 265, 245],
  calibration: createDefaultCalibrationProfile(),
  totalRounds: 5,
  validRounds: 5,
  sessionStart: 1_700_000_000_000,
  sessionEnd: 1_700_000_035_000,
};

function SeedResults() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'SET_RESULTS', results: SAMPLE_RESULTS });
    dispatch({ type: 'REPLACE', screen: 'results' });
  }, [dispatch]);
  return null;
}

function NavProbe() {
  const { screen: current } = useAppState();
  return <div data-testid="screen">{current}</div>;
}

function BackTrigger() {
  const back = useBack();
  return (
    <button type="button" onClick={back}>
      back
    </button>
  );
}

function renderScreen({ withBack = false } = {}) {
  const content = (
    <>
      <SeedResults />
      <ResultsScreen />
      <NavProbe />
    </>
  );
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          {withBack ? (
            <BackProvider>
              {content}
              <BackTrigger />
            </BackProvider>
          ) : (
            content
          )}
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

const SRC = path.resolve(__dirname, '../..');
function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}
function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
const RESULTS_SRC = codeOnly(read('screens/results/ResultsScreen.tsx'));

describe('P0 Correction — Game→Results→Showroom (showroom is the ONLY post-game destination)', () => {
  it('displays the final result very briefly, then auto-advances to the showroom without any CTA', () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      expect(screen.getByRole('heading', { level: 1, name: 'Results' })).toBeTruthy();
      expect(screen.getByText('/100')).toBeTruthy();
      expect(screen.getByTestId('screen').textContent).toBe('results');
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders NO interactive CTA — no Coach / Achievements / Share / Home / Save / Register / Play Again', () => {
    renderScreen();
    expect(screen.getByText('/100')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByText(/Continue to Showroom/i)).toBeNull();
    expect(screen.queryByText(/Mistakes Coach/i)).toBeNull();
    expect(screen.queryByText(/Achievements/i)).toBeNull();
    expect(screen.queryByText(/Share Results/i)).toBeNull();
    expect(screen.queryByText(/Home/i)).toBeNull();
    expect(screen.queryByText(/Save & Exit/i)).toBeNull();
    expect(screen.queryByText(/Register/i)).toBeNull();
    expect(screen.queryByText(/Play Again/i)).toBeNull();
  });

  it('blocks back — there is no back exit path out of Results to any other screen', () => {
    vi.useFakeTimers();
    try {
      renderScreen({ withBack: true });
      fireEvent.click(screen.getByRole('button', { name: 'back' }));
      expect(screen.getByTestId('screen').textContent).toBe('results');
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the user cannot remain on Results waiting to choose another CTA — the only outcome is the showroom', () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('P0 Correction — static source audit: the post-game tree is gone', () => {
  it('single canonical exit: the only navigation dispatch in ResultsScreen is REPLACE → showroom', () => {
    expect(RESULTS_SRC).toMatch(/'REPLACE', screen: 'showroom'/);
    expect(RESULTS_SRC).not.toMatch(/'NAVIGATE'/);
    expect(RESULTS_SRC).not.toMatch(/'RESET'/);
    expect(RESULTS_SRC).not.toMatch(/'BACK'/);
  });

  it('no coach / achievements / share / home / register / play-again targets remain', () => {
    expect(RESULTS_SRC).not.toContain("screen: 'coach'");
    expect(RESULTS_SRC).not.toContain("screen: 'achievements'");
    expect(RESULTS_SRC).not.toContain("screen: 'share'");
    expect(RESULTS_SRC).not.toContain("screen: 'home'");
    expect(RESULTS_SRC).not.toContain("screen: 'register'");
    expect(RESULTS_SRC).not.toContain("screen: 'playAgain'");
    expect(RESULTS_SRC).not.toContain('AdContactBanner');
  });

  it('no persistence / save-result logic inside ResultsScreen', () => {
    expect(RESULTS_SRC).not.toContain('SAVE_SESSION');
    expect(RESULTS_SRC).not.toContain('completeSession');
    expect(RESULTS_SRC).not.toMatch(/localStorage|sessionStorage/);
    expect(RESULTS_SRC).not.toMatch(/\.from\([^)]*\)\s*\.\s*(insert|upsert|update|delete)\b/);
  });

  it('no internal commercial route and no window.open', () => {
    expect(RESULTS_SRC).not.toContain('window.open');
    expect(RESULTS_SRC).not.toMatch(/\b(checkout|cart|payment|wallet|financing)\b|سلة|الدفع|إتمام الشراء|شراء فوري|أود شراء|أرغب في شراء/);
  });
});

describe('P0 Correction — navigation model: showroom is the only destination after results', () => {
  it('documents the canonical chain game → results → showroom', () => {
    expect(EDGES.results).toContain('game');
    expect(EDGES.showroom).toContain('results');
    expect(EDGES.showroom).toContain('home');
  });

  it('results has NO route to coach / achievements / share / home / register / countdown — showroom only', () => {
    for (const target of ['coach', 'achievements', 'share', 'home', 'register', 'countdown'] as const) {
      expect(EDGES[target]).not.toContain('results');
    }
  });

  it('QR → GAME → RESULTS → SHOWROOM and direct GAME → RESULTS → SHOWROOM converge on the same destination', () => {
    expect(EDGES['game-intro']).toContain('deep-link');
    expect(EDGES.game).toContain('countdown');
    expect(EDGES.results).toContain('game');
    expect(EDGES.showroom).toContain('results');
    const replaces = RESULTS_SRC.match(/'REPLACE', screen: '[^']+'/g) ?? [];
    expect(replaces).toEqual(["'REPLACE', screen: 'showroom'"]);
  });

  it('GameScreen still lands on results via SET_RESULTS + REPLACE + completeSession', () => {
    const game = codeOnly(read('screens/game/GameScreen.tsx'));
    expect(game).toMatch(/'SET_RESULTS'/);
    expect(game).toMatch(/'REPLACE', screen: 'results'/);
    expect(game).toMatch(/completeSession/);
  });
});

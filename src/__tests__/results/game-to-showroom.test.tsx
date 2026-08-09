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
  }, [dispatch]);
  return null;
}

function NavProbe() {
  const { screen } = useAppState();
  return <div data-testid="screen">{screen}</div>;
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

describe('P0 Game→Showroom — ResultsScreen completion routing', () => {
  it('renders the final result with the Continue → Showroom CTA', async () => {
    renderScreen();
    expect(await screen.findByRole('button', { name: /Continue to Showroom/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Results' })).toBeTruthy();
    expect(screen.getByText('/100')).toBeTruthy();
  });

  it('Continue → Showroom immediately REPLACEs to the showroom', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /Continue to Showroom/ }));
    expect(screen.getByTestId('screen').textContent).toBe('showroom');
  });

  it('auto-advances to the showroom after the brief result display', () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      expect(screen.getByText('/100')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    } finally {
      vi.useRealTimers();
    }
  });

  it('manual Continue cancels the pending auto-advance (single canonical exit)', () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: /Continue to Showroom/ }));
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
      act(() => {
        vi.advanceTimersByTime(RESULTS_SHOWROOM_AUTO_ADVANCE_MS + 10_000);
      });
      expect(screen.getByTestId('screen').textContent).toBe('showroom');
    } finally {
      vi.useRealTimers();
    }
  });

  it('back from results still routes home (RESET guard, no stale game below)', () => {
    renderScreen({ withBack: true });
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('screen').textContent).toBe('home');
  });
});

describe('P0 Game→Showroom — post-game persistence/commercial tree removed', () => {
  it('no Play Again / Save & Exit / Register buttons remain', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Continue to Showroom/ });
    expect(screen.queryByRole('button', { name: /Play Again/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save & Exit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Register/ })).toBeNull();
  });

  it('renders no ad banner on results (no post-game commercial CTA)', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Continue to Showroom/ });
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('keeps the useful options actually reachable (Coach / Achievements / Share)', async () => {
    renderScreen();
    await screen.findByRole('button', { name: /Continue to Showroom/ });
    fireEvent.click(screen.getByRole('button', { name: /Mistakes Coach/ }));
    expect(screen.getByTestId('screen').textContent).toBe('coach');
    fireEvent.click(screen.getByRole('button', { name: /Achievements/ }));
    expect(screen.getByTestId('screen').textContent).toBe('achievements');
    fireEvent.click(screen.getByRole('button', { name: /Share Results/ }));
    expect(screen.getByTestId('screen').textContent).toBe('share');
  });

  it('static: no window.open / no persistence / no internal commerce in ResultsScreen', () => {
    expect(RESULTS_SRC).not.toContain('window.open');
    expect(RESULTS_SRC).not.toContain('SAVE_SESSION');
    expect(RESULTS_SRC).not.toContain('completeSession');
    expect(RESULTS_SRC).not.toMatch(/localStorage|sessionStorage/);
    expect(RESULTS_SRC).not.toMatch(/\.from\([^)]*\)\s*\.\s*(insert|upsert|update|delete)\b/);
    expect(RESULTS_SRC).not.toMatch(/\b(checkout|cart|payment|wallet|financing)\b|سلة|الدفع|إتمام الشراء|شراء فوري|أود شراء|أرغب في شراء/);
  });

  it('static: no register CTA / no ad banner, single canonical REPLACE exit to showroom', () => {
    expect(RESULTS_SRC).not.toContain("screen: 'register'");
    expect(RESULTS_SRC).not.toContain('AdContactBanner');
    expect(RESULTS_SRC).toMatch(/'REPLACE', screen: 'showroom'/);
  });
});

describe('P0 Game→Showroom — navigation model and completion contract', () => {
  it('documents the canonical chain game → results → showroom (QR and direct converge)', () => {
    expect(EDGES.results).toContain('game');
    expect(EDGES.showroom).toContain('results');
    expect(EDGES['game-intro']).toContain('deep-link');
  });

  it('kept useful options remain documented as reachable from results (no orphans)', () => {
    expect(EDGES.coach).toContain('results');
    expect(EDGES.achievements).toContain('results');
    expect(EDGES.share).toContain('results');
  });

  it('static: game completion still lands on results via SET_RESULTS + REPLACE', () => {
    const game = codeOnly(read('screens/game/GameScreen.tsx'));
    expect(game).toMatch(/'SET_RESULTS'/);
    expect(game).toMatch(/'REPLACE', screen: 'results'/);
    expect(game).toMatch(/completeSession/);
  });
});

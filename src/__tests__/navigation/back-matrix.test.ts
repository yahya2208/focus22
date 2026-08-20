import { describe, it, expect } from 'vitest';
import { ALL_SCREEN_NAMES } from '../../store/navigation';
import {
  BACK_MATRIX,
  getBackMatrixRow,
  shouldShowBackAffordance,
} from '../../core/navigation/back-matrix';

describe('back matrix (Phase 2) — completeness', () => {
  it('covers every registered screen exactly once', () => {
    expect(ALL_SCREEN_NAMES.length).toBe(42);
    expect(Object.keys(BACK_MATRIX).sort()).toEqual([...ALL_SCREEN_NAMES].sort());
  });

  it('every row references a valid screen', () => {
    for (const row of Object.values(BACK_MATRIX)) {
      expect(ALL_SCREEN_NAMES).toContain(row.screen);
    }
  });

  it('every row has a concrete behavior for browser and android back', () => {
    const behaviors = ['back', 'double-exit', 'step-back', 'guard', 'replace'];
    for (const row of Object.values(BACK_MATRIX)) {
      expect(behaviors).toContain(row.browserBack);
      expect(behaviors).toContain(row.androidBack);
    }
  });

  it('only home allows native exit', () => {
    const exitAllowed = Object.values(BACK_MATRIX).filter((r) => r.exitAllowed);
    expect(exitAllowed.map((r) => r.screen)).toEqual(['home']);
  });

  it('only home uses double-exit', () => {
    const doubleExit = Object.values(BACK_MATRIX).filter(
      (r) => r.browserBack === 'double-exit' || r.androidBack === 'double-exit',
    );
    expect(doubleExit.map((r) => r.screen)).toEqual(['home']);
  });

  it('game uses the guard behavior (Stop & Save / Resume)', () => {
    const row = getBackMatrixRow('game')!;
    expect(row.browserBack).toBe('guard');
    expect(row.androidBack).toBe('guard');
    expect(row.hasInContentBackButton).toBe(false);
  });

  it('root-level and single-entry backTargets use the documented targets', () => {
    expect(getBackMatrixRow('home')!.backTarget).toBe('root');
    expect(getBackMatrixRow('register')!.backTarget).toBe('previous');
    expect(getBackMatrixRow('login')!.backTarget).toBe('previous');
    expect(getBackMatrixRow('about')!.backTarget).toBe('settings');
    expect(getBackMatrixRow('showroom')!.backTarget).toBe('home');
    expect(getBackMatrixRow('repair-request')!.browserBack).toBe('step-back');
  });
});

describe('shouldShowBackAffordance', () => {
  it('never shows on home (double-exit root)', () => {
    expect(shouldShowBackAffordance('home', ['home'])).toBe(false);
    expect(shouldShowBackAffordance('home', ['home', 'settings'])).toBe(false);
  });

  it('hides when the screen has its own in-content back control', () => {
    expect(shouldShowBackAffordance('about', ['home', 'settings', 'about'])).toBe(false);
    expect(shouldShowBackAffordance('showroom', ['home', 'showroom'])).toBe(false);
    expect(shouldShowBackAffordance('results', ['home', 'game-intro', 'game', 'results'])).toBe(false);
  });

  it('shows for stack-driven screens with no in-content control', () => {
    expect(shouldShowBackAffordance('game-intro', ['home', 'game-intro'])).toBe(true);
    expect(shouldShowBackAffordance('game', ['home', 'game-intro', 'game'])).toBe(true);
    expect(shouldShowBackAffordance('landing', ['home', 'landing'])).toBe(true);
  });

  it('shows on a cold-loaded single-entry non-home screen', () => {
    expect(shouldShowBackAffordance('game-intro', ['game-intro'])).toBe(true);
  });

  it('returns false for an unknown screen', () => {
    expect(shouldShowBackAffordance('bogus' as never, ['bogus'] as never)).toBe(false);
  });
});

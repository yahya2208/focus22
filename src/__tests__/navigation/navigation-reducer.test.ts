import { describe, it, expect } from 'vitest';
import { navigationReducer, initialState, isScreenName } from '../../store/navigation';
import type { AppState, ScreenName } from '../../store/navigation';

describe('navigationReducer — NavStack (Phase 1)', () => {
  it('NAVIGATE pushes the target onto the stack and switches the screen', () => {
    const state = navigationReducer(initialState, { type: 'NAVIGATE', screen: 'library' });
    expect(state.screen).toBe('library');
    expect(state.currentScreen).toBe('library');
    expect(state.navStack).toEqual(['home', 'library']);
  });

  it('NAVIGATE to the current top is a stack no-op but keeps the screen', () => {
    const mid = navigationReducer(initialState, { type: 'NAVIGATE', screen: 'library' });
    const again = navigationReducer(mid, { type: 'NAVIGATE', screen: 'library' });
    expect(again.screen).toBe('library');
    expect(again.navStack).toEqual(['home', 'library']);
  });

  it('REPLACE swaps the top without growing the stack', () => {
    const mid = navigationReducer(initialState, { type: 'NAVIGATE', screen: 'settings' });
    const replaced = navigationReducer(mid, { type: 'REPLACE', screen: 'about' });
    expect(replaced.screen).toBe('about');
    expect(replaced.currentScreen).toBe('about');
    expect(replaced.navStack).toEqual(['home', 'about']);
  });

  it('REPLACE on an empty stack seeds it with the target', () => {
    const state = navigationReducer(
      { ...initialState, navStack: [] },
      { type: 'REPLACE', screen: 'showroom' },
    );
    expect(state.navStack).toEqual(['showroom']);
    expect(state.screen).toBe('showroom');
  });

  it('BACK pops the stack to the previous screen', () => {
    const a = navigationReducer(initialState, { type: 'NAVIGATE', screen: 'settings' });
    const b = navigationReducer(a, { type: 'NAVIGATE', screen: 'about' });
    const back = navigationReducer(b, { type: 'BACK' });
    expect(back.screen).toBe('settings');
    expect(back.currentScreen).toBe('settings');
    expect(back.navStack).toEqual(['home', 'settings']);
  });

  it('BACK at the root stays on home', () => {
    const back = navigationReducer(initialState, { type: 'BACK' });
    expect(back.screen).toBe('home');
    expect(back.navStack).toEqual(['home']);
  });

  it('RESET clears the stack, intendedScreen and returns to home', () => {
    const a = navigationReducer(initialState, { type: 'NAVIGATE', screen: 'about' });
    const withIntent = navigationReducer(a, { type: 'SET_INTENDED_SCREEN', screen: 'showroom' });
    const reset = navigationReducer(withIntent, { type: 'RESET' });
    expect(reset.screen).toBe('home');
    expect(reset.navStack).toEqual(['home']);
    expect(reset.intendedScreen).toBeNull();
  });

  it('SET_INTENDED_SCREEN stores and clears the post-auth redirect target', () => {
    const withTarget = navigationReducer(initialState, { type: 'SET_INTENDED_SCREEN', screen: 'showroom' });
    expect(withTarget.intendedScreen).toBe('showroom');
    const cleared = navigationReducer(withTarget, { type: 'SET_INTENDED_SCREEN', screen: null });
    expect(cleared.intendedScreen).toBeNull();
  });

  it('START_QR_FLOW seeds the stack as home -> game-intro with attribution', () => {
    const state = navigationReducer(initialState, {
      type: 'START_QR_FLOW',
      campaignId: 'camp-1',
      placementId: 'place-1',
      qrId: 'qr-1',
    });
    expect(state.screen).toBe('game-intro');
    expect(state.currentScreen).toBe('game-intro');
    expect(state.isQrFlow).toBe(true);
    expect(state.campaignId).toBe('camp-1');
    expect(state.placementId).toBe('place-1');
    expect(state.navStack).toEqual(['home', 'game-intro']);
    expect(state.intendedScreen).toBeNull();
  });

  it('caps the stack at MAX_STACK_DEPTH (50) entries', () => {
    const cycle: ScreenName[] = ['settings', 'about', 'library', 'history', 'showroom'];
    let state: AppState = { ...initialState };
    for (let i = 0; i < 60; i++) {
      state = navigationReducer(state, { type: 'NAVIGATE', screen: cycle[i % cycle.length]! });
    }
    expect(state.navStack.length).toBe(50);
    expect(state.navStack[state.navStack.length - 1]).toBe('showroom');
  });

  it('existing reducer behaviors are preserved (no regression)', () => {
    const start = navigationReducer(initialState, {
      type: 'START_SESSION',
      sessionId: 's1',
      gameMode: 'focus',
    });
    expect(start.currentSession).toEqual({ id: 's1', gameMode: 'focus' });

    const withResults = navigationReducer(start, {
      type: 'SET_RESULTS',
      results: {
        rawRts: [100],
        correctedRts: [100],
        calibration: {
          refreshRate: 60,
          displayLagMs: 16.667,
          inputLagMs: 8,
          confidence: 0.5,
          platform: 'test',
          timestamp: 0,
        },
        totalRounds: 1,
        validRounds: 1,
      },
    });
    expect(withResults.results?.totalRounds).toBe(1);

    const saved = navigationReducer(withResults, { type: 'SAVE_SESSION' });
    expect(saved.sessions.length).toBe(1);
    expect(saved.currentSession).toBeTruthy();

    const savedDone = navigationReducer(saved, { type: 'SESSION_SAVED', sessionId: 's1' });
    expect(savedDone.currentSession).toBeNull();
  });
});

describe('isScreenName', () => {
  it('accepts known screens and rejects unknown strings', () => {
    expect(isScreenName('showroom')).toBe(true);
    expect(isScreenName('game-intro')).toBe(true);
    expect(isScreenName('phone-details')).toBe(false);
    expect(isScreenName('bogus')).toBe(false);
  });
});

describe('navigationReducer — Smart Back (Phase 2)', () => {
  it('BACK on a single-entry cold-loaded stack lands on home and re-seeds the stack', () => {
    const cold: AppState = { ...initialState, screen: 'showroom', currentScreen: 'showroom', navStack: ['showroom'] };
    const back = navigationReducer(cold, { type: 'BACK' });
    expect(back.screen).toBe('home');
    expect(back.navStack).toEqual(['home']);
  });

  it('BACK on an empty stack lands on home and re-seeds the stack', () => {
    const empty: AppState = { ...initialState, navStack: [] };
    const back = navigationReducer(empty, { type: 'BACK' });
    expect(back.screen).toBe('home');
    expect(back.navStack).toEqual(['home']);
  });

  it('RESET is non-destructive: preserves session/calibration/results state', () => {
    const profile = { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.9, platform: 'test', timestamp: 1 };
    const a = navigationReducer(initialState, { type: 'START_SESSION', sessionId: 's1', gameMode: 'focus' });
    const withCal = navigationReducer(a, { type: 'SET_CALIBRATION', profile });
    const withResults = navigationReducer(withCal, {
      type: 'SET_RESULTS',
      results: { rawRts: [200], correctedRts: [200], calibration: profile, totalRounds: 1, validRounds: 1 },
    });
    const withNav = navigationReducer(withResults, { type: 'NAVIGATE', screen: 'game-intro' });
    const reset = navigationReducer(withNav, { type: 'RESET' });

    expect(reset.screen).toBe('home');
    expect(reset.currentScreen).toBe('home');
    expect(reset.navStack).toEqual(['home']);
    expect(reset.currentSession).toEqual({ id: 's1', gameMode: 'focus' });
    expect(reset.calibrationProfile).toEqual(withCal.calibrationProfile);
    expect(reset.results).toEqual(withResults.results);
  });

  it('RESET clears the intended screen', () => {
    const withIntent = navigationReducer(initialState, { type: 'SET_INTENDED_SCREEN', screen: 'showroom' });
    expect(navigationReducer(withIntent, { type: 'RESET' }).intendedScreen).toBeNull();
  });
});


import { describe, it, expect } from 'vitest';
import { navigationReducer, initialState } from '../../store/navigation';

describe('navigationReducer — routeParams (Phase 3A)', () => {
  it('NAVIGATE stores the passed params on state', () => {
    const state = navigationReducer(initialState, {
      type: 'NAVIGATE',
      screen: 'repair-tracking',
      params: { code: 'R-42' },
    });
    expect(state.screen).toBe('repair-tracking');
    expect(state.routeParams).toEqual({ code: 'R-42' });
  });

  it('REPLACE stores the passed params on state', () => {
    const state = navigationReducer(initialState, {
      type: 'REPLACE',
      screen: 'repair-tracking',
      params: { code: 'R-7' },
    });
    expect(state.screen).toBe('repair-tracking');
    expect(state.routeParams).toEqual({ code: 'R-7' });
    expect(state.navStack).toEqual(['repair-tracking']);
  });

  it('NAVIGATE without params clears stale routeParams', () => {
    const withParams = navigationReducer(initialState, {
      type: 'NAVIGATE',
      screen: 'repair-tracking',
      params: { code: 'R-1' },
    });
    const cleared = navigationReducer(withParams, { type: 'NAVIGATE', screen: 'showroom' });
    expect(cleared.screen).toBe('showroom');
    expect(cleared.routeParams).toEqual({});
  });

  it('BACK clears routeParams', () => {
    const withParams = navigationReducer(initialState, {
      type: 'NAVIGATE',
      screen: 'repair-tracking',
      params: { code: 'R-9' },
    });
    const back = navigationReducer(withParams, { type: 'BACK' });
    expect(back.screen).toBe('home');
    expect(back.routeParams).toEqual({});
  });

  it('RESET clears routeParams', () => {
    const withParams = navigationReducer(initialState, {
      type: 'REPLACE',
      screen: 'repair-tracking',
      params: { code: 'R-3' },
    });
    const reset = navigationReducer(withParams, { type: 'RESET' });
    expect(reset.screen).toBe('home');
    expect(reset.routeParams).toEqual({});
  });

  it('params survive a subsequent NAVIGATE with params (per-screen params, not global)', () => {
    const first = navigationReducer(initialState, {
      type: 'NAVIGATE',
      screen: 'repair-tracking',
      params: { code: 'A' },
    });
    const second = navigationReducer(first, {
      type: 'NAVIGATE',
      screen: 'repair-tracking',
      params: { code: 'B' },
    });
    expect(second.routeParams).toEqual({ code: 'B' });
  });
});

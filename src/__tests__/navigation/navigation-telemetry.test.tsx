import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect, useRef } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import type { NavigationAction, ScreenName } from '../../store/navigation';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../core/telemetry', () => ({
  getGlobalTelemetry: () => ({ track }),
}));

function Probe({ onPress }: { onPress: (dispatch: (action: NavigationAction) => void) => void }) {
  const dispatch = useAppDispatch();
  return (
    <button type="button" onClick={() => onPress(dispatch)}>
      go
    </button>
  );
}

function ChainProbe({ steps }: { steps: Partial<Record<ScreenName, NavigationAction>> }) {
  const dispatch = useAppDispatch();
  const { screen } = useAppState();
  const fired = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (fired.current.has(screen)) return;
    const action = steps[screen];
    if (action) {
      fired.current.add(screen);
      dispatch(action);
    }
  }, [screen, dispatch, steps]);
  return null;
}

function renderProbe(onPress: (dispatch: (action: NavigationAction) => void) => void) {
  render(
    <AppProvider>
      <Probe onPress={onPress} />
    </AppProvider>,
  );
}

function renderChain(steps: Partial<Record<ScreenName, NavigationAction>>) {
  render(
    <AppProvider>
      <ChainProbe steps={steps} />
    </AppProvider>,
  );
}

beforeEach(() => {
  track.mockClear();
});

describe('navigation analytics events (Phase 1)', () => {
  it('NAVIGATE emits navigation_push + screen_view', () => {
    renderProbe((d) => d({ type: 'NAVIGATE', screen: 'settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(track).toHaveBeenCalledWith('navigation_push', { from: 'home', to: 'settings' });
    expect(track).toHaveBeenCalledWith('screen_view', { screen: 'settings' });
  });

  it('NAVIGATE to the same screen emits no push event (no-op)', () => {
    renderProbe((d) => d({ type: 'NAVIGATE', screen: 'home' }));
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(track).not.toHaveBeenCalledWith('navigation_push', expect.anything());
    expect(track).not.toHaveBeenCalledWith('screen_view', { screen: 'home' });
  });

  it('REPLACE emits navigation_replace + screen_view', () => {
    renderProbe((d) => d({ type: 'REPLACE', screen: 'showroom' }));
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(track).toHaveBeenCalledWith('navigation_replace', { from: 'home', to: 'showroom' });
    expect(track).toHaveBeenCalledWith('screen_view', { screen: 'showroom' });
  });

  it('BACK emits navigation_pop + screen_view for the popped target', async () => {
    renderChain({
      home: { type: 'NAVIGATE', screen: 'settings' },
      settings: { type: 'NAVIGATE', screen: 'about' },
      about: { type: 'BACK' },
    });
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('navigation_pop', { from: 'about', to: 'settings' }),
    );
    expect(track).toHaveBeenCalledWith('screen_view', { screen: 'settings' });
  });

  it('RESET from a non-home screen emits screen_view(home) only', async () => {
    renderChain({
      home: { type: 'NAVIGATE', screen: 'library' },
      library: { type: 'RESET' },
    });
    await waitFor(() => expect(track).toHaveBeenCalledWith('screen_view', { screen: 'home' }));
    expect(track.mock.calls.some(([type]) => type === 'navigation_push')).toBe(true);
  });

  it('START_QR_FLOW emits screen_view(game-intro, via qr)', () => {
    renderProbe((d) => d({ type: 'START_QR_FLOW' }));
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(track).toHaveBeenCalledWith('screen_view', { screen: 'game-intro', via: 'qr' });
  });

  it('mount emits an initial screen_view(home, via initial)', () => {
    renderProbe(() => {});
    expect(track).toHaveBeenCalledWith('screen_view', { screen: 'home', via: 'initial' });
  });
});

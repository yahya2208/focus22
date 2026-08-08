import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { AppProvider, useAppState, useAppDispatch } from '../../store/navigation';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ThemeProvider } from '../../design-system/use-theme';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';

function StateProbe() {
  const { screen, routeParams } = useAppState();
  return <div data-testid="state-probe">screen={screen}|params={JSON.stringify(routeParams)}</div>;
}

function DeepStateDriver() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'START_SESSION', sessionId: 'sess-1', gameMode: 'classic' });
    // Mirrors production InitialRoute: only enter the throwing screen when the
    // URL still asks for it. The boundary's reset normalizes the URL to
    // `#/home`, so the remounted tree boots at home instead of re-entering it.
    if (window.location.hash.includes('game-intro')) {
      dispatch({ type: 'NAVIGATE', screen: 'game-intro', params: { ref: 'ST-000001' } });
    }
  }, [dispatch]);
  return null;
}

function GoToGameIntro() {
  const dispatch = useAppDispatch();
  return (
    <button data-testid="goto-game-intro" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'game-intro', params: { ref: 'ST-000001' } })}>
      go
    </button>
  );
}

let throwAttempts = 0;

function ThrowingScreen() {
  const { screen } = useAppState();
  if (screen === 'home') return <div data-testid="home-rendered">home</div>;
  if (screen === 'game-intro') {
    throwAttempts += 1;
    throw new Error('boom');
  }
  return <div>{screen}</div>;
}

function silenceReactErrorLogging() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => spy.mockRestore();
}

describe('ErrorBoundary in-app reset (Phase 3A) — no loop, no double reset, no session loss', () => {
  let bridge: typeof import('../../core/navigation/error-reset');
  let resetCalls: number;

  beforeEach(async () => {
    throwAttempts = 0;
    bridge = await import('../../core/navigation/error-reset');
    resetCalls = 0;
    const realRequestInAppReset = bridge.requestInAppReset;
    vi.spyOn(bridge, 'requestInAppReset').mockImplementation(() => {
      resetCalls += 1;
      return realRequestInAppReset();
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('recovers to a fresh home state with exactly one reset per click, no loop, URL normalized', async () => {
    const restoreConsole = silenceReactErrorLogging();
    window.history.replaceState({}, '', '#/game-intro?ref=ST-000001');

    render(
      <ErrorBoundary>
        <AppProvider>
          <ThemeProvider>
            <TranslationProvider>
              <DeepStateDriver />
              <ThrowingScreen />
              <StateProbe />
            </TranslationProvider>
          </ThemeProvider>
        </AppProvider>
      </ErrorBoundary>,
    );

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toBeTruthy();
    expect(throwAttempts).toBeGreaterThanOrEqual(1);
    const caughtCount = throwAttempts;
    await new Promise((r) => setTimeout(r, 60));
    expect(throwAttempts).toBe(caughtCount);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByTestId('home-rendered')).toBeTruthy();
    });

    expect(resetCalls).toBe(1);
    expect(throwAttempts).toBe(caughtCount);
    const probe = screen.getByTestId('state-probe').textContent!;
    expect(probe).toContain('screen=home');
    expect(probe).toContain('params={}');
    expect(window.location.hash).toBe('#/home');
    restoreConsole();
  });

  it('a second error resolves again with exactly one reset per retry (no double firing)', async () => {
    const restoreConsole = silenceReactErrorLogging();
    window.history.replaceState({}, '', '#/game-intro?ref=ST-000001');

    render(
      <ErrorBoundary>
        <AppProvider>
          <ThemeProvider>
            <TranslationProvider>
              <DeepStateDriver />
              <GoToGameIntro />
              <ThrowingScreen />
            </TranslationProvider>
          </ThemeProvider>
        </AppProvider>
      </ErrorBoundary>,
    );

    await waitFor(() => screen.getByRole('alert'));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByTestId('home-rendered')).toBeTruthy();
    });
    expect(resetCalls).toBe(1);

    fireEvent.click(screen.getByTestId('goto-game-intro'));
    await waitFor(() => screen.getByRole('alert'));
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByTestId('home-rendered')).toBeTruthy();
    });
    expect(resetCalls).toBe(2);
    expect(window.location.hash).toBe('#/home');
    restoreConsole();
  });

  it('storage-backed data (settings) survives the in-app reset', async () => {
    const restoreConsole = silenceReactErrorLogging();
    localStorage.setItem('focus_settings', JSON.stringify({ theme: 'dark', language: 'ar' }));
    window.history.replaceState({}, '', '#/game-intro?ref=ST-000001');

    render(
      <ErrorBoundary>
        <AppProvider>
          <ThemeProvider>
            <TranslationProvider>
              <DeepStateDriver />
              <ThrowingScreen />
            </TranslationProvider>
          </ThemeProvider>
        </AppProvider>
      </ErrorBoundary>,
    );

    await waitFor(() => screen.getByRole('alert'));
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByTestId('home-rendered')).toBeTruthy();
    });
    const stored = localStorage.getItem('focus_settings');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toMatchObject({ theme: 'dark', language: 'ar' });
    localStorage.removeItem('focus_settings');
    restoreConsole();
  });
});

describe('ErrorBoundary last-resort reload (no handlers registered)', () => {
  it('falls back to a full reload exactly once when no in-app reset handler exists', async () => {
    const restoreConsole = silenceReactErrorLogging();
    const bridge = await import('../../core/navigation/error-reset');

    let requestCalls = 0;
    vi.spyOn(bridge, 'requestInAppReset').mockImplementation(() => {
      requestCalls += 1;
      return false;
    });

    const realLocation = window.location;
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...realLocation, reload },
    });

    try {
      function Throws(): React.ReactNode {
        throw new Error('boom');
      }

      render(
        <ErrorBoundary>
          <Throws />
        </ErrorBoundary>,
      );

      await waitFor(() => screen.getByRole('alert'));

      fireEvent.click(screen.getByRole('button'));
      expect(requestCalls).toBe(1);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: realLocation,
      });
    }
    restoreConsole();
  });
});

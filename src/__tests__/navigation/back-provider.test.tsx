import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { BackProvider, useBack, useBackOverlay, useBackGuard } from '../../core/navigation/BackProvider';
import { BackButton } from '../../components/navigation/BackButton';

function NavProbe() {
  const dispatch = useAppDispatch();
  return (
    <>
      <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}>
        to-settings
      </button>
      <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'about' })}>
        to-about
      </button>
    </>
  );
}

function ScreenProbe() {
  const { screen, navStack } = useAppState();
  return (
    <div data-testid="screen">
      {screen}:{navStack.join('>')}
    </div>
  );
}

function OverlayProbe() {
  const [open, setOpen] = useState(false);
  useBackOverlay({
    kind: 'dialog',
    screen: 'settings',
    isOpen: () => open,
    close: () => {
      setOpen(false);
      return true;
    },
  });
  return (
    <button type="button" onClick={() => setOpen(true)}>
      open-dialog
    </button>
  );
}

function GuardProbe() {
  useBackGuard({
    screen: 'settings',
    beforeBack: () => false,
  });
  return null;
}

function renderApp(children: React.ReactNode = <NavProbe />) {
  return render(
    <AppProvider>
      <BackProvider>{children}</BackProvider>
    </AppProvider>,
  );
}

function pop() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('BackProvider (Phase 2) — integration', () => {
  it('mounts an anchor history entry under the current screen', () => {
    renderApp(<ScreenProbe />);
    expect(window.location.hash).toBe('#/home');
  });

  it('popstate navigates back one screen via BACK (Browser Back)', async () => {
    renderApp(
      <>
        <NavProbe />
        <ScreenProbe />
      </>,
    );
    fireEvent.click(screen.getByText('to-settings'));
    fireEvent.click(screen.getByText('to-about'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('about:home>settings>about'));

    pop();
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('settings:home>settings'));
  });

  it('useBack() triggers the same popstate back() policy', async () => {
    function BackBtn() {
      const back = useBack();
      return (
        <button type="button" onClick={back}>
          programmatic-back
        </button>
      );
    }
    renderApp(
      <>
        <NavProbe />
        <ScreenProbe />
        <BackBtn />
      </>,
    );
    fireEvent.click(screen.getByText('to-settings'));
    fireEvent.click(screen.getByText('to-about'));
    fireEvent.click(screen.getByText('programmatic-back'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('settings:home>settings'));
  });

  it('an open overlay is closed before the stack pops', async () => {
    renderApp(
      <>
        <NavProbe />
        <OverlayProbe />
        <ScreenProbe />
      </>,
    );
    fireEvent.click(screen.getByText('to-settings'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('settings:home>settings'));
    fireEvent.click(screen.getByText('open-dialog'));

    pop();
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('settings:home>settings'));
  });

  it('a blocking guard emits back_blocked and does not navigate', async () => {
    renderApp(
      <>
        <NavProbe />
        <GuardProbe />
        <ScreenProbe />
      </>,
    );
    fireEvent.click(screen.getByText('to-settings'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('settings:home>settings'));

    pop();
    expect(screen.getByTestId('screen').textContent).toBe('settings:home>settings');
  });

  it('first back on home arms the double-exit toast', async () => {
    renderApp(<ScreenProbe />);
    pop();
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('second back within the window calls window.close', async () => {
    const closeSpy = vi.fn();
    Object.defineProperty(window, 'close', { value: closeSpy, writable: true, configurable: true });
    renderApp(<ScreenProbe />);

    pop();
    await screen.findByRole('status');
    pop();

    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it('re-anchors the URL after a double-exit-first press (no navigation)', async () => {
    renderApp(<ScreenProbe />);
    expect(window.location.hash).toBe('#/home');
    pop();
    await waitFor(() => expect(window.location.hash).toBe('#/home'));
  });

  it('cold-load single-entry deep link back lands on home', async () => {
    function DeepLinkProbe() {
      const dispatch = useAppDispatch();
      return (
        <button type="button" onClick={() => dispatch({ type: 'REPLACE', screen: 'showroom' })}>
          deep-link
        </button>
      );
    }
    window.history.replaceState({}, '', '#/showroom');
    renderApp(
      <>
        <DeepLinkProbe />
        <ScreenProbe />
      </>,
    );
    // Simulate InitialRoute: cold-load deep link REPLACEs into the stack.
    fireEvent.click(screen.getByText('deep-link'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('showroom:showroom'));

    pop();
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('home:home'));
  });

  it('BackButton renders only when the affordance applies', async () => {
    function AffordanceProbe() {
      const dispatch = useAppDispatch();
      return (
        <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'game-intro' })}>
          to-game-intro
        </button>
      );
    }
    renderApp(
      <>
        <BackButton />
        <AffordanceProbe />
        <ScreenProbe />
      </>,
    );

    expect(screen.queryByRole('button', { name: 'back.title' })).toBeNull();
    fireEvent.click(screen.getByText('to-game-intro'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'back.title' })).toBeTruthy(),
    );
  });

  it('BackButton triggers the same back policy when clicked', async () => {
    function AffordanceProbe() {
      const dispatch = useAppDispatch();
      return (
        <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'game-intro' })}>
          to-game-intro
        </button>
      );
    }
    renderApp(
      <>
        <BackButton />
        <AffordanceProbe />
        <ScreenProbe />
      </>,
    );
    fireEvent.click(screen.getByText('to-game-intro'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'back.title' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'back.title' }));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('home:home'));
  });
});

describe('BackProvider — screen flows (Phase 2)', () => {
  it('Login → Register → Back returns to login', async () => {
    function FlowProbe() {
      const dispatch = useAppDispatch();
      const { screen } = useAppState();
      return (
        <>
          <div data-testid="screen">{screen}</div>
          <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}>
            to-login
          </button>
          <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'register' })}>
            to-register
          </button>
        </>
      );
    }
    renderApp(<FlowProbe />);
    fireEvent.click(screen.getByText('to-login'));
    fireEvent.click(screen.getByText('to-register'));
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('register'));

    pop();
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('login'));
  });
});

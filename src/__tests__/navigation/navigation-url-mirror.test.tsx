import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import type { ScreenName } from '../../store/navigation';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

function Probe({ to }: { to: ScreenName }) {
  const dispatch = useAppDispatch();
  return (
    <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: to })}>
      go
    </button>
  );
}

describe('URL mirror round-trip (Phase 1)', () => {
  it('writes the current screen to the hash on NAVIGATE', async () => {
    render(
      <AppProvider>
        <Probe to="settings" />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => expect(window.location.hash).toBe('#/settings'));
  });

  it('cold load with a #/screen deep link REPLACEs to that screen', async () => {
    window.history.pushState({}, '', '#/showroom');
    render(
      <Suspense fallback={<div>Loading...</div>}>
        <App />
      </Suspense>,
    );
    expect(await screen.findByRole('heading', { name: 'Used Phones Showroom' }, { timeout: 15000 })).toBeTruthy();
  });
});

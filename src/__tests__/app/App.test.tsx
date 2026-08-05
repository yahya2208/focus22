import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';

function renderApp() {
  return render(<Suspense fallback={<div>Loading...</div>}><App /></Suspense>);
}
describe('App', () => {
  const TEST_TIMEOUT = 20000;

  it('should render the home screen by default', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
    }, { timeout: 5000 });
    const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);

  it('should render all home screen buttons', async () => {
    renderApp();
    const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    const menuButtons = await screen.findAllByRole('button', { name: 'Menu' });
    expect(menuButtons.length).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);

  describe('QR deep-link flow fires once per app load (launch-blocker fix)', () => {
    afterEach(() => {
      window.history.replaceState({}, '', '/');
    });

    it('starts the game from a QR deep link, and returning home does not auto-restart it', async () => {
      window.history.pushState({}, '', '/?campaign=test-campaign&source=qr');
      renderApp();

      // 1. QR params in the URL are detected once -> game-intro appears.
      expect(await screen.findByText('Test Your Focus', {}, { timeout: 15000 })).toBeTruthy();

      // 2. game-intro auto-advances into the game.
      const stopButton = await screen.findByRole('button', { name: /Stop Test/ }, { timeout: 15000 });

      // 3. User stops the test -> returns home (this is where the bug used to restart the game).
      fireEvent.click(stopButton);
      const confirmStop = await screen.findByRole('button', { name: /Yes, Stop/ }, { timeout: 10000 });
      fireEvent.click(confirmStop);

      // 4. Home is shown again.
      const homeButtons = await screen.findAllByRole('button', { name: '▶ Start Test' }, { timeout: 10000 });
      expect(homeButtons.length).toBeGreaterThanOrEqual(1);

      // 5. No auto-restart while the URL still carries QR params.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      expect(screen.queryByText('Test Your Focus')).toBeNull();
      expect(screen.queryByRole('button', { name: /Stop Test/ })).toBeNull();
      expect((await screen.findAllByRole('button', { name: '▶ Start Test' })).length).toBeGreaterThanOrEqual(1);
    }, 30000);
  });
});

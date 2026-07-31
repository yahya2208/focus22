import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';

function renderApp() {
  return render(<Suspense fallback={<div>Loading...</div>}><App /></Suspense>);
}

describe('App', () => {
  it('should render the home screen by default', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
    });
    const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('should render all home screen buttons', async () => {
    renderApp();
    const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    });
  });
});

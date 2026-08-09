import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';

vi.mock('../../services/campaign-lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/campaign-lookup')>();
  return {
    ...actual,
    lookupCampaign: vi.fn(async (code: string) => {
      if (code === 'ZZZZZZ') return null;
      return {
        id: '00000000-0000-4000-8000-000000000000',
        shortCode: code,
        name: 'Test Campaign',
      };
    }),
  };
});

function renderApp() {
  return render(<Suspense fallback={<div>Loading...</div>}><App /></Suspense>);
}

describe('QR entry routing (Phase B)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('13: valid /c/ABC123 routes to game-intro', async () => {
    window.history.pushState({}, '', '/c/ABC123');
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Game intro' }, { timeout: 5000 })).toBeTruthy();
  });

  it('14: invalid /c/ABC12 stays on the normal route', async () => {
    window.history.pushState({}, '', '/c/ABC12');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
  });

  it('15: ?campaign= query remains ignored', async () => {
    window.history.pushState({}, '', '/?campaign=summer');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
    expect(screen.queryByText('Start Assessment')).toBeNull();
  });

  it('16: ?source= query remains ignored', async () => {
    window.history.pushState({}, '', '/?source=qr');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
  });

  it('17: ?ref= query remains ignored', async () => {
    window.history.pushState({}, '', '/?ref=x');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
  });

  it('18: /focus22/c/ABC123 (GitHub Pages base path) routes to game-intro', async () => {
    window.history.pushState({}, '', '/focus22/c/ABC123');
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Game intro' }, { timeout: 5000 })).toBeTruthy();
  });

  it('19: /focus22/?/c/ABC123 (GitHub Pages encoded fallback) routes to game-intro', async () => {
    window.history.pushState({}, '', '/focus22/?/c/ABC123');
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Game intro' }, { timeout: 5000 })).toBeTruthy();
  });

  it('20: /c/ZZZZZZ (valid format, no campaign) safely returns home', async () => {
    window.history.pushState({}, '', '/c/ZZZZZZ');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
  });

  it('21: /focus22/?campaign=ABC123 (base path) stays ignored', async () => {
    window.history.pushState({}, '', '/focus22/?campaign=ABC123');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
  });
});

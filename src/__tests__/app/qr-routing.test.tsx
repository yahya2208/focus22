import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';
import type { CampaignEntry } from '../../services/campaign-lookup';

const mocks = vi.hoisted(() => ({
  lookupCampaign: vi.fn(async (code: string): Promise<CampaignEntry | null> => {
    if (code === 'ZZZZZZ') return null;
    return {
      id: '00000000-0000-4000-8000-000000000000',
      shortCode: code,
      name: 'Test Campaign',
      challengeId: null,
    };
  }),
}));

vi.mock('../../services/campaign-lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/campaign-lookup')>();
  return {
    ...actual,
    lookupCampaign: mocks.lookupCampaign,
  };
});

// The measurement sender is fire-and-forget; in routing tests it is mocked so
// no real Supabase call is attempted, while still proving the call site fires.
const qrMeasurementMock = vi.hoisted(() => ({
  recordScan: vi.fn(),
  recordFunnel: vi.fn(),
  getActiveCampaignId: vi.fn(() => null),
  setQrMeasurementSenderEnabled: vi.fn(),
  resetQrMeasurementForTests: vi.fn(),
}));

vi.mock('../../services/qr-measurement', () => qrMeasurementMock);

function renderApp() {
  return render(<Suspense fallback={<div>Loading...</div>}><App /></Suspense>);
}

describe('QR entry routing (Phase B)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    qrMeasurementMock.recordScan.mockClear();
    qrMeasurementMock.recordFunnel.mockClear();
    qrMeasurementMock.getActiveCampaignId.mockReturnValue(null);
  });

  it('13: valid /c/ABC123 routes to game-intro', async () => {
    window.history.pushState({}, '', '/c/ABC123');
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Game intro' }, { timeout: 5000 })).toBeTruthy();
    expect(qrMeasurementMock.recordScan).toHaveBeenCalledWith('ABC123');
  });

  it('14: invalid /c/ABC12 stays on the normal route', async () => {
    window.history.pushState({}, '', '/c/ABC12');
    renderApp();
    await screen.findByRole('main', { name: 'Main navigation' }, { timeout: 5000 });
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

  it('challenge-linked campaign QR does NOT route to game-intro', async () => {
    mocks.lookupCampaign.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000000',
      shortCode: 'ABC123',
      name: 'Test Campaign',
      challengeId: 'uuid-ch-01',
    });
    window.history.pushState({}, '', '/c/ABC123');
    renderApp();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.queryByRole('navigation', { name: 'Game intro' })).toBeNull();
    expect(qrMeasurementMock.recordScan).toHaveBeenCalledWith('ABC123');
  });

  it('regular campaign QR (no challengeId) still routes to game-intro', async () => {
    mocks.lookupCampaign.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000000',
      shortCode: 'ABC123',
      name: 'Test Campaign',
      challengeId: null,
    });
    window.history.pushState({}, '', '/c/ABC123');
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Game intro' }, { timeout: 5000 })).toBeTruthy();
  });
});

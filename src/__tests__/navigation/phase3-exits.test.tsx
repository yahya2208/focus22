import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { AppProvider, useAppState, useAppDispatch } from '../../store/navigation';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ThemeProvider } from '../../design-system/use-theme';
import { StickerScanHandler } from '../../screens/stickers/StickerScanHandler';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../core/telemetry', () => ({
  getGlobalTelemetry: () => ({ track, setCampaignId: vi.fn(), setPlacementId: vi.fn(), flush: vi.fn() }),
}));

vi.mock('../../services/sticker/sticker-database', () => ({
  logScanWithMetadata: vi.fn().mockResolvedValue(undefined),
}));

function ScreenProbe() {
  const { screen } = useAppState();
  return <div data-testid="screen-probe">{screen}</div>;
}

function EnterStickerScan() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'REPLACE', screen: 'sticker-scan' });
  }, [dispatch]);
  return null;
}

describe('Phase 3A exits — StickerScanHandler continues via SPA navigation', () => {
  beforeEach(() => {
    track.mockClear();
    window.history.replaceState({}, '', '/?s=ST-000001');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('Continue dispatches REPLACE home instead of window.location.href', async () => {
    render(
      <AppProvider>
        <ThemeProvider>
          <TranslationProvider>
            <EnterStickerScan />
            <StickerScanHandler />
            <ScreenProbe />
          </TranslationProvider>
        </ThemeProvider>
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('screen-probe').textContent).toBe('sticker-scan');
    });

    const continueBtn = await waitFor(() => screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByTestId('screen-probe').textContent).toBe('home');
    });
    expect(window.location.pathname + window.location.search).toBe('/?s=ST-000001');
  });
});

describe('Phase 3A exits — whatsapp-service emits exit_attempt/exit_confirmed', () => {
  beforeEach(() => {
    track.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('openWhatsApp tracks exit_attempt then exit_confirmed (intentional exit)', async () => {
    const { openWhatsApp } = await import('../../services/whatsapp-service');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);

    openWhatsApp('05562554007', 'hello');

    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toContain('exit_attempt');
    expect(events).toContain('exit_confirmed');
    const confirmed = track.mock.calls.find((c) => c[0] === 'exit_confirmed')!;
    expect(confirmed[1]).toMatchObject({ target: 'whatsapp' });
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('tracked as same_tab when the popup is blocked', async () => {
    const { openWhatsApp } = await import('../../services/whatsapp-service');
    vi.spyOn(window, 'open').mockReturnValue(null);

    const realLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    });
    try {
      openWhatsApp('05562554007', 'hello');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: realLocation,
      });
    }

    const confirmed = track.mock.calls.find((c) => c[0] === 'exit_confirmed')!;
    expect(confirmed[1]).toMatchObject({ target: 'whatsapp', same_tab: true });
    vi.restoreAllMocks();
  });
});

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

const exitEventNames = ['exit_attempt', 'exit_confirmed'];

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

describe('Phase 3A exit telemetry — events are exact, single-fire, and never internal', () => {
  beforeEach(() => {
    track.mockClear();
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
    window.history.replaceState({}, '', '/?s=ST-000001');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('openWhatsApp emits exactly [exit_attempt, exit_confirmed] with no duplicates', async () => {
    const { openWhatsApp } = await import('../../services/whatsapp-service');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);

    openWhatsApp('05562554007', 'hello');

    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toEqual(['exit_attempt', 'exit_confirmed']);
    expect(track).toHaveBeenCalledTimes(2);
    openSpy.mockRestore();
  });

  it('an analytics event on openWhatsApp adds exactly one business event, still no dupes', async () => {
    const { openWhatsApp } = await import('../../services/whatsapp-service');
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

    openWhatsApp('05562554007', 'hello', 'repair_requested');

    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toEqual(['repair_requested', 'exit_attempt', 'exit_confirmed']);
    expect(track).toHaveBeenCalledTimes(3);
  });

  it('two separate exits produce two separate attempt/confirmed pairs, never merged', async () => {
    const { openWhatsApp } = await import('../../services/whatsapp-service');
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

    openWhatsApp('05562554007', 'hello');
    openWhatsApp('05562554007', 'hello again');

    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toEqual([
      'exit_attempt', 'exit_confirmed',
      'exit_attempt', 'exit_confirmed',
    ]);
    expect(track).toHaveBeenCalledTimes(4);
  });

  it('internal SPA navigation emits ZERO exit events', async () => {
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

    const events = track.mock.calls.map((c) => c[0]);
    expect(events.some((e) => exitEventNames.includes(e))).toBe(false);
    expect(track).toHaveBeenCalled();
  });
});

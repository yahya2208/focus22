import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { AppProvider, useAppState, useAppDispatch } from '../../store/navigation';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ThemeProvider } from '../../design-system/use-theme';
import { StickerScanHandler } from '../../screens/stickers/StickerScanHandler';

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

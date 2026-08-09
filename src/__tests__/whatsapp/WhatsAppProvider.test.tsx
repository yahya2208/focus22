import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { WhatsAppProvider, useWhatsApp } from '../../providers/WhatsAppProvider';
import { WHATSAPP_GUARD_TIMEOUT_MS } from '../../hooks/useSmartWhatsApp';

const writeTextMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

let capturedHref: string | null = null;
const originalLocation = window.location;

function stubLocation() {
  capturedHref = null;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() { return capturedHref ?? ''; },
      set href(v: string) { capturedHref = v; },
    },
  });
}

function Probe() {
  const whatsapp = useWhatsApp();
  return (
    <button type="button" onClick={() => whatsapp.send('مرحبا', { action: 'buy', deviceId: 'd1' })}>
      send
    </button>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <TranslationProvider>
        <WhatsAppProvider>
          <Probe />
        </WhatsAppProvider>
      </TranslationProvider>
    </ThemeProvider>,
  );
}

describe('V-2 (F-101) — WhatsAppProvider canonical handoff (same-tab + guard + fallback + retry + copy)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeTextMock.mockClear();
    stubLocation();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: writeTextMock } });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  });

  it('successful handoff: sends wa.me in the SAME tab via location.href — no window.open, no new tab', () => {
    const openSpy = vi.spyOn(window, 'open');
    renderProvider();
    fireEvent.click(screen.getByText('send'));
    expect(capturedHref).toContain('https://wa.me/213556254007?text=');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('blocked/failed launch exposes the fallback modal with the message', () => {
    renderProvider();
    fireEvent.click(screen.getByText('send'));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('مرحبا')).toBeTruthy();
  });

  it('page actually leaves during the guard → no fallback', () => {
    renderProvider();
    fireEvent.click(screen.getByText('send'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS + 100);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('retry from the fallback modal re-attempts the same-tab open', () => {
    renderProvider();
    fireEvent.click(screen.getByText('send'));
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();

    const before = capturedHref;
    fireEvent.click(document.querySelector('[data-action="retry-open"]') as HTMLButtonElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(capturedHref).toContain('https://wa.me/213556254007?text=');
    expect(capturedHref).toBe(before);
  });

  it('copy from the fallback modal copies the exact message to the clipboard', async () => {
    renderProvider();
    fireEvent.click(screen.getByText('send'));
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    fireEvent.click(document.querySelector('[data-action="copy-message"]') as HTMLButtonElement);
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeTextMock).toHaveBeenCalledWith('مرحبا');
    expect(screen.getByText(/Copied!/)).toBeTruthy();
  });
});

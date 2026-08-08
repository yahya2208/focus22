import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { useSmartWhatsApp, WHATSAPP_GUARD_TIMEOUT_MS } from '../../hooks/useSmartWhatsApp';

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
  const api = useSmartWhatsApp();
  return (
    <div>
      <button onClick={() => api.send('مرحبا', { action: 'buy', deviceId: 'd1' })}>send</button>
      <button onClick={() => api.copyMessage()}>copy</button>
      {api.modal && <div data-testid="modal">{api.modal.message}</div>}
    </div>
  );
}

describe('Phase 3B §9.2 — useSmartWhatsApp same-tab + guard + fallback', () => {
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
    vi.restoreAllMocks();
  });

  it('opens wa.me in the SAME tab via location.href — no window.open, no new tab', () => {
    const openSpy = vi.spyOn(window, 'open');
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    expect(capturedHref).toContain('https://wa.me/213556254007?text=');
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('guard times out without pagehide → fallback modal', () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    expect(screen.queryByTestId('modal')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    expect(screen.getByTestId('modal').textContent).toBe('مرحبا');
  });

  it('page actually leaves during the guard → no fallback', () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS + 100);
    });
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('copy in the fallback modal copies the message', async () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    fireEvent.click(screen.getByText('copy'));
    await act(async () => { await Promise.resolve(); });
    expect(writeTextMock).toHaveBeenCalledWith('مرحبا');
  });
});

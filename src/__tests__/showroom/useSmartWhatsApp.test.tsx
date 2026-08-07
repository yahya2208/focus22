import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { useSmartWhatsApp, WHATSAPP_GUARD_TIMEOUT_MS } from '../../hooks/useSmartWhatsApp';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../core/telemetry', () => ({
  getGlobalTelemetry: () => ({ track, setCampaignId: vi.fn(), setPlacementId: vi.fn(), flush: vi.fn() }),
}));

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
    track.mockClear();
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

  it('guard times out without pagehide → fallback modal + whatsapp_fallback_shown', () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    expect(screen.queryByTestId('modal')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    expect(screen.getByTestId('modal').textContent).toBe('مرحبا');
    expect(track).toHaveBeenCalledWith('whatsapp_fallback_shown', { action: 'buy', deviceId: 'd1' });
  });

  it('page actually leaves during the guard → whatsapp_sent + exit_confirmed, no fallback', () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS + 100);
    });
    expect(screen.queryByTestId('modal')).toBeNull();
    expect(track).toHaveBeenCalledWith('whatsapp_sent', { action: 'buy', deviceId: 'd1' });
    expect(track).toHaveBeenCalledWith('exit_confirmed', { target: 'whatsapp' });
    expect(track).not.toHaveBeenCalledWith('whatsapp_fallback_shown', expect.anything());
  });

  it('sends exactly one exit_attempt per send (no duplication)', () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    const attempts = track.mock.calls.filter((c) => c[0] === 'exit_attempt');
    expect(attempts).toHaveLength(1);
  });

  it('copy in the fallback modal copies the message + whatsapp_message_copied', async () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('send'));
    act(() => {
      vi.advanceTimersByTime(WHATSAPP_GUARD_TIMEOUT_MS);
    });
    fireEvent.click(screen.getByText('copy'));
    await act(async () => { await Promise.resolve(); });
    expect(writeTextMock).toHaveBeenCalledWith('مرحبا');
    expect(track).toHaveBeenCalledWith('whatsapp_message_copied', { action: 'buy', deviceId: 'd1' });
  });
});

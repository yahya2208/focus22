import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useScrollPreservation } from '../../hooks/useScrollPreservation';
import { resetShowroomUiState, showroomUiState } from '../../hooks/useShowroomState';

function Probe() {
  useScrollPreservation();
  return <div />;
}

function ProbeReady({ devices }: { devices: number }) {
  useScrollPreservation(devices > 0);
  return <div />;
}

describe('Phase 3B §6/§8.1 — useScrollPreservation', () => {
  const scrollTo = vi.fn();
  const originalScrollTo = window.scrollTo;
  let currentScrollY = 0;

  beforeEach(() => {
    resetShowroomUiState();
    currentScrollY = 0;
    window.history.replaceState(null, '', '#/showroom');
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => currentScrollY });
    window.scrollTo = ((options?: ScrollToOptions) => {
      if (typeof options === 'object' && options !== null && typeof options.top === 'number') {
        currentScrollY = options.top;
      }
    }) as unknown as typeof window.scrollTo;
    scrollTo.mockClear();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollTo.mockImplementation(((options?: ScrollToOptions) => {
      if (typeof options === 'object' && options !== null && typeof options.top === 'number') {
        currentScrollY = options.top;
      }
    }) as unknown as typeof window.scrollTo);
  });

  afterEach(() => {
    window.scrollTo = originalScrollTo;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 0 });
    vi.restoreAllMocks();
  });

  it('restores the saved scroll position once after mount (BACK)', async () => {
    showroomUiState.scrollY = 432;
    const { unmount } = render(<Probe />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(scrollTo).toHaveBeenCalledWith({ top: 432, left: 0, behavior: 'auto' });
    expect(showroomUiState.scrollY).toBe(432);
    unmount();
  });

  it('does not restore when there is no saved entry (fresh cold load)', async () => {
    render(<Probe />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('tracks scroll while mounted and keeps the registry current (survives content-swap clamp)', async () => {
    const { unmount } = render(<Probe />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    currentScrollY = 777;
    window.dispatchEvent(new Event('scroll'));
    expect(showroomUiState.scrollY).toBe(777);
    unmount();
    window.dispatchEvent(new Event('scroll'));
    expect(showroomUiState.scrollY).toBe(777);
  });

  it('keeps the saved position across a BACK remount even if phantom scroll events fire before restore', async () => {
    showroomUiState.scrollY = 432;
    const { unmount } = render(<Probe />);
    currentScrollY = 46;
    window.dispatchEvent(new Event('scroll'));
    currentScrollY = 0;
    window.dispatchEvent(new Event('scroll'));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(scrollTo).toHaveBeenCalledWith({ top: 432, left: 0, behavior: 'auto' });
    expect(showroomUiState.scrollY).toBe(432);
    unmount();
  });

  it('ignores transition-clamp scroll events fired after the route left #/showroom', async () => {
    const { unmount } = render(<Probe />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    currentScrollY = 500;
    window.dispatchEvent(new Event('scroll'));
    expect(showroomUiState.scrollY).toBe(500);
    window.history.replaceState(null, '', '#/phone-details?device=d-1');
    currentScrollY = 46.4;
    window.dispatchEvent(new Event('scroll'));
    currentScrollY = 0;
    window.dispatchEvent(new Event('scroll'));
    expect(showroomUiState.scrollY).toBe(500);
    unmount();
  });

  it('gates restore on `ready` (BACK remount waits for the device list)', async () => {
    showroomUiState.scrollY = 432;
    const { rerender, unmount } = render(<ProbeReady devices={0} />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(scrollTo).not.toHaveBeenCalled();
    rerender(<ProbeReady devices={3} />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(scrollTo).toHaveBeenCalledWith({ top: 432, left: 0, behavior: 'auto' });
    unmount();
  });
});

/**
 * T4.7A — application-lifecycle telemetry producer coverage.
 *
 * Covering the ACTIVE events that had no producer-proof test yet:
 *   - app_open / app_ready   — InitialRoute, fired once per app load
 *   - app_background / app_foreground — InitialRoute visibility listener
 *   - deep_link_open         — InitialRoute on a genuine hash deep link
 *
 * These are tested through the REAL <App/> boot (InitialRoute is the canonical
 * producer), NOT through a bare `track()` serialization. No DB/RPC/registry
 * contracts are touched; the events are asserted against the exact allowlist
 * payloads claimed by src/core/telemetry/events.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../core/telemetry', () => ({ track: mockTrack }));

function eventsOf(name: string) {
  return (mockTrack.mock.calls as Array<[Record<string, unknown>]>).map((c) => c[0]).filter((e) => e.event === name);
}

function renderApp() {
  return render(
    <Suspense fallback={<div>Loading...</div>}>
      <App />
    </Suspense>,
  );
}

const TEST_TIMEOUT = 20000;

describe('T4.7A — app lifecycle telemetry (real App boot)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    mockTrack.mockClear();
  });

  afterEach(() => {
    mockTrack.mockClear();
  });

  it('app_open + app_ready fire EXACTLY once each on a plain home boot, with no deep_link_open', async () => {
    renderApp();
    await waitFor(() => {
      expect(eventsOf('app_open')).toHaveLength(1);
    }, { timeout: 5000 });

    expect(eventsOf('app_open')).toEqual([{ event: 'app_open' }]);
    expect(eventsOf('app_ready')).toEqual([{ event: 'app_ready' }]);
    // A plain home landing is NOT a deep link — never reported.
    expect(eventsOf('deep_link_open')).toHaveLength(0);

    // Settle: the readiness effects must not re-fire on later re-renders.
    await new Promise((r) => setTimeout(r, 400));
    expect(eventsOf('app_open')).toHaveLength(1);
    expect(eventsOf('app_ready')).toHaveLength(1);
  }, TEST_TIMEOUT);

  it('hash deep link fires deep_link_open once with mode=hash/has_code=false, while open+ready still report the launch', async () => {
    window.history.pushState({}, '', '/#/settings');
    renderApp();
    await waitFor(() => {
      expect(eventsOf('deep_link_open')).toHaveLength(1);
    }, { timeout: 5000 });

    const dl = eventsOf('deep_link_open')[0];
    expect(dl).toEqual({
      event: 'deep_link_open',
      properties: { mode: 'hash', has_code: false },
    });
    // The launch still happened even though routing lands on Settings: the app
    // booted (open + ready) once each — never more.
    expect(eventsOf('app_open')).toEqual([{ event: 'app_open' }]);
    expect(eventsOf('app_ready')).toEqual([{ event: 'app_ready' }]);

    await new Promise((r) => setTimeout(r, 400));
    expect(eventsOf('deep_link_open')).toHaveLength(1);
    expect(eventsOf('app_open')).toHaveLength(1);
    expect(eventsOf('app_ready')).toHaveLength(1);
  }, TEST_TIMEOUT);

  it('visibility transitions: hidden fires app_background once, visible fires app_foreground once, repeats are skipped', async () => {
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get');
    visibilitySpy.mockReturnValue('visible');
    renderApp();
    await waitFor(() => {
      expect(eventsOf('app_open')).toHaveLength(1);
    }, { timeout: 5000 });

    // Enter background: fired exactly once.
    act(() => {
      visibilitySpy.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(eventsOf('app_background')).toEqual([{ event: 'app_background' }]);

    // A repeat hidden notification while still hidden is NOT a transition.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(eventsOf('app_background')).toHaveLength(1);

    // Back to foreground: fired exactly once.
    act(() => {
      visibilitySpy.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(eventsOf('app_foreground')).toEqual([{ event: 'app_foreground' }]);

    // A second foreground notification while already visible is skipped.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(eventsOf('app_foreground')).toHaveLength(1);
    // Nothing fire-and-forgets other events during a plain visibility cycle.
    expect(eventsOf('app_open')).toHaveLength(1);
    expect(eventsOf('app_ready')).toHaveLength(1);
  }, TEST_TIMEOUT);
});
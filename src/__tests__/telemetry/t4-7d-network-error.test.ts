/**
 * T4.7D — network_error producer coverage (the app-level offline handler).
 *
 * main.tsx registers the `window:offline` listener that reports the real
 * network_error event. This spec loads the REAL main module (with only its
 * side-effectful adjacency mocked: createRoot, logging, seed/bootstrap) and
 * drives a genuine offline transition. Asserted against the exact allowlist
 * payload from src/core/telemetry/events.ts (system/error_code).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockTrack = vi.hoisted(() => vi.fn());

vi.mock('../../core/telemetry', () => ({ track: mockTrack }));
vi.mock('react-dom/client', () => ({
  default: {
    createRoot: () => ({ render: vi.fn() }),
  },
  createRoot: () => ({ render: vi.fn() }),
}));
vi.mock('../../core/logging', () => ({ devError: vi.fn() }));
vi.mock('../../services/inventory-seed', () => ({
  ensureInventorySeeded: vi.fn(),
}));
vi.mock('../../services/inventory-central-service', () => ({
  bootstrapCentralInventory: vi.fn(),
}));

// The real boot module: registers the offline/error/unhandledrejection
// listeners and calls the (mocked) seed/bootstrap/createRoot entries.
import '../../main';

describe('T4.7D — network_error (main.tsx offline handler)', () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  afterEach(() => {
    mockTrack.mockClear();
  });

  it('never reports network_error without a genuine offline transition', () => {
    expect(mockTrack.mock.calls.some((c) => (c[0] as { event: string }).event === 'network_error')).toBe(false);
  });

  it('a real offline event fires network_error exactly once with error_code OFFLINE, no PII', () => {
    window.dispatchEvent(new Event('offline'));
    const calls = (mockTrack.mock.calls as Array<[Record<string, unknown>]>)
      .map((c) => c[0])
      .filter((e) => e.event === 'network_error');
    expect(calls).toEqual([
      { event: 'network_error', properties: { error_code: 'OFFLINE' } },
    ]);
  });
});
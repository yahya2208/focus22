import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the view-counter-service before importing the hook
vi.mock('../../services/view-counter-service', () => ({
  recordPhoneView: vi.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { useServerViewCounter } from '../../hooks/useServerViewCounter';
import { recordPhoneView } from '../../services/view-counter-service';

const mockRecordPhoneView = vi.mocked(recordPhoneView);

describe('useServerViewCounter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRecordPhoneView.mockClear();
    // Clear session suppression flags
    for (const key of Object.keys(globalThis)) {
      if (key.startsWith('__view_fired_')) {
        delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── detail_view (autoStart) ──────────────────────────────────────────

  describe('detail_view (autoStart mode)', () => {
    it('fires recordPhoneView after durationMs when autoStart=true', () => {
      renderHook(() =>
        useServerViewCounter('device_1', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      expect(mockRecordPhoneView).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(2000); });

      expect(mockRecordPhoneView).toHaveBeenCalledWith('device_1', 'detail_view');
    });

    it('does NOT fire before durationMs', () => {
      renderHook(() =>
        useServerViewCounter('device_1', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(1999); });
      expect(mockRecordPhoneView).not.toHaveBeenCalled();
    });

    it('fires only once (session suppression)', () => {
      const { unmount } = renderHook(() =>
        useServerViewCounter('device_1', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(2000); });
      expect(mockRecordPhoneView).toHaveBeenCalledTimes(1);

      unmount();

      // Re-mount with same deviceId + eventType
      renderHook(() =>
        useServerViewCounter('device_1', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(2000); });
      // Should NOT fire again — session suppression
      expect(mockRecordPhoneView).toHaveBeenCalledTimes(1);
    });

    it('increments count after firing', () => {
      const { result } = renderHook(() =>
        useServerViewCounter('device_1', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      expect(result.current.count).toBe(0);

      act(() => { vi.advanceTimersByTime(2000); });

      expect(result.current.count).toBe(1);
    });
  });

  // ── card_view (IntersectionObserver) ──────────────────────────────────

  describe('card_view (IntersectionObserver mode)', () => {
    it('does NOT fire without an observed element', () => {
      renderHook(() =>
        useServerViewCounter('device_1', 'card_view', { durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(5000); });
      expect(mockRecordPhoneView).not.toHaveBeenCalled();
    });

    it('does NOT fire when deviceId is null', () => {
      const { result } = renderHook(() =>
        useServerViewCounter(null, 'card_view', { durationMs: 2000 }),
      );

      const mockElement = document.createElement('div');
      act(() => { result.current.observe(mockElement); });
      act(() => { vi.advanceTimersByTime(5000); });
      expect(mockRecordPhoneView).not.toHaveBeenCalled();
    });

    it('observe returns a callable function', () => {
      const { result } = renderHook(() =>
        useServerViewCounter('device_1', 'card_view', { durationMs: 2000 }),
      );

      expect(typeof result.current.observe).toBe('function');
    });
  });

  // ── Different devices are independent ─────────────────────────────────

  describe('multiple devices', () => {
    it('different deviceIds can fire independently', () => {
      const { result: r1 } = renderHook(() =>
        useServerViewCounter('device_A', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );
      const { result: r2 } = renderHook(() =>
        useServerViewCounter('device_B', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(2000); });

      expect(mockRecordPhoneView).toHaveBeenCalledTimes(2);
      expect(mockRecordPhoneView).toHaveBeenCalledWith('device_A', 'detail_view');
      expect(mockRecordPhoneView).toHaveBeenCalledWith('device_B', 'detail_view');
      expect(r1.current.count).toBe(1);
      expect(r2.current.count).toBe(1);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('does not fire for empty deviceId', () => {
      renderHook(() =>
        useServerViewCounter('', 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(5000); });
      expect(mockRecordPhoneView).not.toHaveBeenCalled();
    });

    it('does not fire for undefined deviceId', () => {
      renderHook(() =>
        useServerViewCounter(undefined, 'detail_view', { autoStart: true, durationMs: 2000 }),
      );

      act(() => { vi.advanceTimersByTime(5000); });
      expect(mockRecordPhoneView).not.toHaveBeenCalled();
    });
  });
});

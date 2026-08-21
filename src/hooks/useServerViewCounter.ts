import { useCallback, useEffect, useRef, useState } from 'react';
import { recordPhoneView } from '../services/view-counter-service';

/**
 * Server-backed phone view counter.
 *
 * Two modes:
 *   1. **card_view** (default): Uses IntersectionObserver → ≥50% visible ≥2s
 *   2. **detail_view** (autoStart=true): Timer-only → starts immediately on mount, fires after 2s
 *
 * In both modes:
 *   - recordPhoneView() is fire-and-forget (never blocks UI)
 *   - Session-level suppression prevents duplicate fires per page load
 *   - Server is the authoritative source; local count is advisory
 *
 * @param deviceId     The phone's inventory ID
 * @param eventType    'card_view' for listing grid, 'detail_view' for details page
 * @param options      Optional configuration
 */
export function useServerViewCounter(
  deviceId: string | undefined | null,
  eventType: 'card_view' | 'detail_view' = 'card_view',
  options?: {
    /** Visibility threshold — default 0.5 (50%) */
    threshold?: number;
    /** Duration in ms — default 2000 (2 seconds) */
    durationMs?: number;
    /**
     * Auto-start timer on mount (for detail_view where the page IS the viewport).
     * When true, no element ref is needed — the timer fires after durationMs.
     * When false (default), requires observe(element) to start IntersectionObserver.
     */
    autoStart?: boolean;
  },
): { count: number; observe: (element: HTMLElement | null) => void } {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const firedRef = useRef(false);

  const {
    threshold = 0.5,
    durationMs = 2000,
    autoStart = false,
  } = options ?? {};

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fireView = useCallback(() => {
    if (firedRef.current || !deviceId) return;
    firedRef.current = true;

    // Session-level suppression
    const sessionKey = `__view_fired_${deviceId}_${eventType}`;
    try {
      (globalThis as Record<string, unknown>)[sessionKey] = true;
    } catch {
      // ignore
    }

    recordPhoneView(deviceId, eventType);
    setCount((c) => c + 1);
    clearTimer();
  }, [deviceId, eventType, clearTimer]);

  // Check session suppression on mount
  useEffect(() => {
    if (!deviceId) return;
    const sessionKey = `__view_fired_${deviceId}_${eventType}`;
    if ((globalThis as Record<string, unknown>)[sessionKey]) {
      firedRef.current = true;
    }
  }, [deviceId, eventType]);

  // Auto-start mode (detail_view) — timer starts immediately
  useEffect(() => {
    if (!autoStart || !deviceId || firedRef.current) return;
    timerRef.current = setTimeout(() => {
      fireView();
    }, durationMs);

    return () => { clearTimer(); };
  }, [autoStart, deviceId, durationMs, fireView, clearTimer]);

  // Callback ref for IntersectionObserver mode (card_view)
  const observe = useCallback((element: HTMLElement | null) => {
    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    clearTimer();

    if (!element || !deviceId || firedRef.current || autoStart) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            if (timerRef.current === null && !firedRef.current) {
              timerRef.current = setTimeout(() => {
                fireView();
              }, durationMs);
            }
          } else {
            clearTimer();
          }
        }
      },
      { threshold },
    );

    observer.observe(element);
    observerRef.current = observer;
  }, [deviceId, threshold, durationMs, fireView, clearTimer, autoStart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [clearTimer]);

  return { count, observe };
}

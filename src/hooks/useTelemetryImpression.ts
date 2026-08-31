import { useCallback, useEffect, useRef } from 'react';

/**
 * Telemetry impression tracker (T3.1).
 *
 * An impression is NOT a mount/render event. It only fires after an element is
 * actually visible per the approved contract: IntersectionObserver reports
 * >= threshold (default 60%) intersection and that state is held for >=
 * durationMs (default 1000ms). The callback fires exactly once per observed
 * element; a second real visibility may optionally refire only if it left the
 * viewport in between (controlled by the caller via `dedupeKey` on track()).
 *
 * By itself this hook does no deduping across mounts — callers pass a stable
 * `dedupeKey` to `track()` so the telemetry client collapses repeated
 * impressions within a session. This hook only guarantees the in-view gate:
 * no impression before the element is meaningfully visible, and no spam while
 * it stays in view.
 */
export function useTelemetryImpression(opts: {
  threshold?: number;
  durationMs?: number;
  onVisible: () => void;
}): (element: HTMLElement | null) => void {
  const { threshold = 0.6, durationMs = 1000, onVisible } = opts;
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cbRef = useRef(onVisible);
  cbRef.current = onVisible;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const observe = useCallback(
    (element: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      clearTimer();

      if (!element || typeof IntersectionObserver === 'undefined') return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
              if (timerRef.current === null && !firedRef.current) {
                timerRef.current = setTimeout(() => {
                  firedRef.current = true;
                  cbRef.current();
                }, durationMs);
              }
            } else {
              clearTimer();
            }
          }
        },
        { threshold },
      );
      observerRef.current.observe(element);
    },
    [threshold, durationMs, clearTimer],
  );

  useEffect(() => {
    return () => {
      clearTimer();
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [clearTimer]);

  return observe;
}

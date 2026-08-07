import { useEffect, useRef } from 'react';
import { showroomUiState } from './useShowroomState';

/**
 * v5.1 §6, §8.1 — Saves the showroom `window.scrollY` into the
 * `showroom-ui-state` registry and restores it after paint on BACK remounts.
 * No reload, no remount-jump.
 *
 * Why a listener instead of save-on-unmount: on navigation the old screen's
 * DOM is swapped for the new screen's in one commit, and during that swap the
 * browser clamps the viewport scroll to 0 (short/fallback content) before the
 * unmount cleanup reads `window.scrollY` — a save at unmount would persist 0.
 *
 * The listener is only attached once the restore has settled: on a BACK
 * remount the browser fires phantom `scroll` events (the previous screen's
 * leftover offset, then the content-swap clamp to 0) *before* React effects
 * run — an eager listener would overwrite the saved position with those
 * phantom values. Disabling it until the restore settles keeps the saved value
 * intact.
 *
 * The listener is also gated on the showroom still being the active route: when
 * navigating away, the URL switches to `#/phone-details` before the showroom
 * DOM unmounts, and the browser then clamps `window.scrollY` to the shrinking
 * content height — that clamp fires a `scroll` event that must NOT be saved,
 * or BACK would restore the transition residue instead of the user's position.
 *
 * The restore itself retries for a short window because the re-mounted list
 * lays out asynchronously (ads/images/render) — a single `scrollTo(target)`
 * fires before the page is tall enough and gets clamped.
 */
export function useScrollPreservation(ready = true): void {
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;
    const target = showroomUiState.scrollY;

    const trackScroll = () => {
      if (window.location.hash.startsWith('#/showroom')) {
        showroomUiState.scrollY = window.scrollY;
      }
    };
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.addEventListener('scroll', trackScroll, { passive: true });
    };

    const startedAt = Date.now();
    const maxRestoreMs = 5000;
    let raf = 0;
    const assertRestore = () => {
      if (Date.now() - startedAt > maxRestoreMs) {
        settle();
        return;
      }
      if (window.scrollY !== target) {
        window.scrollTo({ top: target, left: 0, behavior: 'auto' });
        raf = requestAnimationFrame(assertRestore);
      } else {
        settle();
      }
    };

    if (target <= 0) {
      raf = requestAnimationFrame(settle);
    } else {
      raf = requestAnimationFrame(assertRestore);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', trackScroll);
    };
  }, [ready]);
}

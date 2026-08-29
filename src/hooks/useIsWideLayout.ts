import { useEffect, useState } from 'react';

/**
 * Desktop/mobile discriminator for the category sidebar (Home). Uses
 * matchMedia at runtime (the same precedent as AdImageCarousel's
 * prefers-reduced-motion) — no CSS media queries outside the design system.
 * Returns false when matchMedia is unavailable (jsdom/tests → mobile layout).
 */
export function useIsWideLayout(breakpoint = 768): boolean {
  const [wide, setWide] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const listener = (e: MediaQueryListEvent) => setWide(e.matches);
    setWide(mq.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [breakpoint]);

  return wide;
}
import { useState, useEffect } from 'react';
import { breakpointValues, type Breakpoint } from './breakpoints';

function getMediaQuery(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMediaQuery(query));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${breakpointValues.tablet - 1}px)`);
}

export function useIsTablet(): boolean {
  return useMediaQuery(
    `(min-width: ${breakpointValues.tablet}px) and (max-width: ${breakpointValues.laptop - 1}px)`
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${breakpointValues.laptop}px)`);
}

export function useUp(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${breakpointValues[breakpoint]}px)`);
}

export function useDown(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(max-width: ${breakpointValues[breakpoint] - 1}px)`);
}

export function useBetween(min: Breakpoint, max: Breakpoint): boolean {
  return useMediaQuery(
    `(min-width: ${breakpointValues[min]}px) and (max-width: ${breakpointValues[max] - 1}px)`
  );
}

export interface ResponsiveInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function useResponsive(): ResponsiveInfo {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isDesktop = useIsDesktop();
  return { isMobile, isTablet, isDesktop };
}

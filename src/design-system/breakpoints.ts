export const breakpoints = {
  mobile: '480px',
  tablet: '768px',
  laptop: '1024px',
  desktop: '1280px',
  wide: '1440px',
} as const;

export type Breakpoint = keyof typeof breakpoints;

export const breakpointValues = {
  mobile: 480,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
  wide: 1440,
} as const;

export type BreakpointValue = keyof typeof breakpointValues;

export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.08)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.12)',
  md: '0 4px 12px rgba(0, 0, 0, 0.15)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.2)',
  xl: '0 12px 36px rgba(0, 0, 0, 0.25)',
  glass: '0 4px 24px rgba(0, 0, 0, 0.08)',
  floating: '0 8px 32px rgba(0, 0, 0, 0.18)',
  modal: '0 16px 48px rgba(0, 0, 0, 0.3)',
  focus: '0 0 0 2px var(--focus-ring, rgba(59, 130, 246, 0.4))',
} as const;

export type ShadowToken = keyof typeof shadows;

export const borders = {
  none: 'none',
  default: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
  strong: '1px solid var(--border-strong, rgba(255, 255, 255, 0.15))',
  focus: '2px solid var(--border-focus, rgba(59, 130, 246, 0.5))',
  input: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
  card: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
} as const;

export type BorderToken = keyof typeof borders;

export const elevation = {
  card: shadows.sm,
  dialog: shadows.lg,
  dropdown: shadows.md,
  floating: shadows.xl,
  tooltip: shadows.md,
} as const;

export type ElevationToken = keyof typeof elevation;

export const blur = {
  none: '0px',
  sm: '8px',
  md: '12px',
  lg: '20px',
} as const;

export type BlurToken = keyof typeof blur;

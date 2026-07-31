export const duration = {
  instant: '100ms',
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
} as const;

export type DurationToken = keyof typeof duration;

export const easing = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export type EasingToken = keyof typeof easing;

export const motion = {
  fast: `150ms cubic-bezier(0.4, 0, 0.2, 1)`,
  normal: `200ms cubic-bezier(0.4, 0, 0.2, 1)`,
  slow: `300ms cubic-bezier(0.22, 1, 0.36, 1)`,
  bounce: `300ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
  easeIn: `200ms cubic-bezier(0.4, 0, 1, 1)`,
  easeOut: `200ms cubic-bezier(0, 0, 0.2, 1)`,
} as const;

export type MotionToken = keyof typeof motion;

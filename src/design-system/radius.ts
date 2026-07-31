export const radius = {
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  pill: '9999px',
  circle: '50%',
} as const;

export type RadiusToken = keyof typeof radius;

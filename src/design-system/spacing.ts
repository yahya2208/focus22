export const spacingNumeric = {
  '0': '0px',
  '2': '2px',
  '4': '4px',
  '6': '6px',
  '8': '8px',
  '10': '10px',
  '12': '12px',
  '16': '16px',
  '20': '20px',
  '24': '24px',
  '32': '32px',
  '40': '40px',
  '48': '48px',
  '56': '56px',
  '64': '64px',
  '80': '80px',
  '96': '96px',
} as const;

export type SpacingNumericKey = keyof typeof spacingNumeric;

export const spacing = {
  xs: spacingNumeric['4'],
  sm: spacingNumeric['8'],
  md: spacingNumeric['12'],
  lg: spacingNumeric['16'],
  xl: spacingNumeric['20'],
  '2xl': spacingNumeric['24'],
  '3xl': spacingNumeric['32'],
  '4xl': spacingNumeric['40'],
  '5xl': spacingNumeric['48'],
} as const;

export type SpacingToken = keyof typeof spacing;

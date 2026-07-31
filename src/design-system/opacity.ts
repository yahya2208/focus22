export const opacity = {
  disabled: '0.4',
  hover: '0.08',
  pressed: '0.12',
  overlay: '0.6',
  glass: '0.04',
} as const;

export type OpacityToken = keyof typeof opacity;

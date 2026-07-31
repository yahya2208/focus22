export const fontFamily = {
  sans: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  sansArabic: "'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const fontSize = {
  display: '2rem',
  h1: '1.375rem',
  h2: '1.125rem',
  h3: '1rem',
  title: '0.9375rem',
  subtitle: '0.8125rem',
  body: '0.875rem',
  bodySmall: '0.8125rem',
  label: '0.75rem',
  caption: '0.6875rem',
  button: '0.8125rem',
  overline: '0.625rem',
  stat: '1.125rem',
  mono: '0.8125rem',
} as const;

export type FontSizeToken = keyof typeof fontSize;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export type FontWeightToken = keyof typeof fontWeight;

export const lineHeight = {
  tight: '1.2',
  normal: '1.5',
  relaxed: '1.6',
} as const;

export type LineHeightToken = keyof typeof lineHeight;

export const letterSpacing = {
  tight: '-0.02em',
  normal: '0',
  wide: '0.05em',
  wider: '0.1em',
} as const;

export type LetterSpacingToken = keyof typeof letterSpacing;

export const typography = {
  display: { fontSize: fontSize.display, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight, letterSpacing: letterSpacing.tight },
  h1: { fontSize: fontSize.h1, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight, letterSpacing: letterSpacing.tight },
  h2: { fontSize: fontSize.h2, fontWeight: fontWeight.semibold, lineHeight: lineHeight.tight, letterSpacing: letterSpacing.normal },
  h3: { fontSize: fontSize.h3, fontWeight: fontWeight.semibold, lineHeight: lineHeight.tight, letterSpacing: letterSpacing.normal },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.normal },
  subtitle: { fontSize: fontSize.subtitle, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.normal },
  body: { fontSize: fontSize.body, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.normal },
  bodySmall: { fontSize: fontSize.bodySmall, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.normal },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.wide },
  caption: { fontSize: fontSize.caption, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.normal },
  button: { fontSize: fontSize.button, fontWeight: fontWeight.semibold, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.wide },
  overline: { fontSize: fontSize.overline, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.wider },
  stat: { fontSize: fontSize.stat, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight, letterSpacing: letterSpacing.normal },
  mono: { fontSize: fontSize.mono, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal, letterSpacing: letterSpacing.normal, fontFamily: fontFamily.mono },
} as const;

export type TypographyToken = keyof typeof typography;

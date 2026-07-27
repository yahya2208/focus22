import type { ThemeId } from './use-theme';

// ============================================================================
// FOCUS Design Tokens — Foundation Layer (Phase-2A.1)
// ============================================================================
//
// This file is the SINGLE SOURCE OF TRUTH for all design tokens.
// No component should hardcode colors, spacing, or radius.
// All values must come from this file.
//
// Rules:
// - No value in this file should be #000000 or #050505
// - All spacing values are multiples of 4px
// - All border-radius values follow the scale: xs/sm/md/lg/xl/pill/circle
// - Shadows use consistent elevation levels
// - Colors are organized by role, not by hue
//
// ============================================================================

// ---------------------------------------------------------------------------
// 1. COLOR TOKENS — Raw palette per theme
// ---------------------------------------------------------------------------

export interface ColorTokens {
  // Background
  bg: string;
  bgSurface: string;
  bgSurfaceHover: string;
  bgInput: string;
  bgOverlay: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Accent (brand identity per theme)
  accent: string;
  accentLight: string;
  accentMuted: string;

  // Borders
  border: string;
  borderFocus: string;

  // Status
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;

  // Depth
  shadow: string;
  glass: string;
  glassBorder: string;
  overlay: string;
}

// ---------------------------------------------------------------------------
// 2. SEMANTIC COLOR TOKENS — Role-based aliases
// ---------------------------------------------------------------------------

export interface SemanticColors {
  // Surface hierarchy
  surfaceBase: string;
  surfaceRaised: string;
  surfaceOverlay: string;

  // Interactive
  interactiveDefault: string;
  interactiveHover: string;
  interactiveActive: string;
  interactiveDisabled: string;

  // Focus
  focusRing: string;
  focusRingOffset: string;

  // Status (semantic)
  statusSuccess: string;
  statusSuccessMuted: string;
  statusWarning: string;
  statusWarningMuted: string;
  statusDanger: string;
  statusDangerMuted: string;
  statusInfo: string;
  statusInfoMuted: string;
}

// ---------------------------------------------------------------------------
// 3. BORDER RADIUS TOKENS
// ---------------------------------------------------------------------------

export const radius = {
  /** Badges, small indicators */
  xs: '4px',
  /** Inputs, small buttons */
  sm: '8px',
  /** Default card radius */
  md: '12px',
  /** Buttons, interactive cards */
  lg: '16px',
  /** Large cards, modals, hero CTAs */
  xl: '20px',
  /** Pills, badges, tags */
  pill: '9999px',
  /** Circular elements (avatars, rings) */
  circle: '50%',
} as const;

export type RadiusToken = keyof typeof radius;

// ---------------------------------------------------------------------------
// 4. SHADOW TOKENS — Elevation levels
// ---------------------------------------------------------------------------

export const shadows = {
  /** No shadow — default for most elements */
  none: 'none',
  /** Subtle — cards, inputs */
  sm: '0 1px 3px rgba(0, 0, 0, 0.12)',
  /** Medium — elevated cards, dropdowns */
  md: '0 4px 12px rgba(0, 0, 0, 0.15)',
  /** Strong — modals, overlays */
  lg: '0 8px 24px rgba(0, 0, 0, 0.2)',
  /** Focus ring glow — interactive elements */
  focus: '0 0 0 2px var(--focus-ring, rgba(59, 130, 246, 0.4))',
} as const;

export type ShadowToken = keyof typeof shadows;

// ---------------------------------------------------------------------------
// 5. BORDER TOKENS
// ---------------------------------------------------------------------------

export const borders = {
  /** No border */
  none: 'none',
  /** Default — subtle separation */
  default: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
  /** Strong — emphasis, active states */
  strong: '1px solid var(--border-strong, rgba(255, 255, 255, 0.15))',
  /** Focus — interactive focus ring */
  focus: '2px solid var(--border-focus, rgba(59, 130, 246, 0.5))',
  /** Input — form field border */
  input: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
  /** Card — container border */
  card: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
} as const;

export type BorderToken = keyof typeof borders;

// ---------------------------------------------------------------------------
// 6. SPACING TOKENS — 4px grid
// ---------------------------------------------------------------------------

export const spacing = {
  /** 4px — tight gaps, icon margins */
  xs: '4px',
  /** 8px — compact gaps, inline spacing */
  sm: '8px',
  /** 12px — card internal spacing */
  md: '12px',
  /** 16px — standard spacing, card padding */
  lg: '16px',
  /** 20px — section spacing, large card padding */
  xl: '20px',
  /** 24px — section gaps */
  '2xl': '24px',
  /** 32px — large section gaps */
  '3xl': '32px',
  /** 40px — page-level spacing */
  '4xl': '40px',
  /** 48px — hero spacing */
  '5xl': '48px',
} as const;

export type SpacingToken = keyof typeof spacing;

// ---------------------------------------------------------------------------
// 7. TYPOGRAPHY TOKENS
// ---------------------------------------------------------------------------

export const fontFamily = {
  /** Primary font stack (Latin) */
  sans: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  /** Arabic font stack */
  sansArabic: "'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif",
  /** Monospace (QR codes, code output) */
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const fontSize = {
  /** Score rings, hero numbers */
  display: '2rem',
  /** Screen titles */
  h1: '1.375rem',
  /** Section headings */
  h2: '1.125rem',
  /** Body text, descriptions */
  body: '0.875rem',
  /** Card labels, input labels */
  label: '0.75rem',
  /** Timestamps, footnotes */
  caption: '0.6875rem',
  /** Section headers, overline text */
  overline: '0.625rem',
  /** Stat values, numbers in cards */
  stat: '1.125rem',
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
  /** Headlines, display text */
  tight: '1.2',
  /** Body text */
  normal: '1.5',
  /** Long-form text, AI summaries */
  relaxed: '1.6',
} as const;

export type LineHeightToken = keyof typeof lineHeight;

export const letterSpacing = {
  /** Headlines, display text */
  tight: '-0.02em',
  /** Body text */
  normal: '0',
  /** Labels, overlines */
  wide: '0.05em',
  /** Section headers, uppercase labels */
  wider: '0.1em',
} as const;

export type LetterSpacingToken = keyof typeof letterSpacing;

// ---------------------------------------------------------------------------
// 8. MOTION TOKENS
// ---------------------------------------------------------------------------

export const duration = {
  /** Background color changes, focus */
  instant: '100ms',
  /** Input focus, button press, hover */
  fast: '150ms',
  /** Button transitions, hover states */
  normal: '200ms',
  /** Page transitions, card reveals, max for non-game */
  slow: '300ms',
} as const;

export type DurationToken = keyof typeof duration;

export const easing = {
  /** Default interaction (buttons, inputs) */
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Page transitions, progress, reveals */
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** Celebrations, achievements (rare) */
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

export type EasingToken = keyof typeof easing;

// ---------------------------------------------------------------------------
// 9. BLUR TOKENS
// ---------------------------------------------------------------------------

export const blur = {
  /** No blur */
  none: '0px',
  /** Light blur — subtle depth */
  sm: '8px',
  /** Standard blur — glassmorphism cards */
  md: '12px',
  /** Heavy blur — modals, overlays */
  lg: '20px',
} as const;

export type BlurToken = keyof typeof blur;

// ---------------------------------------------------------------------------
// 10. Z-INDEX TOKENS
// ---------------------------------------------------------------------------

export const zIndex = {
  /** Default layer */
  base: 0,
  /** Elevated cards */
  raised: 10,
  /** Dropdowns, popovers */
  dropdown: 100,
  /** Sticky headers */
  sticky: 200,
  /** Backdrop overlays */
  overlay: 300,
  /** Modals, dialogs */
  modal: 400,
  /** Toast notifications */
  toast: 500,
  /** Tooltips */
  tooltip: 600,
  /** Game UI elements */
  game: 700,
} as const;

export type ZIndexToken = keyof typeof zIndex;

// ---------------------------------------------------------------------------
// 11. LAYOUT TOKENS
// ---------------------------------------------------------------------------

export const layout = {
  /** Consumer screen max-width */
  containerMax: '480px',
  /** Consumer screen padding */
  containerPadding: '20px',
  /** Research console sidebar expanded width */
  sidebarExpanded: '240px',
  /** Research console sidebar collapsed width */
  sidebarCollapsed: '60px',
  /** Research console mobile drawer width */
  sidebarDrawer: '260px',
  /** Mobile header height */
  headerHeightMobile: '56px',
  /** Desktop header height */
  headerHeightDesktop: '64px',
  /** Minimum touch target size */
  touchTarget: '44px',
} as const;

// ---------------------------------------------------------------------------
// 12. PER-THEME COLOR PALETTES
// ---------------------------------------------------------------------------

const midnightColors: ColorTokens = {
  bg: '#0a0a12',
  bgSurface: 'rgba(16, 16, 28, 0.85)',
  bgSurfaceHover: '#1c1c38',
  bgInput: '#14142a',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f0f0f6',
  textSecondary: '#a8a8c0',
  textMuted: '#6868a0',
  accent: '#00e4b8',
  accentLight: '#40ffc8',
  accentMuted: 'rgba(0, 228, 184, 0.15)',
  border: '#181830',
  borderFocus: 'rgba(0, 228, 184, 0.5)',
  success: '#b8f24c',
  successMuted: 'rgba(184, 242, 76, 0.10)',
  warning: '#ffc244',
  warningMuted: 'rgba(255, 194, 68, 0.10)',
  danger: '#ff6b7a',
  dangerMuted: 'rgba(255, 107, 122, 0.10)',
  info: '#4cc4f0',
  infoMuted: 'rgba(76, 196, 240, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(255, 255, 255, 0.035)',
  glassBorder: 'rgba(255, 255, 255, 0.07)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const oceanColors: ColorTokens = {
  bg: '#07111e',
  bgSurface: 'rgba(12, 22, 38, 0.85)',
  bgSurfaceHover: '#142a44',
  bgInput: '#0e1e34',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#e8f0f8',
  textSecondary: '#8aaac8',
  textMuted: '#507090',
  accent: '#00b4ff',
  accentLight: '#40ccff',
  accentMuted: 'rgba(0, 180, 255, 0.15)',
  border: '#0f2038',
  borderFocus: 'rgba(0, 180, 255, 0.5)',
  success: '#44d88c',
  successMuted: 'rgba(68, 216, 140, 0.10)',
  warning: '#ffba3c',
  warningMuted: 'rgba(255, 186, 60, 0.10)',
  danger: '#ff6070',
  dangerMuted: 'rgba(255, 96, 112, 0.10)',
  info: '#38a0e8',
  infoMuted: 'rgba(56, 160, 232, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(100, 180, 255, 0.04)',
  glassBorder: 'rgba(100, 180, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const emeraldColors: ColorTokens = {
  bg: '#060f0a',
  bgSurface: 'rgba(10, 22, 16, 0.85)',
  bgSurfaceHover: '#122c1c',
  bgInput: '#0c1e14',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#e8f8f0',
  textSecondary: '#88c8a4',
  textMuted: '#50906c',
  accent: '#00e488',
  accentLight: '#40ffa0',
  accentMuted: 'rgba(0, 228, 136, 0.15)',
  border: '#0e2418',
  borderFocus: 'rgba(0, 228, 136, 0.5)',
  success: '#a0f060',
  successMuted: 'rgba(160, 240, 96, 0.10)',
  warning: '#ffc040',
  warningMuted: 'rgba(255, 192, 64, 0.10)',
  danger: '#ff6878',
  dangerMuted: 'rgba(255, 104, 120, 0.10)',
  info: '#3cc0b0',
  infoMuted: 'rgba(60, 192, 176, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(100, 240, 180, 0.035)',
  glassBorder: 'rgba(100, 240, 180, 0.07)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const carbonColors: ColorTokens = {
  bg: '#111111',
  bgSurface: 'rgba(22, 22, 22, 0.9)',
  bgSurfaceHover: '#242424',
  bgInput: '#1a1a1a',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f0f0f0',
  textSecondary: '#a0a0a0',
  textMuted: '#666666',
  accent: '#ffffff',
  accentLight: '#ffffff',
  accentMuted: 'rgba(255, 255, 255, 0.10)',
  border: '#1e1e1e',
  borderFocus: 'rgba(255, 255, 255, 0.4)',
  success: '#4ade80',
  successMuted: 'rgba(74, 222, 128, 0.10)',
  warning: '#facc15',
  warningMuted: 'rgba(250, 204, 21, 0.10)',
  danger: '#f87171',
  dangerMuted: 'rgba(248, 113, 113, 0.10)',
  info: '#60a5fa',
  infoMuted: 'rgba(96, 165, 250, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const purpleColors: ColorTokens = {
  bg: '#0c0818',
  bgSurface: 'rgba(18, 12, 36, 0.85)',
  bgSurfaceHover: '#201840',
  bgInput: '#160e30',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f0eaf8',
  textSecondary: '#a898c8',
  textMuted: '#706098',
  accent: '#c080ff',
  accentLight: '#d4a0ff',
  accentMuted: 'rgba(192, 128, 255, 0.15)',
  border: '#18102c',
  borderFocus: 'rgba(192, 128, 255, 0.5)',
  success: '#80e8a0',
  successMuted: 'rgba(128, 232, 160, 0.10)',
  warning: '#ffc060',
  warningMuted: 'rgba(255, 192, 96, 0.10)',
  danger: '#ff7088',
  dangerMuted: 'rgba(255, 112, 136, 0.10)',
  info: '#80b0ff',
  infoMuted: 'rgba(128, 176, 255, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(180, 120, 255, 0.04)',
  glassBorder: 'rgba(180, 120, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const sunriseColors: ColorTokens = {
  bg: '#120a06',
  bgSurface: 'rgba(26, 16, 8, 0.85)',
  bgSurfaceHover: '#2c1c10',
  bgInput: '#1e120a',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  text: '#f8f0e8',
  textSecondary: '#c8a888',
  textMuted: '#907050',
  accent: '#ff8c40',
  accentLight: '#ffaa68',
  accentMuted: 'rgba(255, 140, 64, 0.15)',
  border: '#20140c',
  borderFocus: 'rgba(255, 140, 64, 0.5)',
  success: '#80e080',
  successMuted: 'rgba(128, 224, 128, 0.10)',
  warning: '#ffc840',
  warningMuted: 'rgba(255, 200, 64, 0.10)',
  danger: '#ff6060',
  dangerMuted: 'rgba(255, 96, 96, 0.10)',
  info: '#60b8e0',
  infoMuted: 'rgba(96, 184, 224, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  glass: 'rgba(255, 180, 100, 0.04)',
  glassBorder: 'rgba(255, 180, 100, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const lightColors: ColorTokens = {
  bg: '#f4f4f8',
  bgSurface: 'rgba(255, 255, 255, 0.92)',
  bgSurfaceHover: '#e0e0e8',
  bgInput: '#ecedf2',
  bgOverlay: 'rgba(0, 0, 0, 0.3)',
  text: '#1a1a24',
  textSecondary: '#4a4a5c',
  textMuted: '#7c7c90',
  accent: '#00886e',
  accentLight: '#00a888',
  accentMuted: 'rgba(0, 136, 110, 0.10)',
  border: '#d4d4dc',
  borderFocus: 'rgba(0, 136, 110, 0.5)',
  success: '#16803c',
  successMuted: 'rgba(22, 128, 60, 0.08)',
  warning: '#a07000',
  warningMuted: 'rgba(160, 112, 0, 0.08)',
  danger: '#c82020',
  dangerMuted: 'rgba(200, 32, 32, 0.08)',
  info: '#0068a8',
  infoMuted: 'rgba(0, 104, 168, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.05)',
  glass: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.3)',
};

// ---------------------------------------------------------------------------
// 13. THEME COLOR MAP
// ---------------------------------------------------------------------------

export const themeColors: Record<ThemeId, ColorTokens> = {
  midnight: midnightColors,
  ocean: oceanColors,
  emerald: emeraldColors,
  carbon: carbonColors,
  purple: purpleColors,
  sunrise: sunriseColors,
  light: lightColors,
};

// ---------------------------------------------------------------------------
// 14. SEMANTIC THEME BUILDER
// ---------------------------------------------------------------------------

/**
 * Builds semantic color tokens from raw color tokens.
 * This layer adds role-based aliases on top of the raw palette.
 */
export function buildSemanticColors(colors: ColorTokens): SemanticColors {
  return {
    surfaceBase: colors.bg,
    surfaceRaised: colors.bgSurface,
    surfaceOverlay: colors.bgOverlay,

    interactiveDefault: colors.accent,
    interactiveHover: colors.accentLight,
    interactiveActive: colors.accent,
    interactiveDisabled: colors.textMuted,

    focusRing: colors.borderFocus,
    focusRingOffset: colors.bg,

    statusSuccess: colors.success,
    statusSuccessMuted: colors.successMuted,
    statusWarning: colors.warning,
    statusWarningMuted: colors.warningMuted,
    statusDanger: colors.danger,
    statusDangerMuted: colors.dangerMuted,
    statusInfo: colors.info,
    statusInfoMuted: colors.infoMuted,
  };
}

// ---------------------------------------------------------------------------
// 15. COMPLETE THEME TOKEN SET
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  colors: ColorTokens;
  semantic: SemanticColors;
  radius: typeof radius;
  shadows: typeof shadows;
  borders: typeof borders;
  spacing: typeof spacing;
  fontFamily: typeof fontFamily;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  lineHeight: typeof lineHeight;
  letterSpacing: typeof letterSpacing;
  duration: typeof duration;
  easing: typeof easing;
  blur: typeof blur;
  zIndex: typeof zIndex;
  layout: typeof layout;
}

/**
 * Returns the complete token set for a given theme.
 * Static tokens (radius, shadows, etc.) are shared across all themes.
 * Only colors change per theme.
 */
export function getThemeTokens(themeId: ThemeId): ThemeTokens {
  return {
    colors: themeColors[themeId],
    semantic: buildSemanticColors(themeColors[themeId]),
    radius,
    shadows,
    borders,
    spacing,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    duration,
    easing,
    blur,
    zIndex,
    layout,
  };
}

import { useTheme } from './use-theme';
import {
  getThemeTokens,
  themeColors,
  type ThemeTokens,
  type ColorTokens,
  type SemanticColors,
} from './tokens';

export type {
  ThemeTokens,
  ColorTokens,
  SemanticColors,
} from './tokens';

export {
  type RadiusToken,
  type ShadowToken,
  type SpacingToken,
  type FontSizeToken,
  type FontWeightToken,
  type LineHeightToken,
  type LetterSpacingToken,
  type DurationToken,
  type EasingToken,
  type BlurToken,
  type ZIndexToken,
} from './tokens';

export { radius, shadows, borders, spacing, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, duration, easing, blur, zIndex, layout, themeColors } from './tokens';

/**
 * Primary hook for accessing the complete design token set.
 *
 * Usage:
 * ```tsx
 * const { colors, semantic, radius, spacing } = useTokens();
 *
 * // Use raw colors
 * <div style={{ background: colors.bg, color: colors.text }}>
 *
 * // Use semantic colors
 * <div style={{ background: semantic.surfaceRaised, color: semantic.statusSuccess }}>
 *
 * // Use static tokens (same across all themes)
 * <div style={{ borderRadius: radius.lg, padding: spacing.xl }}>
 * ```
 */
export function useTokens(): ThemeTokens {
  const { theme } = useTheme();
  return getThemeTokens(theme);
}

/**
 * Hook for accessing just the color tokens (most common use case).
 *
 * This is a lighter alternative to useTokens() when you only need colors.
 */
export function useColors(): ColorTokens {
  const { theme } = useTheme();
  return themeColors[theme];
}

/**
 * Hook for accessing semantic color tokens.
 *
 * Use this when you want role-based colors (surfaceBase, statusSuccess, etc.)
 * rather than raw palette colors.
 */
export function useSemanticColors(): SemanticColors {
  const { colors } = useTokens();
  return buildSemanticColorsFromColors(colors);
}

function buildSemanticColorsFromColors(colors: ColorTokens): SemanticColors {
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

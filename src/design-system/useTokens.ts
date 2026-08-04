import { useTheme } from './use-theme';
import {
  getThemeTokens,
  themeColors,
  type ThemeTokens,
  type ColorTokens,
  type SemanticColors,
} from './tokens';
import { buildColorRoles, type ColorRoles } from './colors';
import {
  buttonRecipe, type ButtonRecipeVariant, type ButtonRecipeSize,
  cardRecipe, type CardRecipeVariant,
  badgeRecipe, type BadgeRecipeVariant,
  inputRecipe,
  modalRecipe,
} from './recipes';

export type {
  ThemeTokens,
  ColorTokens,
  SemanticColors,
  ColorRoles,
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

export { buildColorRoles } from './colors';

export function useTokens(): ThemeTokens {
  const { theme } = useTheme();
  return getThemeTokens(theme);
}

export function useColors(): ColorTokens {
  const { theme } = useTheme();
  return themeColors[theme] ?? themeColors.midnight;
}

export function useSemanticColors(): SemanticColors {
  const { colors } = useTokens();
  return buildSemanticColorsFromColors(colors);
}

export function useColorRoles(): ColorRoles {
  const { theme } = useTheme();
  return buildColorRoles(themeColors[theme] ?? themeColors.midnight);
}

export function useButtonRecipe(variant: ButtonRecipeVariant, size: ButtonRecipeSize) {
  const roles = useColorRoles();
  return buttonRecipe(roles, variant, size);
}

export function useCardRecipe(variant: CardRecipeVariant, padding: string = 'lg', radius?: string) {
  const roles = useColorRoles();
  return cardRecipe(roles, variant, padding, radius);
}

export function useBadgeRecipe(variant: BadgeRecipeVariant) {
  const roles = useColorRoles();
  return badgeRecipe(roles, variant);
}

export function useInputRecipe(rad?: string) {
  const roles = useColorRoles();
  return inputRecipe(roles, rad ?? 'md');
}

export function useModalRecipe() {
  const roles = useColorRoles();
  return modalRecipe(roles);
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

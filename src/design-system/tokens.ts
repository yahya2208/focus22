import type { ThemeId } from './use-theme';
import { themeColors, buildColorRoles, buildSemanticColors } from './colors';
import type { ColorTokens, ColorRoles, SemanticColors } from './colors';
import { spacing } from './spacing';
import { radius } from './radius';
import { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing } from './typography';
import { shadows, borders, blur, elevation } from './shadows';
import { duration, easing } from './motion';
import { zIndex } from './z-index';

export {
  themeColors,
  buildColorRoles,
  buildSemanticColors,
  type ColorTokens,
  type ColorRoles,
  type SemanticColors,
} from './colors';

export { radius, type RadiusToken } from './radius';

export { spacing, type SpacingToken } from './spacing';

export {
  shadows,
  borders,
  blur,
  elevation,
  type ShadowToken,
  type BorderToken,
  type BlurToken,
  type ElevationToken,
} from './shadows';

export {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  type FontSizeToken,
  type FontWeightToken,
  type LineHeightToken,
  type LetterSpacingToken,
} from './typography';

export {
  duration,
  easing,
  type DurationToken,
  type EasingToken,
} from './motion';

export { zIndex, type ZIndexToken } from './z-index';

export const layout = {
  containerMax: '480px',
  containerPadding: '20px',
  sidebarExpanded: '240px',
  sidebarCollapsed: '60px',
  sidebarDrawer: '260px',
  headerHeightMobile: '56px',
  headerHeightDesktop: '64px',
  touchTarget: '44px',
} as const;

export interface ThemeTokens {
  colors: ColorTokens;
  colorRoles: ColorRoles;
  semantic: SemanticColors;
  radius: typeof radius;
  shadows: typeof shadows;
  elevation: typeof elevation;
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

export function getThemeTokens(themeId: ThemeId): ThemeTokens {
  const colors = themeColors[themeId] ?? themeColors.midnight;
  return {
    colors,
    colorRoles: buildColorRoles(colors),
    semantic: buildSemanticColors(colors),
    radius,
    shadows,
    elevation,
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

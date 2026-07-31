import type { ColorRoles } from '../colors';
import { radius as radiusToken, type RadiusToken } from '../radius';
import { spacing, type SpacingToken } from '../spacing';
import { elevation } from '../shadows';

export type CardRecipeVariant = 'surface' | 'glass' | 'outlined' | 'elevated' | 'interactive';

export interface CardRecipeResult {
  background: string;
  border: string;
  radius: string;
  padding: string;
  backdropFilter: string | undefined;
  hoverBg: string | undefined;
  hoverBorder: string | undefined;
  hoverTransform: string | undefined;
  hoverShadow: string | undefined;
}

export function cardRecipe(roles: ColorRoles, variant: CardRecipeVariant, pad: SpacingToken | string, rad: string | undefined): CardRecipeResult {
  const p = pad in spacing ? spacing[pad as SpacingToken] : pad;
  const r = rad && rad in radiusToken ? radiusToken[rad as RadiusToken] : rad ?? radiusToken.lg;

  switch (variant) {
    case 'surface':
      return {
        background: roles.surface.default,
        border: `1px solid ${roles.border.default}`,
        radius: r,
        padding: p,
        backdropFilter: undefined,
        hoverBg: undefined,
        hoverBorder: undefined,
        hoverTransform: undefined,
        hoverShadow: undefined,
      };
    case 'glass':
      return {
        background: roles.surface.default,
        border: `1px solid ${roles.border.default}`,
        radius: r,
        padding: p,
        backdropFilter: 'blur(20px)',
        hoverBg: undefined,
        hoverBorder: undefined,
        hoverTransform: undefined,
        hoverShadow: undefined,
      };
    case 'outlined':
      return {
        background: 'transparent',
        border: `1px solid ${roles.border.default}`,
        radius: r,
        padding: p,
        backdropFilter: undefined,
        hoverBg: undefined,
        hoverBorder: undefined,
        hoverTransform: undefined,
        hoverShadow: undefined,
      };
    case 'elevated':
      return {
        background: roles.surface.default,
        border: 'none',
        radius: r,
        padding: p,
        backdropFilter: undefined,
        hoverBg: undefined,
        hoverBorder: undefined,
        hoverTransform: undefined,
        hoverShadow: undefined,
      };
    case 'interactive':
      return {
        background: roles.surface.hover,
        border: `1px solid ${roles.border.default}`,
        radius: r,
        padding: p,
        backdropFilter: undefined,
        hoverBg: roles.surface.active,
        hoverBorder: `1px solid ${roles.action.primary}44`,
        hoverTransform: 'translateY(-2px)',
        hoverShadow: elevation.dropdown,
      };
  }
}

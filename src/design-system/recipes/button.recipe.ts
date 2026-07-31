import type { ColorRoles } from '../colors';
import { radius as radiusToken, type RadiusToken } from '../radius';
import { spacing, type SpacingToken } from '../spacing';
import { fontSize as fs, type FontSizeToken } from '../typography';

export type ButtonRecipeVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success' | 'warning' | 'link';
export type ButtonRecipeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonRecipeResult {
  background: string;
  color: string;
  border: string;
  hoverBg: string;
  hoverBorder: string;
  focusRing: string;
  disabledBg: string;
  disabledColor: string;
  padding: string;
  height: string;
  fontSize: string;
  radius: string;
  fontColor: string;
}

const sizeMap: Record<ButtonRecipeSize, { height: string; px: SpacingToken; fs: FontSizeToken; radius: RadiusToken }> = {
  xs: { height: '32px', px: 'sm', fs: 'caption', radius: 'sm' },
  sm: { height: '36px', px: 'md', fs: 'button', radius: 'sm' },
  md: { height: '44px', px: 'lg', fs: 'button', radius: 'md' },
  lg: { height: '48px', px: 'xl', fs: 'body', radius: 'lg' },
  xl: { height: '56px', px: '2xl', fs: 'body', radius: 'lg' },
};

export function buttonRecipe(roles: ColorRoles, variant: ButtonRecipeVariant, size: ButtonRecipeSize): ButtonRecipeResult {
  const sz = sizeMap[size];

  const base = {
    padding: spacing[sz.px],
    height: sz.height,
    fontSize: fs[sz.fs],
    radius: radiusToken[sz.radius],
  };

  switch (variant) {
    case 'primary':
      return {
        background: roles.action.primary,
        color: roles.text.inverse,
        border: 'none',
        hoverBg: roles.action.secondary,
        hoverBorder: 'none',
        focusRing: roles.focus.default,
        disabledBg: roles.surface.disabled,
        disabledColor: roles.text.inverse,
        fontColor: roles.text.inverse,
        ...base,
      };
    case 'secondary':
      return {
        background: roles.surface.default,
        color: roles.text.primary,
        border: `1px solid ${roles.border.default}`,
        hoverBg: roles.surface.hover,
        hoverBorder: `1px solid ${roles.border.default}`,
        focusRing: roles.focus.default,
        disabledBg: roles.surface.disabled,
        disabledColor: roles.text.muted,
        fontColor: roles.text.primary,
        ...base,
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: roles.text.secondary,
        border: 'none',
        hoverBg: roles.surface.hover,
        hoverBorder: 'none',
        focusRing: roles.focus.default,
        disabledBg: 'transparent',
        disabledColor: roles.text.muted,
        fontColor: roles.text.secondary,
        ...base,
      };
    case 'outline':
      return {
        background: 'transparent',
        color: roles.action.primary,
        border: `1px solid ${roles.action.primary}40`,
        hoverBg: roles.surface.hover,
        hoverBorder: `1px solid ${roles.action.primary}`,
        focusRing: roles.focus.default,
        disabledBg: 'transparent',
        disabledColor: roles.text.muted,
        fontColor: roles.action.primary,
        ...base,
      };
    case 'danger':
      return {
        background: roles.status.error,
        color: roles.text.inverse,
        border: 'none',
        hoverBg: roles.status.error,
        hoverBorder: 'none',
        focusRing: roles.focus.default,
        disabledBg: roles.surface.disabled,
        disabledColor: roles.text.inverse,
        fontColor: roles.text.inverse,
        ...base,
      };
    case 'success':
      return {
        background: roles.status.success,
        color: roles.text.inverse,
        border: 'none',
        hoverBg: roles.status.success,
        hoverBorder: 'none',
        focusRing: roles.focus.default,
        disabledBg: roles.surface.disabled,
        disabledColor: roles.text.inverse,
        fontColor: roles.text.inverse,
        ...base,
      };
    case 'warning':
      return {
        background: roles.status.warning,
        color: roles.text.inverse,
        border: 'none',
        hoverBg: roles.status.warning,
        hoverBorder: 'none',
        focusRing: roles.focus.default,
        disabledBg: roles.surface.disabled,
        disabledColor: roles.text.inverse,
        fontColor: roles.text.inverse,
        ...base,
      };
    case 'link':
      return {
        background: 'transparent',
        color: roles.action.primary,
        border: 'none',
        hoverBg: 'transparent',
        hoverBorder: 'none',
        focusRing: roles.focus.default,
        disabledBg: 'transparent',
        disabledColor: roles.text.muted,
        fontColor: roles.action.primary,
        ...base,
      };
  }
}

import type { ColorRoles } from '../colors';
import { radius } from '../radius';
import { spacing } from '../spacing';
import { fontSize, fontWeight } from '../typography';

export type BadgeRecipeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'processing' | 'running' | 'completed' | 'pending';

export interface BadgeRecipeResult {
  background: string;
  color: string;
  border: string;
  radius: string;
  padding: string;
  fontSize: string;
  fontWeight: string;
  dotBg: string;
}

export function badgeRecipe(roles: ColorRoles, variant: BadgeRecipeVariant): BadgeRecipeResult {
  const base = {
    radius: radius.pill,
    padding: `2px ${spacing.sm}`,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  };

  switch (variant) {
    case 'success':
      return { ...base, background: roles.status.success, color: roles.text.inverse, border: 'none', dotBg: roles.status.success };
    case 'warning':
      return { ...base, background: roles.status.warning, color: roles.text.inverse, border: 'none', dotBg: roles.status.warning };
    case 'error':
      return { ...base, background: roles.status.error, color: roles.text.inverse, border: 'none', dotBg: roles.status.error };
    case 'info':
      return { ...base, background: roles.status.info, color: roles.text.inverse, border: 'none', dotBg: roles.status.info };
    case 'neutral':
      return { ...base, background: roles.surface.default, color: roles.text.secondary, border: `1px solid ${roles.border.default}`, dotBg: roles.text.muted };
    case 'processing':
    case 'running':
      return { ...base, background: roles.surface.hover, color: roles.action.primary, border: `1px solid ${roles.action.primary}44`, dotBg: roles.action.primary };
    case 'completed':
      return { ...base, background: roles.surface.default, color: roles.status.success, border: `1px solid ${roles.status.success}44`, dotBg: roles.status.success };
    case 'pending':
      return { ...base, background: roles.surface.default, color: roles.status.warning, border: `1px solid ${roles.status.warning}44`, dotBg: roles.status.warning };
  }
}

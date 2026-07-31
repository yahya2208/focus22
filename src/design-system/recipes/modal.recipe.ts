import type { ColorRoles } from '../colors';
import { radius } from '../radius';
import { spacing } from '../spacing';
import { elevation } from '../shadows';

export interface ModalRecipeResult {
  overlayBg: string;
  contentBg: string;
  contentRadius: string;
  contentPadding: string;
  contentShadow: string;
  maxWidth: string;
  titleColor: string;
  titleFontSize: string;
  titleFontWeight: string;
}

export function modalRecipe(roles: ColorRoles): ModalRecipeResult {
  return {
    overlayBg: roles.overlay.default,
    contentBg: roles.surface.default,
    contentRadius: radius.xl,
    contentPadding: spacing.xl,
    contentShadow: elevation.dialog,
    maxWidth: '480px',
    titleColor: roles.text.primary,
    titleFontSize: '1.125rem',
    titleFontWeight: '700',
  };
}

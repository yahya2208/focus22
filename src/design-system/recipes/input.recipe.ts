import type { ColorRoles } from '../colors';
import { radius as radiusToken, type RadiusToken } from '../radius';
import { spacing } from '../spacing';
import { fontSize as fs } from '../typography';

export interface InputRecipeResult {
  background: string;
  color: string;
  border: string;
  borderFocus: string;
  borderError: string;
  radius: string;
  padding: string;
  fontSize: string;
  placeholderColor: string;
  focusRing: string;
  fontColor: string;
}

export function inputRecipe(roles: ColorRoles, rad: RadiusToken | string = 'md'): InputRecipeResult {
  const r = rad in radiusToken ? radiusToken[rad as RadiusToken] : rad;

  return {
    background: roles.surface.default,
    color: roles.text.primary,
    border: `1px solid ${roles.border.default}`,
    borderFocus: `1px solid ${roles.focus.default}`,
    borderError: `1px solid ${roles.status.error}`,
    radius: r,
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: fs.body,
    placeholderColor: roles.text.muted,
    focusRing: roles.focus.default,
    fontColor: roles.text.primary,
  };
}

export function selectRecipe(roles: ColorRoles, rad: RadiusToken | string = 'md') {
  return inputRecipe(roles, rad);
}

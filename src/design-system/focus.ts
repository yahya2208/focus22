import type { ColorRoles } from './colors';

export interface FocusRingStyle {
  outline: string;
  outlineOffset: string;
  boxShadow: string;
}

export function focusRing(roles: ColorRoles): FocusRingStyle {
  return {
    outline: `2px solid ${roles.focus.default}`,
    outlineOffset: '2px',
    boxShadow: `0 0 0 2px ${roles.focus.default}33`,
  };
}

export function focusRingReset(): Pick<FocusRingStyle, 'outline' | 'boxShadow'> {
  return { outline: 'none', boxShadow: 'none' };
}

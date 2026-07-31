import { describe, it, expect } from 'vitest';
import { themeColors, type ColorTokens, type ColorRoles, buildColorRoles } from '../../design-system/colors';
import { THEME_IDS, type ThemeId } from '../../hooks/useThemeColors';

const REQUIRED_COLOR_KEYS: (keyof ColorTokens)[] = [
  'bg', 'bgSurface', 'bgSurfaceHover', 'bgInput', 'bgOverlay',
  'text', 'textSecondary', 'textMuted',
  'accent', 'accentLight', 'accentMuted',
  'border', 'borderFocus',
  'success', 'successMuted',
  'warning', 'warningMuted',
  'danger', 'dangerMuted',
  'info', 'infoMuted',
  'shadow', 'glass', 'glassBorder', 'overlay',
];

const REQUIRED_ROLE_GROUPS: (keyof ColorRoles)[] = ['text', 'surface', 'action', 'status', 'border', 'focus', 'overlay'];

const ROLE_KEYS: Record<keyof ColorRoles, string[]> = {
  text: ['primary', 'secondary', 'inverse', 'muted'],
  surface: ['default', 'hover', 'active', 'disabled'],
  action: ['primary', 'secondary', 'danger'],
  status: ['success', 'warning', 'error', 'info'],
  border: ['default', 'subtle'],
  focus: ['default'],
  overlay: ['default'],
};

describe('Theme Validation', () => {
  describe.each(THEME_IDS)('%s', (themeId: ThemeId) => {
    it('has all required ColorTokens', () => {
      const colors = themeColors[themeId];
      for (const key of REQUIRED_COLOR_KEYS) {
        expect(colors).toHaveProperty(key);
        expect(typeof colors[key]).toBe('string');
        expect(colors[key]).toBeTruthy();
      }
    });

    it('produces all required ColorRoles', () => {
      const colors = themeColors[themeId];
      const roles = buildColorRoles(colors);
      for (const group of REQUIRED_ROLE_GROUPS) {
        const groupObj = roles[group];
        expect(groupObj).toBeDefined();
        for (const key of ROLE_KEYS[group]) {
          expect((groupObj as Record<string, string>)[key]).toBeTruthy();
        }
      }
    });

    it('has no duplicate token values between text and surface groups', () => {
      const colors = themeColors[themeId];
      const roles = buildColorRoles(colors);
      expect(roles.text.primary).not.toBe(roles.surface.default);
    });
  });

  it('has exactly 7 themes', () => {
    expect(THEME_IDS).toHaveLength(7);
  });

  it('every THEME_IDS entry exists in themeColors', () => {
    for (const id of THEME_IDS) {
      expect(themeColors[id]).toBeDefined();
    }
  });

  it('no theme uses black (#000000) for text or surface', () => {
    for (const id of THEME_IDS) {
      const c = themeColors[id];
      expect(c.text).not.toBe('#000000');
      expect(c.bgSurface).not.toBe('#000000');
    }
  });
});

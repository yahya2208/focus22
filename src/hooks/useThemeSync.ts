import { useEffect } from 'react';
import { useTheme, type ThemeId } from '../design-system/use-theme';
import { useSettings } from './useSettings';

function isDarkTheme(t: ThemeId): boolean {
  return t !== 'light';
}

export function useThemeSync() {
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();

  useEffect(() => {
    if (settings.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'midnight' : 'light');
    } else {
      setTheme(settings.theme as ThemeId);
    }
  }, [settings.theme, setTheme]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDarkTheme(theme) ? '#0a0a12' : '#f4f4f8');
    }
  }, [theme]);

  return { theme };
}

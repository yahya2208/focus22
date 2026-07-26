import { useEffect } from 'react';
import { useTheme } from '../design-system/use-theme';
import { useSettings } from './useSettings';

export function useThemeSync() {
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();

  useEffect(() => {
    if (settings.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    } else {
      setTheme(settings.theme);
    }
  }, [settings.theme, setTheme]);

  return { theme };
}

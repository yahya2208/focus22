import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';

export type ThemeId = 'midnight' | 'ocean' | 'emerald' | 'carbon' | 'purple' | 'sunrise' | 'light';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'midnight',
  setTheme: () => {},
});

const THEME_KEY = 'focus_theme';

function getInitialTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && isValidTheme(stored)) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'light';
}

function isValidTheme(v: string): v is ThemeId {
  return ['midnight', 'ocean', 'emerald', 'carbon', 'purple', 'sunrise', 'light'].includes(v);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getInitialTheme);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

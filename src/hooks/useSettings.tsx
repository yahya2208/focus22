import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import {
  getSettings,
  updateSettings,
  subscribeSettings,
  type AppSettings,
} from '../core/config/settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(getSettings);

  useEffect(() => {
    return subscribeSettings(setSettings);
  }, []);

  const update = useCallback((partial: Partial<AppSettings>) => {
    updateSettings(partial);
  }, []);

  return { settings, update };
}

const SettingsContext = createContext<ReturnType<typeof useSettings> | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const value = useSettings();
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsContext must be used within SettingsProvider');
  return ctx;
}

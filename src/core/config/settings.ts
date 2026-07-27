export interface AppSettings {
  theme: 'system' | 'midnight' | 'ocean' | 'emerald' | 'carbon' | 'purple' | 'sunrise' | 'light';
  reducedMotion: boolean;
  highContrast: boolean;
  language: string;
}

const SETTINGS_KEY = 'focus_settings';
const listeners = new Set<(s: AppSettings) => void>();

const defaultSettings: AppSettings = {
  theme: 'midnight',
  reducedMotion: false,
  highContrast: false,
  language: navigator.language.startsWith('ar') ? 'ar' : navigator.language.startsWith('tr') ? 'tr' : 'en',
};

function readSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

function writeSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  listeners.forEach((fn) => fn(settings));
}

export function getSettings(): AppSettings {
  return readSettings();
}

export function updateSettings(partial: Partial<AppSettings>) {
  const current = readSettings();
  writeSettings({ ...current, ...partial });
}

export function subscribeSettings(fn: (s: AppSettings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

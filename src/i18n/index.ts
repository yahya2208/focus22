import en from './translations/en';
import tr from './translations/tr';
import ar from './translations/ar';
import fr from './translations/fr';
import type { TranslationKey } from './types';

const translations = { en, tr, ar, fr } as const;

export type Locale = keyof typeof translations;

const localeNames: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  ar: 'العربية',
  fr: 'Français',
};

export function getLocaleName(locale: Locale): string {
  return localeNames[locale] ?? locale;
}

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

export type { TranslationKey };

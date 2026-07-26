import en from './translations/en';
import tr from './translations/tr';
import ar from './translations/ar';
import type { TranslationKey } from './types';

const translations = { en, tr, ar } as const;

export type Locale = keyof typeof translations;

const localeNames: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  ar: 'العربية',
};

export function getLocaleName(locale: Locale): string {
  return localeNames[locale] ?? locale;
}

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

export type { TranslationKey };

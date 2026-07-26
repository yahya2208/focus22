import { createContext, useContext, type ReactNode } from 'react';
import { useSettings } from './useSettings';
import { t as translate, type TranslationKey, type Locale } from '../i18n';

interface TranslationContextValue {
  t: (key: TranslationKey) => string;
  locale: Locale;
  dir: 'ltr' | 'rtl';
}

const TranslationContext = createContext<TranslationContextValue>({
  t: (key) => key,
  locale: 'en',
  dir: 'ltr',
});

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const locale = (settings.language as Locale) || 'en';
  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  const t = (key: TranslationKey): string => translate(locale, key);

  return (
    <TranslationContext.Provider value={{ t, locale, dir }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  return useContext(TranslationContext);
}

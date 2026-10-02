import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';

/** Greeting keyed off local hour (presentation only, no business meaning). */
export function greetingKey(hour: number): TranslationKey {
  if (hour >= 5 && hour < 12) return 'cc.greetMorning';
  if (hour >= 12 && hour < 18) return 'cc.greetAfternoon';
  return 'cc.greetEvening';
}

/**
 * Executive header (G1): personal greeting, date line, and nothing else.
 * No connection/sync indicators — no trustworthy source exists for them.
 */
export const AdminHeader = memo(function AdminHeader({ userName }: { userName: string }) {
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const dateLine = new Date().toLocaleDateString(locale === 'ar' ? 'ar-DZ' : locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.4rem',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: colors.text }}>
          {t(greetingKey(new Date().getHours()))}، {userName}
        </div>
        <div style={{ color: colors.textMuted, fontSize: '0.8rem', marginTop: '0.2rem' }}>{dateLine}</div>
      </div>
    </header>
  );
});

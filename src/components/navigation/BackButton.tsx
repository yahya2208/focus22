import { memo } from 'react';
import { useAppState } from '../../store/navigation';
import { useBack } from '../../core/navigation/BackProvider';
import { shouldShowBackAffordance } from '../../core/navigation/back-matrix';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Global top-back affordance (Phase 2.2). Rendered by AppShell only when the
 * active screen has a defined back target AND no in-content back button,
 * so the affordance never duplicates an existing control.
 */
export const BackButton = memo(function BackButton() {
  const { currentScreen, navStack } = useAppState();
  const back = useBack();
  const colors = useThemeColors();
  const { t, dir } = useTranslation();

  if (!shouldShowBackAffordance(currentScreen, navStack)) return null;

  const glyph = dir === 'rtl' ? '→' : '←';

  return (
    <button
      type="button"
      onClick={back}
      aria-label={t('back.title')}
      title={t('back.title')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '44px',
        height: '44px',
        borderRadius: '12px',
        border: `1px solid ${colors.border}`,
        background: colors.bgCard,
        color: colors.textSecondary,
        cursor: 'pointer',
        fontSize: '1.1rem',
        fontFamily: 'inherit',
        boxShadow: `0 4px 16px ${colors.shadow}`,
      }}
    >
      {glyph}
    </button>
  );
});

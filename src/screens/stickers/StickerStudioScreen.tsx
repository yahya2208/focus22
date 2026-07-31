import { memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import { StickerStudio } from '../../components/stickers/StickerStudio';

export const StickerStudioScreen = memo(function StickerStudioScreen() {
  const dispatch = useAppDispatch();
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <div style={{
      maxWidth: '900px', margin: '0 auto', padding: '0 1rem',
      minHeight: '100dvh',
    }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: colors.bg, padding: '0.75rem 0',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
          style={{
            background: colors.bgInput, border: `1px solid ${colors.borderLight}`,
            color: colors.textSecondary, borderRadius: '12px',
            padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          ←
        </button>
        <h1 style={{
          color: colors.text, fontSize: '1.2rem', fontWeight: 800, margin: 0,
          fontFamily: 'inherit',
        }}>
          {t('home.stickerStudio')}
        </h1>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'sticker-analytics' })}
          style={{
            background: colors.bgInput, border: `1px solid ${colors.borderLight}`,
            color: colors.textSecondary, borderRadius: '12px',
            padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.85rem',
          }}
        >
          {t('sticker.analytics')}
        </button>
      </div>
      <StickerStudio />
    </div>
  );
});

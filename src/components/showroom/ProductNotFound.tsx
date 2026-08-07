import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ProductNotFoundProps {
  onBack: () => void;
}

/** Product details not-found state (§3.3): deleted/unpublished/expired. */
export const ProductNotFound = memo(function ProductNotFound({ onBack }: ProductNotFoundProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div
      role="status"
      style={{
        borderRadius: '20px',
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ fontSize: '3rem' }}>📭</div>
      <h1 style={{ margin: 0, color: colors.text, fontSize: '1.1rem', fontWeight: 800 }}>
        {t('phoneDetails.notFoundTitle')}
      </h1>
      <p style={{ margin: 0, color: colors.textSecondary, fontSize: '0.85rem', lineHeight: 1.6, maxWidth: 320 }}>
        {t('phoneDetails.notFoundMessage')}
      </p>
      <button
        type="button"
        data-action="back-to-showroom"
        onClick={onBack}
        style={{
          padding: '0.65rem 1.4rem',
          background: colors.accent,
          color: '#000',
          border: 'none',
          borderRadius: '999px',
          fontWeight: 800,
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        ← {t('phoneDetails.backToShowroom')}
      </button>
    </div>
  );
});

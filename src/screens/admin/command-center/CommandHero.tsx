import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { GOLD, GOLD_GLOW, LUX_RADIUS } from './tokens';

/**
 * Command hero (G1): overline + approved slogan + supporting line with the
 * approved heart glyph (never the literal "<3", never emoji). No FOCUS
 * repetition — identity lives in the sidebar. Private-console tone, no
 * marketing gradients beyond one restrained gold wash.
 */
export const CommandHero = memo(function CommandHero() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <section
      aria-label={t('cc.heroLabel')}
      style={{
        borderRadius: LUX_RADIUS,
        padding: '1.8rem 2rem',
        marginBottom: '1.4rem',
        background: 'linear-gradient(150deg, rgba(216,180,106,0.10) 0%, #12121f 55%, #0a0a12 100%)',
        border: '1px solid rgba(216, 180, 106, 0.28)',
        boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 34px ${GOLD_GLOW}`,
      }}
    >
      <div style={{ color: GOLD, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
        {t('cc.heroOverline')}
      </div>
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: colors.text, lineHeight: 1.5 }}>
        {t('cc.heroSlogan')}
      </h1>
      <p style={{ margin: '0.4rem 0 0', color: colors.textSecondary, fontSize: '0.92rem', fontWeight: 500 }}>
        {t('cc.heroSupporting')}{' '}
        <span aria-hidden="true" style={{ color: colors.dangerText, fontSize: '0.85em' }}>
          ♥
        </span>
      </p>
    </section>
  );
});

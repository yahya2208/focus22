import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { LUX_RADIUS } from './tokens';

/**
 * Activity feed (G1): no aggregate event RPC exists, so this is an honest
 * empty state by design — NOT backfilled with fake rows. G2/G3 may wire a
 * real source; until then the panel documents its own absence.
 */
export const ActivityFeed = memo(function ActivityFeed() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <section
      aria-label={t('cc.activityLabel')}
      style={{
        background: '#12121f',
        border: `1px solid ${colors.border}`,
        borderRadius: LUX_RADIUS,
        padding: '1.2rem 1.3rem',
        minWidth: 0,
      }}
    >
      <h2 style={{ margin: '0 0 0.9rem', fontSize: '0.95rem', fontWeight: 800, color: '#D8B46A' }}>
        {t('cc.activityLabel')}
      </h2>
      <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '0.82rem', padding: '1rem 0' }}>
        {t('cc.activityEmpty')}
      </div>
    </section>
  );
});

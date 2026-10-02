import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { TranslationKey } from '../../../i18n';
import { GOLD, GOLD_GLOW, LUX_RADIUS } from './tokens';

export interface KpiDatum {
  readonly id: string;
  readonly labelKey: TranslationKey;
  /** Formatted display value (already localized by the caller). */
  readonly display: string;
  /** Source caption key suffix rendered under the value. */
  readonly sourceKey: TranslationKey;
  /** Optional scope qualifier appended to the source caption (e.g. store name). */
  readonly sourceExtra?: string;
  readonly featured?: boolean;
}

function formatDZD(n: number): string {
  return `${Number(n).toLocaleString('en-US')} دج`;
}

/**
 * KPI grid (G1). Every card shows its data source; unavailable data renders
 * "—" with an unavailable caption — never zeros disguised as data, never
 * revenue/profit (no trustworthy source exists). Numbers use tabular figures.
 */
export const KPIGrid = memo(function KPIGrid({ items }: { items: readonly KpiDatum[] }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <section
      aria-label={t('cc.kpiLabel')}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.4rem',
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            background: '#12121f',
            border: item.featured ? '1px solid rgba(216, 180, 106, 0.4)' : `1px solid ${colors.border}`,
            boxShadow: item.featured ? `0 0 24px ${GOLD_GLOW}` : 'none',
            borderRadius: LUX_RADIUS,
            padding: '1.1rem 1.2rem',
          }}
        >
          <div style={{ color: colors.textSecondary, fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>
            {t(item.labelKey)}
          </div>
          <div
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: item.featured ? GOLD : colors.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {item.display}
          </div>
          <div style={{ color: colors.textMuted, fontSize: '0.68rem', marginTop: '0.35rem' }}>
            {t(item.sourceKey)}
            {item.sourceExtra ? ` — ${item.sourceExtra}` : ''}
          </div>
        </div>
      ))}
    </section>
  );
});

export { formatDZD };

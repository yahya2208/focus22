import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { LUX_RADIUS } from './tokens';

export interface AttentionItem {
  readonly id: string;
  readonly text: string;
  readonly tone: 'gold' | 'danger' | 'teal';
}

const TONE: Record<AttentionItem['tone'], string> = {
  gold: '#D8B46A',
  danger: '#ff6b7a',
  teal: '#00e4b8',
};

/**
 * Attention panel (G1): only real, sourced items. Empty → calm empty state.
 */
export const AttentionPanel = memo(function AttentionPanel({ items }: { items: readonly AttentionItem[] }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <section
      aria-label={t('cc.attentionLabel')}
      style={{
        background: '#12121f',
        border: `1px solid ${colors.border}`,
        borderRadius: LUX_RADIUS,
        padding: '1.2rem 1.3rem',
        minWidth: 0,
      }}
    >
      <h2 style={{ margin: '0 0 0.9rem', fontSize: '0.95rem', fontWeight: 800, color: '#D8B46A' }}>
        {t('cc.attentionLabel')}
      </h2>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '0.82rem', padding: '1rem 0' }}>
          {t('cc.attentionEmpty')}
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.6rem 0', fontSize: '0.85rem', color: colors.text }}
          >
            <span
              aria-hidden="true"
              style={{ width: 9, height: 9, borderRadius: '50%', marginTop: '0.3rem', flexShrink: 0, background: TONE[item.tone] }}
            />
            <span>{item.text}</span>
          </div>
        ))
      )}
    </section>
  );
});

import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { Flex } from '../../../design-system/components/Flex';

// ============================================================================
// OrderReceiptCard — a modern grocery receipt. Quantities arrive pre-formatted
// ("1.5 كغ"), so no unit assumption lives here. Money is display-only.
// ============================================================================

export interface ReceiptLine {
  readonly name: string;
  readonly quantityText: string;
  readonly lineTotal: number | null;
}

export const OrderReceiptCard = memo(function OrderReceiptCard({
  lines,
  subtotal,
  deliveryFee,
  total,
  currency,
}: {
  lines: readonly ReceiptLine[];
  subtotal: number | null;
  deliveryFee: number | null;
  total: number;
  currency: string;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const money = (v: number) => `${v.toLocaleString()} ${currency}`;

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        padding: '1rem 1.1rem',
        background: colors.bgCard,
      }}
    >
      {lines.map((line, i) => (
        <Flex key={`${line.name}-${i}`} justify="space-between" align="center" gap="md" style={{ padding: '0.45rem 0' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{line.name}</div>
            <div style={{ color: colors.textSecondary, fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
              {line.quantityText}
            </div>
          </div>
          <span style={{ color: colors.textSecondary, fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {line.lineTotal != null ? money(line.lineTotal) : '—'}
          </span>
        </Flex>
      ))}
      <div style={{ borderTop: `1px dashed ${colors.borderLight}`, marginTop: '0.5rem', paddingTop: '0.6rem' }}>
        {subtotal != null && (
          <Flex justify="space-between" align="center">
            <span style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>{t('pilot.subtotal')}</span>
            <span style={{ color: colors.textSecondary, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>{money(subtotal)}</span>
          </Flex>
        )}
        {deliveryFee != null && (
          <Flex justify="space-between" align="center" style={{ marginTop: '0.25rem' }}>
            <span style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>{t('pilot.deliveryFee')}</span>
            <span style={{ color: colors.textSecondary, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>{money(deliveryFee)}</span>
          </Flex>
        )}
        <Flex justify="space-between" align="center" style={{ marginTop: '0.4rem' }}>
          <span style={{ color: colors.text, fontWeight: 800 }}>{t('pilot.orderTotal')}</span>
          <span style={{ color: colors.text, fontWeight: 800, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
            {money(total)}
          </span>
        </Flex>
      </div>
    </div>
  );
});

import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { PhoneActionId } from '../../services/whatsapp-service';
import type { InventoryRecord } from '../../services/inventory-service';

interface ProductActionBarProps {
  actions: readonly PhoneActionId[];
  device: InventoryRecord;
  onSelect: (action: PhoneActionId) => void;
}

const ACTION_META: Record<PhoneActionId, { icon: string; labelKey: string; color: keyof Pick<import('../../hooks/useThemeColors').ThemeColors, 'success' | 'accent' | 'info' | 'warning'> }> = {
  buy: { icon: '💬', labelKey: 'phoneDetails.actions.buy', color: 'success' },
  exchange: { icon: '🔄', labelKey: 'phoneDetails.actions.exchange', color: 'accent' },
  installment: { icon: '📩', labelKey: 'phoneDetails.actions.installment', color: 'info' },
  inquiry: { icon: '❓', labelKey: 'phoneDetails.actions.inquiry', color: 'warning' },
};

/**
 * Product details action bar (§3.2): exactly 4 actions — شراء / استبدال /
 * تقسيط / استفسار. No "بيع". Buttons carry `data-action` for CDP evidence.
 * M1 (Option A): contact-neutral icons + a clarifying note that the action is a
 * request to contact the owner via WhatsApp — not a platform transaction.
 */
export const ProductActionBar = memo(function ProductActionBar({
  actions,
  device,
  onSelect,
}: ProductActionBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div
      role="group"
      aria-label={t('phoneDetails.title')}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${actions.length}, 1fr)`, gap: '0.5rem' }}
    >
      {actions.map((action) => {
        const meta = ACTION_META[action];
        const color = colors[meta.color];
        return (
          <button
            key={action}
            type="button"
            data-action={action}
            aria-label={`${meta.icon} ${t(meta.labelKey as never)} — ${device.brand} ${device.model}`}
            onClick={() => onSelect(action)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.7rem 0.4rem',
              background: colors.bgCard,
              color: colors.text,
              border: `1px solid ${color}55`,
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'transform 120ms, border-color 120ms',
              fontFamily: 'inherit',
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)';
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{meta.icon}</span>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color }}>{t(meta.labelKey as never)}</span>
          </button>
        );
      })}
      <p
        style={{
          gridColumn: `span ${actions.length}`,
          margin: 0,
          textAlign: 'center',
          color: colors.textMuted,
          fontSize: '0.66rem',
          lineHeight: 1.5,
        }}
      >
        {t('phoneDetails.actions.whatsappNote' as never)}
      </p>
    </div>
  );
});

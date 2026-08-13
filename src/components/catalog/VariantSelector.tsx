import { memo } from 'react';
import { PHONE_VARIANTS, getDisplayVariants, type PhoneVariant, type StorageOnlyVariant } from '../../data/phone-variants';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useThemeStyles } from '../../hooks/useThemeStyles';
import { getAllVariants } from '../../services/catalog-service';

interface VariantSelectorProps {
  modelName?: string;
  brand?: string;
  showAll?: boolean;
  onSelect: (variant: PhoneVariant | StorageOnlyVariant) => void;
  selected?: string | null;
}

export const VariantSelector = memo(function VariantSelector({ modelName, brand, showAll, onSelect, selected }: VariantSelectorProps) {
  const colors = useThemeColors();
  const styles = useThemeStyles();
  const variants = showAll || !modelName ? getAllVariants() : getDisplayVariants(modelName, brand);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {variants.length === 0 ? (
        <div style={{ color: colors.textMuted, fontSize: '0.8rem', padding: '10px 4px', width: '100%' }}>
          إصدارات RAM والتخزين غير متوفرة لهذا الموديل.
        </div>
      ) : (
        variants.map(v => {
          const isSelected = selected === v.label;
          const hasRam = 'ram' in v;
          return (
            <button
              key={v.label}
              onClick={() => onSelect(v)}
              style={{
                ...(isSelected ? styles.tabActive : styles.tabInactive),
                padding: '10px 18px',
                borderRadius: '10px',
                border: isSelected ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
                background: isSelected ? colors.accent + '20' : colors.bgInput,
                color: isSelected ? colors.accent : colors.text,
                fontSize: '0.82rem', fontWeight: isSelected ? 700 : 400,
                transition: 'all 0.1s',
                minWidth: '70px',
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{v.label}</div>
              {hasRam && (
                <div style={{ fontSize: '0.6rem', color: isSelected ? colors.accent : colors.textMuted }}>
                  {v.ram} / {v.storage}
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
});

export const VariantQuickSelect = memo(function VariantQuickSelect({ onSelect, compact }: { onSelect: (variant: PhoneVariant) => void; compact?: boolean }) {
  const colors = useThemeColors();
  const styles = useThemeStyles();

  const commonVariants = PHONE_VARIANTS.filter(v =>
    ['4/64', '4/128', '6/128', '8/128', '8/256'].includes(v.label)
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '4px' : '6px' }}>
      {commonVariants.map(v => (
        <button key={v.label} onClick={() => onSelect(v)} style={{
          ...styles.tabInactive,
          padding: compact ? '6px 12px' : '8px 16px',
          border: `1px solid ${colors.borderLight}`,
          background: colors.bgInput, color: colors.text,
          fontSize: compact ? '0.72rem' : '0.8rem', fontWeight: 500,
        }}>
          {v.label}
        </button>
      ))}
      <button onClick={() => onSelect({ ram: '4GB' as const, storage: '64GB' as const, label: 'أخرى' })} style={{
        ...styles.tabInactive,
        background: 'transparent',
        padding: compact ? '6px 12px' : '8px 16px',
        border: `1px dashed ${colors.borderLight}`,
        color: colors.textMuted,
        fontSize: compact ? '0.72rem' : '0.8rem',
      }}>
        + أخرى
      </button>
    </div>
  );
});

import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface VariantEntry {
  label: string; ram: string | null; storage: string;
}

interface CatalogStepVariantProps {
  selectedBrand: string | null;
  selectedModel: string | null;
  currentVariants: VariantEntry[];
  selectedVariant: string | null;
  currentStock: { variant: string; stock: number }[];
  priceSummary: { lastBuy?: number; avgBuy?: number; lastSell?: number; avgSell?: number };
  onSelect: (ram: string | null, storage: string) => void;
  onSkipVariant: () => void;
  onBack: () => void;
}

function CatalogStepVariant({
  selectedBrand, selectedModel, currentVariants, selectedVariant,
  currentStock, priceSummary, onSelect, onSkipVariant, onBack,
}: CatalogStepVariantProps) {
  const colors = useThemeColors();
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '8px' }}>
        اختر النسخة — {selectedBrand} {selectedModel}
      </div>
      {selectedModel && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', background: colors.bgInput,
          marginBottom: '10px', border: `1px solid ${colors.borderLight}`,
        }}>
          <div style={{ fontWeight: 600, color: colors.text, fontSize: '0.9rem' }}>
            {selectedBrand} {selectedModel}
          </div>
          {currentStock.length > 0 && (
            <div style={{ marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {currentStock.map((s, i) => (
                <span key={i} style={{
                  fontSize: '0.7rem', color: s.stock > 3 ? colors.success : s.stock > 0 ? colors.warning : colors.danger,
                  background: s.stock > 3 ? colors.successBg : s.stock > 0 ? colors.warningBg : colors.dangerBg,
                  padding: '2px 8px', borderRadius: '4px',
                }}>
                  {s.variant}: {s.stock} جهاز
                </span>
              ))}
            </div>
          )}
          {(priceSummary.lastBuy || priceSummary.avgBuy) && (
            <div style={{ marginTop: '6px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.72rem', color: colors.textMuted }}>
              {priceSummary.lastBuy && <span>🟢 آخر شراء: {priceSummary.lastBuy.toLocaleString()}</span>}
              {priceSummary.avgBuy && <span>متوسط شراء: {priceSummary.avgBuy.toLocaleString()}</span>}
              {priceSummary.lastSell && <span>🔴 آخر بيع: {priceSummary.lastSell.toLocaleString()}</span>}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px' }}>
        {currentVariants.map(v => {
          const label = v.label;
          const stockInfo = currentStock.find(s => s.variant === label);
          const isSelected = selectedVariant === label;
          const stock = stockInfo?.stock ?? 0;
          const stockStatus = stock > 3 ? 'متوفر' : stock > 0 ? 'قليل' : 'نفد';
          const stockColor = stock > 3 ? colors.success : stock > 0 ? colors.warning : colors.danger;
          const stockBg = stock > 3 ? colors.successBg : stock > 0 ? colors.warningBg : colors.dangerBg;
          return (
            <button key={label} onClick={() => onSelect(v.ram, v.storage)} style={{
              padding: '10px', borderRadius: '10px',
              border: isSelected ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
              background: isSelected ? colors.accentLight : colors.bgCard,
              color: colors.text, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</span>
              {stockInfo !== undefined && (
                <span style={{
                  fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px',
                  color: stockColor, background: stockBg,
                }}>
                  {stockStatus} ({stock})
                </span>
              )}
            </button>
          );
        })}
      </div>
      {currentVariants.length === 0 && (
        <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '0.82rem', padding: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            لا توجد نسخ مسجلة لهذا الموديل
          </div>
          <button onClick={onSkipVariant} style={{
            padding: '10px 18px', borderRadius: '10px',
            border: `1px solid ${colors.accent}66`, background: 'transparent',
            color: colors.accent, cursor: 'pointer', fontSize: '0.82rem',
            fontWeight: 600, fontFamily: 'inherit',
          }}>
            متابعة بدون تحديد إصدار
          </button>
        </div>
      )}
      <button onClick={onBack} style={{
        marginTop: '8px', padding: '6px 12px', borderRadius: '6px',
        border: 'none', background: 'transparent', color: colors.textMuted,
        cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
      }}>
        ← رجوع
      </button>
    </div>
  );
}

export default memo(CatalogStepVariant);

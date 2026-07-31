import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface CatalogStepSeriesProps {
  selectedBrand: string | null;
  currentSeries: string[];
  selectedSeries: string | null;
  currentModelsCount: number;
  onSelect: (series: string) => void;
  onShowAll: () => void;
  onBack: () => void;
}

function CatalogStepSeries({ selectedBrand, currentSeries, selectedSeries, currentModelsCount, onSelect, onShowAll, onBack }: CatalogStepSeriesProps) {
  const colors = useThemeColors();
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '8px' }}>
        اختر السلسلة — {selectedBrand}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {currentSeries.map(s => (
          <button key={s} onClick={() => onSelect(s)} style={{
            padding: '8px 16px', borderRadius: '8px',
            border: selectedSeries === s ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
            background: selectedSeries === s ? colors.accentLight : colors.bgInput,
            color: selectedSeries === s ? colors.accent : colors.text,
            cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit',
            fontWeight: selectedSeries === s ? 700 : 400,
          }}>
            {s}
          </button>
        ))}
      </div>
      {currentModelsCount > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ color: colors.textMuted, fontSize: '0.7rem', marginBottom: '6px' }}>جميع موديلات {selectedBrand}</div>
          <button onClick={onShowAll} style={{
            padding: '6px 12px', borderRadius: '6px',
            border: `1px solid ${colors.borderLight}`, background: colors.bgInput,
            color: colors.text, cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
          }}>
            عرض الكل ({currentModelsCount})
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

export default memo(CatalogStepSeries);

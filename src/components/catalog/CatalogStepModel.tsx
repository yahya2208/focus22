import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ModelEntry {
  name: string; id: string; series: string | null;
}

interface CatalogStepModelProps {
  selectedBrand: string | null;
  selectedSeries: string | null;
  currentModels: ModelEntry[];
  selectedModel: string | null;
  onSelect: (model: { name: string; id: string }) => void;
  onBack: () => void;
}

function CatalogStepModel({ selectedBrand, selectedSeries, currentModels, selectedModel, onSelect, onBack }: CatalogStepModelProps) {
  const colors = useThemeColors();
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '8px' }}>
        اختر الموديل — {selectedBrand}{selectedSeries ? ` / ${selectedSeries}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
        {currentModels.map(m => (
          <button key={m.id || m.name} onClick={() => onSelect(m)} style={{
            padding: '8px 10px', borderRadius: '8px',
            border: selectedModel === m.name ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
            background: selectedModel === m.name ? colors.accentLight : colors.bgInput,
            color: selectedModel === m.name ? colors.accent : colors.text,
            cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
            textAlign: 'right', fontWeight: selectedModel === m.name ? 700 : 400,
          }}>
            {m.name}
          </button>
        ))}
      </div>
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

export default memo(CatalogStepModel);

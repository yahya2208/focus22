import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface Brand {
  name: string; series: string[]; id: string;
}

interface CatalogStepBrandProps {
  availableBrands: Brand[];
  selectedBrand: string | null;
  onSelect: (brand: string) => void;
  onBack: () => void;
}

function CatalogStepBrand({ availableBrands, selectedBrand, onSelect, onBack }: CatalogStepBrandProps) {
  const colors = useThemeColors();
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '8px' }}>اختر العلامة التجارية</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
        {availableBrands.map(b => (
          <button key={b.name} onClick={() => onSelect(b.name)} style={{
            padding: '8px 10px', borderRadius: '8px',
            border: selectedBrand === b.name ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
            background: selectedBrand === b.name ? colors.accentLight : colors.bgInput,
            color: selectedBrand === b.name ? colors.accent : colors.text,
            cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
            textAlign: 'center', fontWeight: selectedBrand === b.name ? 700 : 400,
          }}>
            {b.name}
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

export default memo(CatalogStepBrand);

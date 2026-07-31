import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { ALL_CONDITIONS, type DeviceCondition } from '../../services/price-memory';

interface CatalogStepConditionProps {
  selectedCondition: DeviceCondition | null;
  onSelect: (cond: DeviceCondition) => void;
  onBack: () => void;
}

function CatalogStepCondition({ selectedCondition, onSelect, onBack }: CatalogStepConditionProps) {
  const colors = useThemeColors();
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '8px' }}>اختر الحالة</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px' }}>
        {ALL_CONDITIONS.map(cond => (
          <button key={cond} onClick={() => onSelect(cond)} style={{
            padding: '8px 12px', borderRadius: '8px',
            border: selectedCondition === cond ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
            background: selectedCondition === cond ? colors.accentLight : colors.bgInput,
            color: selectedCondition === cond ? colors.accent : colors.text,
            cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit',
            fontWeight: selectedCondition === cond ? 700 : 400,
          }}>
            {cond}
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

export default memo(CatalogStepCondition);

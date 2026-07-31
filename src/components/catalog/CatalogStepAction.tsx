import { memo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface CatalogStepActionProps {
  selectedOperation: string | null;
  onSelect: (op: string) => void;
  onBack: () => void;
}

function CatalogStepAction({ selectedOperation, onSelect, onBack }: CatalogStepActionProps) {
  const colors = useThemeColors();
  return (
    <div>
      <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginBottom: '8px' }}>اختر العملية</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['buy', 'sell', 'exchange', 'trade_in'] as const).map(op => (
          <button key={op} onClick={() => onSelect(op)} style={{
            padding: '10px 20px', borderRadius: '10px',
            border: selectedOperation === op ? `2px solid ${colors.accent}` : `1px solid ${colors.borderLight}`,
            background: selectedOperation === op ? colors.accentLight : colors.bgInput,
            color: selectedOperation === op ? colors.accent : colors.text,
            cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit',
            fontWeight: selectedOperation === op ? 700 : 400,
          }}>
            {op === 'buy' ? 'شراء' : op === 'sell' ? 'بيع' : op === 'exchange' ? 'استبدال' : 'Trade-in'}
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

export default memo(CatalogStepAction);

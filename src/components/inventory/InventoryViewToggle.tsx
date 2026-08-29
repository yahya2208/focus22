import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';

export type View = 'dashboard' | 'add' | 'add-car' | 'add-property' | 'add-produce' | 'transactions';

interface InventoryViewToggleProps {
  view: View;
  onViewChange: (view: View) => void;
  colors: ThemeColors;
}

const LABELS: Record<View, string> = {
  dashboard: 'المخزون',
  add: 'إضافة',
  'add-car': '+ سيارة',
  'add-property': '+ عقار',
  'add-produce': '+ منتج',
  transactions: 'الحركات',
};

export const InventoryViewToggle = memo(function InventoryViewToggle({ view, onViewChange, colors }: InventoryViewToggleProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {(Object.keys(LABELS) as View[]).map(v => (
        <button key={v} onClick={() => onViewChange(v)} style={{
          padding: '6px 14px', borderRadius: '8px', border: 'none',
          background: view === v ? colors.accent : colors.bgInput,
          color: view === v ? '#fff' : colors.textMuted,
          fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
});

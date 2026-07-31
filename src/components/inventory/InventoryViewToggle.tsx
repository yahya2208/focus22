import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';

export type View = 'dashboard' | 'add' | 'transactions';

interface InventoryViewToggleProps {
  view: View;
  onViewChange: (view: View) => void;
  colors: ThemeColors;
}

export const InventoryViewToggle = memo(function InventoryViewToggle({ view, onViewChange, colors }: InventoryViewToggleProps) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {(['dashboard', 'add', 'transactions'] as View[]).map(v => (
        <button key={v} onClick={() => onViewChange(v)} style={{
          padding: '6px 14px', borderRadius: '8px', border: 'none',
          background: view === v ? colors.accent : colors.bgInput,
          color: view === v ? '#fff' : colors.textMuted,
          fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {v === 'dashboard' ? 'المخزون' : v === 'add' ? 'إضافة' : 'الحركات'}
        </button>
      ))}
    </div>
  );
});

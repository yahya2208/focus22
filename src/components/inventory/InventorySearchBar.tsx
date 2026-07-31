import { memo } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';

interface InventorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  colors: ThemeColors;
}

export const InventorySearchBar = memo(function InventorySearchBar({ value, onChange, colors }: InventorySearchBarProps) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      placeholder="ابحث في المخزون..."
      style={{
        width: '100%', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${colors.border}`,
        background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
  );
});

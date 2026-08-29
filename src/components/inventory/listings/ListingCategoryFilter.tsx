import { memo } from 'react';
import type { ThemeColors } from '../../../hooks/useThemeColors';

export type CategoryFilter = 'all' | 'phone' | 'car' | 'property';

interface ListingCategoryFilterProps {
  value: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  colors: ThemeColors;
  counts?: Partial<Record<CategoryFilter, number>>;
}

const OPTIONS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'phone', label: 'الهواتف' },
  { key: 'car', label: 'السيارات' },
  { key: 'property', label: 'العقارات' },
];

export const ListingCategoryFilter = memo(function ListingCategoryFilter({ value, onChange, colors, counts }: ListingCategoryFilterProps) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {OPTIONS.map(({ key, label }) => {
        const active = value === key;
        const count = counts?.[key];
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: '5px 12px',
              borderRadius: '999px',
              border: `1px solid ${active ? colors.accent : colors.border}`,
              background: active ? colors.accent : 'transparent',
              color: active ? '#fff' : colors.textMuted,
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {label}
            {count != null ? ` (${count})` : ''}
          </button>
        );
      })}
    </div>
  );
});

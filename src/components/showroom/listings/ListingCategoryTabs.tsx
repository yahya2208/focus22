import { memo } from 'react';
import { Chip } from '../../../design-system/components/Chip';
import { useTranslation } from '../../../hooks/useTranslation';
import type { ShowroomCategory } from '../../../hooks/useShowroomState';

interface ListingCategoryTabsProps {
  value: ShowroomCategory;
  onChange: (category: ShowroomCategory) => void;
}

/**
 * P8.5 public category tabs. Labels come from the typed t() dictionaries
 * (shell-level strings follow the showroom convention). 'phone' is the
 * default and keeps the legacy phone surface untouched.
 */
export const ListingCategoryTabs = memo(function ListingCategoryTabs({
  value,
  onChange,
}: ListingCategoryTabsProps) {
  const { t } = useTranslation();

  const tabs: readonly { key: ShowroomCategory; labelKey: string }[] = [
    { key: 'phone', labelKey: 'showroom.catPhones' },
    { key: 'car', labelKey: 'showroom.catCars' },
    { key: 'property', labelKey: 'showroom.catProperties' },
  ];

  return (
    <div role="tablist" aria-label="listing category" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
      {tabs.map((tab) => (
        <Chip
          key={tab.key}
          variant="selectable"
          selected={value === tab.key}
          onSelect={() => {
            if (tab.key !== value) onChange(tab.key);
          }}
        >
          <span role="tab" aria-selected={value === tab.key}>
            {t(tab.labelKey as never)}
          </span>
        </Chip>
      ))}
    </div>
  );
});

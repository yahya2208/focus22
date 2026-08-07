import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getGlobalTelemetry } from '../../core/telemetry';
import { EventTypes } from '../../core/analytics/events';
import { Input } from '../../design-system/components/Input';
import { Chip } from '../../design-system/components/Chip';
import type { InventoryRecord } from '../../services/inventory-service';
import {
  getAvailableCities,
  type ShowroomConditionFilter,
  type ShowroomSort,
  type ShowroomUiState,
} from '../../hooks/useShowroomState';

interface ShowroomControlsProps {
  devices: readonly InventoryRecord[];
  state: ShowroomUiState;
  onChange: (patch: Partial<ShowroomUiState>) => void;
}

const CONDITION_OPTIONS: readonly { value: ShowroomConditionFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'showroom.filterAll' },
  { value: 'new', labelKey: 'showroom.filterNew' },
  { value: 'used', labelKey: 'showroom.filterUsed' },
];

const SORT_OPTIONS: readonly { value: ShowroomSort; labelKey: string }[] = [
  { value: 'latest', labelKey: 'showroom.sortLatest' },
  { value: 'cheapest', labelKey: 'showroom.sortCheapest' },
  { value: 'expensive', labelKey: 'showroom.sortExpensive' },
];

export const ShowroomControls = memo(function ShowroomControls({
  devices,
  state,
  onChange,
}: ShowroomControlsProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const cities = getAvailableCities(devices);

  const handleCondition = (value: ShowroomConditionFilter) => {
    if (value === state.condition) return;
    getGlobalTelemetry().track(EventTypes.SHOWROOM_FILTER_CHANGED, { filter: 'condition', value });
    onChange({ condition: value });
  };

  const handleCity = (value: string) => {
    const next = state.city === value ? '' : value;
    if (next === state.city) return;
    getGlobalTelemetry().track(EventTypes.SHOWROOM_FILTER_CHANGED, { filter: 'city', value: next || 'all' });
    onChange({ city: next });
  };

  const handleSort = (value: ShowroomSort) => {
    if (value === state.sort) return;
    getGlobalTelemetry().track(EventTypes.SHOWROOM_SORT_CHANGED, { sort: value });
    onChange({ sort: value });
  };

  return (
    <div
      style={{
        borderRadius: '18px',
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        padding: '0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <Input
        type="search"
        value={state.query}
        onChange={(e) => onChange({ query: e.target.value })}
        placeholder={t('showroom.search')}
        aria-label={t('showroom.search')}
        style={{ width: '100%' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
        {CONDITION_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            variant="selectable"
            selected={state.condition === option.value}
            onSelect={() => handleCondition(option.value)}
          >
            {t(option.labelKey as never)}
          </Chip>
        ))}
        {cities.map((city) => (
          <Chip
            key={city}
            variant="selectable"
            selected={state.city === city}
            onSelect={() => handleCity(city)}
            icon={<span>📍</span>}
          >
            {city}
          </Chip>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {t('showroom.sort')}:
        </span>
        <select
          value={state.sort}
          onChange={(e) => handleSort(e.target.value as ShowroomSort)}
          aria-label={t('showroom.sort')}
          style={{
            flex: 1,
            background: colors.bgInput,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: '10px',
            padding: '8px 10px',
            fontSize: '0.8rem',
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey as never)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
});

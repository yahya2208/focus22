import { useCallback, useReducer } from 'react';
import type { InventoryRecord } from '../services/inventory-service';

/**
 * Session-only module registry `showroom-ui-state` (v5.1 §6, §13).
 * NOT persisted across app reloads; keeps the exact Showroom UI state
 * (scroll + search + filters + sort) so BACK from phone-details restores it.
 */
export type ShowroomConditionFilter = 'all' | 'new' | 'used';
export type ShowroomSort = 'latest' | 'cheapest' | 'expensive';
/** P8.5 — public showroom category. 'phone' is the untouched default. */
export type ShowroomCategory = 'phone' | 'car' | 'property' | 'produce';

export interface ShowroomUiState {
  scrollY: number;
  query: string;
  condition: ShowroomConditionFilter;
  city: string;
  sort: ShowroomSort;
  category: ShowroomCategory;
}

export const showroomUiState: ShowroomUiState = {
  scrollY: 0,
  query: '',
  condition: 'all',
  city: '',
  sort: 'latest',
  category: 'phone',
};

export function resetShowroomUiState(): void {
  showroomUiState.scrollY = 0;
  showroomUiState.query = '';
  showroomUiState.condition = 'all';
  showroomUiState.city = '';
  showroomUiState.sort = 'latest';
  showroomUiState.category = 'phone';
}

export function useShowroomState() {
  const [, force] = useReducer((c: number) => c + 1, 0);

  const update = useCallback((patch: Partial<ShowroomUiState>) => {
    Object.assign(showroomUiState, patch);
    force();
  }, []);

  const setScrollY = useCallback((y: number) => {
    showroomUiState.scrollY = y;
  }, []);

  return { state: showroomUiState, update, setScrollY };
}

export function getAvailableCities(devices: readonly InventoryRecord[]): string[] {
  const seen = new Set<string>();
  for (const device of devices) {
    const city = device.city?.trim();
    if (city) seen.add(city);
  }
  return [...seen];
}

export function filterAndSortDevices(
  devices: readonly InventoryRecord[],
  filter: Pick<ShowroomUiState, 'query' | 'condition' | 'city' | 'sort'>,
): InventoryRecord[] {
  const query = filter.query.trim().toLowerCase();
  const condition = filter.condition;
  const city = filter.city.trim();

  let out = devices.filter((device) => {
    if (query) {
      const haystack = `${device.brand} ${device.model} ${device.variant}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (condition === 'new' && device.condition.toLowerCase() !== 'new') return false;
    if (condition === 'used' && device.condition.toLowerCase() === 'new') return false;
    if (city && (device.city ?? '').trim() !== city) return false;
    return true;
  });

  switch (filter.sort) {
    case 'cheapest':
      out = [...out].sort((a, b) => (a.sellPrice ?? Number.MAX_SAFE_INTEGER) - (b.sellPrice ?? Number.MAX_SAFE_INTEGER));
      break;
    case 'expensive':
      out = [...out].sort((a, b) => (b.sellPrice ?? Number.MIN_SAFE_INTEGER) - (a.sellPrice ?? Number.MIN_SAFE_INTEGER));
      break;
    case 'latest':
    default:
      out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
  }

  return out;
}

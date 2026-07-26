export interface ResearchFilters {
  readonly dateFrom: number | null;
  readonly dateTo: number | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly campaign: string | null;
  readonly device: string | null;
  readonly browser: string | null;
  readonly os: string | null;
  readonly ageRange: readonly [number, number] | null;
  readonly gender: string | null;
  readonly education: string | null;
  readonly sleepHours: readonly [number, number] | null;
  readonly coffee: string | null;
  readonly sport: string | null;
  readonly handedness: string | null;
  readonly game: string | null;
  readonly authType: 'guest' | 'registered' | null;
}

export type FilterKey = keyof ResearchFilters;

export interface FilterChange {
  readonly key: FilterKey;
  readonly value: unknown;
}

const EMPTY_FILTERS: ResearchFilters = {
  dateFrom: null, dateTo: null, country: null, city: null,
  campaign: null, device: null, browser: null, os: null,
  ageRange: null, gender: null, education: null,
  sleepHours: null, coffee: null, sport: null, handedness: null,
  game: null, authType: null,
};

export function createEmptyFilters(): ResearchFilters {
  return EMPTY_FILTERS;
}

export function hasActiveFilters(filters: ResearchFilters): boolean {
  for (const key of Object.keys(filters) as FilterKey[]) {
    if (filters[key] !== null && filters[key] !== undefined) return true;
  }
  return false;
}

export function getActiveFilterCount(filters: ResearchFilters): number {
  let count = 0;
  for (const key of Object.keys(filters) as FilterKey[]) {
    if (filters[key] !== null && filters[key] !== undefined) count++;
  }
  return count;
}

export function resetFilter(filters: ResearchFilters, key: FilterKey): ResearchFilters {
  return { ...filters, [key]: null };
}

export function resetAllFilters(): ResearchFilters {
  return EMPTY_FILTERS;
}

export function updateFilter<K extends FilterKey>(
  filters: ResearchFilters,
  key: K,
  value: ResearchFilters[K],
): ResearchFilters {
  return { ...filters, [key]: value };
}

export function serializeFilters(filters: ResearchFilters): string {
  const entries: [string, string][] = [];
  for (const key of Object.keys(filters) as FilterKey[]) {
    const val = filters[key];
    if (val !== null && val !== undefined) {
      entries.push([key, Array.isArray(val) ? val.join('-') : String(val)]);
    }
  }
  return new URLSearchParams(entries).toString();
}

export function deserializeFilters(queryString: string): ResearchFilters {
  const params = new URLSearchParams(queryString);
  const filters = { ...EMPTY_FILTERS };
  for (const [key, value] of params.entries()) {
    if (key in filters) {
      (filters as Record<string, unknown>)[key] = value;
    }
  }
  return filters;
}

export type FilterListener = (filters: ResearchFilters) => void;

export interface FilterStore {
  getFilters(): ResearchFilters;
  updateFilter<K extends FilterKey>(key: K, value: ResearchFilters[K]): void;
  resetFilter(key: FilterKey): void;
  resetAll(): void;
  onChange(handler: FilterListener): () => void;
  applyFilters<T extends { readonly createdAt?: number }>(
    data: readonly T[],
    filterFn: (item: T, filters: ResearchFilters) => boolean,
  ): readonly T[];
}

export function createFilterStore(): FilterStore {
  let filters = createEmptyFilters();
  const listeners = new Set<FilterListener>();

  function notify() {
    for (const handler of listeners) {
      try { handler(filters); } catch { /* ignore */ }
    }
  }

  return {
    getFilters(): ResearchFilters {
      return filters;
    },

    updateFilter(key, value) {
      filters = updateFilter(filters, key, value);
      notify();
    },

    resetFilter(key) {
      filters = resetFilter(filters, key);
      notify();
    },

    resetAll() {
      filters = resetAllFilters();
      notify();
    },

    onChange(handler: FilterListener): () => void {
      listeners.add(handler);
      return () => { listeners.delete(handler); };
    },

    applyFilters(data, filterFn) {
      return data.filter((item) => filterFn(item, filters));
    },
  };
}

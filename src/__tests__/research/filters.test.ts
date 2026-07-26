import { describe, it, expect } from 'vitest';
import {
  createEmptyFilters, hasActiveFilters, getActiveFilterCount,
  resetFilter, updateFilter,
  serializeFilters, deserializeFilters, createFilterStore,
} from '../../core/research/filters';

describe('ResearchFilters', () => {
  describe('createEmptyFilters', () => {
    it('returns all null fields', () => {
      const f = createEmptyFilters();
      expect(f.dateFrom).toBeNull();
      expect(f.dateTo).toBeNull();
      expect(f.country).toBeNull();
      expect(f.game).toBeNull();
      expect(f.authType).toBeNull();
    });
  });

  describe('hasActiveFilters', () => {
    it('returns false for empty filters', () => {
      expect(hasActiveFilters(createEmptyFilters())).toBe(false);
    });

    it('returns true when a field is set', () => {
      expect(hasActiveFilters({ ...createEmptyFilters(), country: 'US' })).toBe(true);
    });
  });

  describe('getActiveFilterCount', () => {
    it('returns 0 for empty filters', () => {
      expect(getActiveFilterCount(createEmptyFilters())).toBe(0);
    });

    it('counts non-null fields', () => {
      const f = { ...createEmptyFilters(), country: 'US', game: 'reaction-light' };
      expect(getActiveFilterCount(f)).toBe(2);
    });
  });

  describe('updateFilter', () => {
    it('sets a field value', () => {
      const f = updateFilter(createEmptyFilters(), 'country', 'DE');
      expect(f.country).toBe('DE');
    });

    it('does not mutate original', () => {
      const original = createEmptyFilters();
      const updated = updateFilter(original, 'game', 'reaction-light');
      expect(original.game).toBeNull();
      expect(updated.game).toBe('reaction-light');
    });
  });

  describe('resetFilter', () => {
    it('sets a specific field to null', () => {
      const f = updateFilter(createEmptyFilters(), 'country', 'FR');
      const r = resetFilter(f, 'country');
      expect(r.country).toBeNull();
    });
  });

  describe('resetAllFilters', () => {
    it('returns all-null filters', () => {
      const store = createFilterStore();
      store.updateFilter('game', 'x');
      store.resetAll();
      const r = store.getFilters();
      expect(r.game).toBeNull();
      expect(hasActiveFilters(r)).toBe(false);
    });
  });

  describe('serializeFilters / deserializeFilters', () => {
    it('round-trips non-null filters', () => {
      const f = { ...createEmptyFilters(), country: 'US', game: 'reaction-light' };
      const s = serializeFilters(f);
      const d = deserializeFilters(s);
      expect(d.country).toBe('US');
      expect(d.game).toBe('reaction-light');
    });

    it('ignores null fields in serialization', () => {
      const s = serializeFilters(createEmptyFilters());
      expect(s).toBe('');
    });
  });

  describe('FilterStore', () => {
    it('starts with empty filters', () => {
      const store = createFilterStore();
      expect(store.getFilters()).toEqual(createEmptyFilters());
    });

    it('updates filters and notifies listeners', () => {
      const store = createFilterStore();
      let notified = false;
      store.onChange(() => { notified = true; });
      store.updateFilter('country', 'JP');
      expect(store.getFilters().country).toBe('JP');
      expect(notified).toBe(true);
    });

    it('resets a single filter', () => {
      const store = createFilterStore();
      store.updateFilter('game', 'reaction-light');
      store.resetFilter('game');
      expect(store.getFilters().game).toBeNull();
    });

    it('resets all filters', () => {
      const store = createFilterStore();
      store.updateFilter('country', 'US');
      store.updateFilter('game', 'x');
      store.resetAll();
      expect(hasActiveFilters(store.getFilters())).toBe(false);
    });

    it('unsubscribe stops notifications', () => {
      const store = createFilterStore();
      let count = 0;
      const unsub = store.onChange(() => { count++; });
      store.updateFilter('country', 'US');
      unsub();
      store.updateFilter('game', 'x');
      expect(count).toBe(1);
    });

    it('applies filters to data', () => {
      const store = createFilterStore();
      store.updateFilter('game', 'reaction-light');
      const data = [
        { createdAt: 1, game: 'reaction-light', score: 10 },
        { createdAt: 2, game: 'other', score: 20 },
      ];
      const filtered = store.applyFilters(data, (item, filters) => (item as Record<string, unknown>).game === filters.game);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.score).toBe(10);
    });
  });
});

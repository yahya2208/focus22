import { describe, it, expect } from 'vitest';
import { createCohortBuilder, createCohortStore } from '../../core/research/cohort';

describe('CohortBuilder', () => {
  describe('basic operations', () => {
    it('starts with empty conditions', () => {
      const b = createCohortBuilder();
      expect(b.getDefinition().conditions).toHaveLength(0);
      expect(b.getDefinition().logic).toBe('and');
      expect(b.getDefinition().name).toBe('New Cohort');
    });

    it('adds conditions', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'age', operator: 'greater_than', value: 18 });
      expect(b.getDefinition().conditions).toHaveLength(1);
    });

    it('removes conditions', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'age', operator: 'greater_than', value: 18 });
      b.addCondition({ field: 'country', operator: 'equals', value: 'US' });
      b.removeCondition(0);
      expect(b.getDefinition().conditions).toHaveLength(1);
      expect(b.getDefinition().conditions[0]!.field).toBe('country');
    });

    it('updates conditions', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'age', operator: 'greater_than', value: 18 });
      b.updateCondition(0, { field: 'age', operator: 'less_than', value: 65 });
      expect(b.getDefinition().conditions[0]!.operator).toBe('less_than');
    });

    it('sets logic', () => {
      const b = createCohortBuilder();
      b.setLogic('or');
      expect(b.getDefinition().logic).toBe('or');
    });

    it('sets name', () => {
      const b = createCohortBuilder();
      b.setName('Young Users');
      expect(b.getDefinition().name).toBe('Young Users');
    });
  });

  describe('evaluate', () => {
    it('returns true for empty conditions', () => {
      const b = createCohortBuilder();
      expect(b.evaluate({ name: 'test' })).toBe(true);
    });

    it('evaluates equals', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'status', operator: 'equals', value: 'active' });
      expect(b.evaluate({ status: 'active' })).toBe(true);
      expect(b.evaluate({ status: 'inactive' })).toBe(false);
    });

    it('evaluates not_equals', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'status', operator: 'not_equals', value: 'banned' });
      expect(b.evaluate({ status: 'active' })).toBe(true);
      expect(b.evaluate({ status: 'banned' })).toBe(false);
    });

    it('evaluates greater_than', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'score', operator: 'greater_than', value: 50 });
      expect(b.evaluate({ score: 75 })).toBe(true);
      expect(b.evaluate({ score: 25 })).toBe(false);
    });

    it('evaluates less_than', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'score', operator: 'less_than', value: 50 });
      expect(b.evaluate({ score: 25 })).toBe(true);
      expect(b.evaluate({ score: 75 })).toBe(false);
    });

    it('evaluates gte', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'score', operator: 'gte', value: 50 });
      expect(b.evaluate({ score: 50 })).toBe(true);
      expect(b.evaluate({ score: 49 })).toBe(false);
    });

    it('evaluates lte', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'score', operator: 'lte', value: 50 });
      expect(b.evaluate({ score: 50 })).toBe(true);
      expect(b.evaluate({ score: 51 })).toBe(false);
    });

    it('evaluates between', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'age', operator: 'between', value: [18, 35] });
      expect(b.evaluate({ age: 25 })).toBe(true);
      expect(b.evaluate({ age: 15 })).toBe(false);
      expect(b.evaluate({ age: 40 })).toBe(false);
    });

    it('evaluates not_between', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'age', operator: 'not_between', value: [18, 35] });
      expect(b.evaluate({ age: 15 })).toBe(true);
      expect(b.evaluate({ age: 25 })).toBe(false);
    });

    it('evaluates in', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'color', operator: 'in', value: ['red', 'blue'] });
      expect(b.evaluate({ color: 'red' })).toBe(true);
      expect(b.evaluate({ color: 'green' })).toBe(false);
    });

    it('evaluates not_in', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'color', operator: 'not_in', value: ['red', 'blue'] });
      expect(b.evaluate({ color: 'green' })).toBe(true);
      expect(b.evaluate({ color: 'red' })).toBe(false);
    });

    it('evaluates contains', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'name', operator: 'contains', value: 'test' });
      expect(b.evaluate({ name: 'my_test_case' })).toBe(true);
      expect(b.evaluate({ name: 'production' })).toBe(false);
    });

    it('evaluates starts_with', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'email', operator: 'starts_with', value: 'admin' });
      expect(b.evaluate({ email: 'admin@example.com' })).toBe(true);
      expect(b.evaluate({ email: 'user@example.com' })).toBe(false);
    });

    it('AND logic requires all conditions', () => {
      const b = createCohortBuilder();
      b.setLogic('and');
      b.addCondition({ field: 'age', operator: 'greater_than', value: 18 });
      b.addCondition({ field: 'country', operator: 'equals', value: 'US' });
      expect(b.evaluate({ age: 25, country: 'US' })).toBe(true);
      expect(b.evaluate({ age: 25, country: 'DE' })).toBe(false);
    });

    it('OR logic requires any condition', () => {
      const b = createCohortBuilder();
      b.setLogic('or');
      b.addCondition({ field: 'age', operator: 'greater_than', value: 18 });
      b.addCondition({ field: 'country', operator: 'equals', value: 'US' });
      expect(b.evaluate({ age: 10, country: 'US' })).toBe(true);
      expect(b.evaluate({ age: 25, country: 'DE' })).toBe(true);
      expect(b.evaluate({ age: 10, country: 'DE' })).toBe(false);
    });
  });

  describe('filter', () => {
    it('filters array of records', () => {
      const b = createCohortBuilder();
      b.addCondition({ field: 'score', operator: 'greater_than', value: 50 });
      const data = [
        { score: 30 },
        { score: 60 },
        { score: 80 },
      ];
      expect(b.filter(data)).toHaveLength(2);
    });
  });

  describe('save', () => {
    it('creates a saved cohort with id', () => {
      const b = createCohortBuilder();
      b.setName('Test Cohort');
      b.addCondition({ field: 'age', operator: 'gte', value: 18 });
      const s = b.save();
      expect(s.id).toMatch(/^cohort_/);
      expect(s.definition.name).toBe('Test Cohort');
      expect(s.autoUpdate).toBe(true);
    });
  });

  describe('load', () => {
    it('loads an existing definition', () => {
      const b = createCohortBuilder();
      b.load({
        name: 'Loaded',
        conditions: [{ field: 'x', operator: 'equals', value: 1 }],
        logic: 'or',
      });
      expect(b.getDefinition().name).toBe('Loaded');
      expect(b.getDefinition().conditions).toHaveLength(1);
      expect(b.getDefinition().logic).toBe('or');
    });

    it('deep copies conditions on load', () => {
      const b = createCohortBuilder();
      const def = {
        name: 'Test',
        conditions: [{ field: 'x', operator: 'equals' as const, value: 1 }],
        logic: 'and' as const,
      };
      b.load(def);
      b.addCondition({ field: 'y', operator: 'equals', value: 2 });
      expect(def.conditions).toHaveLength(1);
    });
  });

  describe('initialize with existing', () => {
    it('uses existing definition', () => {
      const existing = {
        id: 'existing',
        definition: { name: 'Old', conditions: [], logic: 'and' as const },
        memberCount: 0,
        createdAt: 0,
        updatedAt: 0,
        autoUpdate: true,
        lastComputedAt: null,
      };
      const b = createCohortBuilder(existing);
      expect(b.getDefinition().name).toBe('Old');
    });
  });
});

describe('CohortStore', () => {
  it('saves and retrieves cohorts', () => {
    const store = createCohortStore();
    const b = createCohortBuilder();
    b.setName('My Cohort');
    const saved = store.save(b);
    expect(store.getById(saved.id)).not.toBeNull();
    expect(store.getAll()).toHaveLength(1);
  });

  it('returns null for unknown id', () => {
    const store = createCohortStore();
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('deletes cohorts', () => {
    const store = createCohortStore();
    const b = createCohortBuilder();
    const saved = store.save(b);
    expect(store.delete(saved.id)).toBe(true);
    expect(store.getById(saved.id)).toBeNull();
  });

  it('returns false when deleting nonexistent', () => {
    const store = createCohortStore();
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('updates member count', () => {
    const store = createCohortStore();
    const b = createCohortBuilder();
    const saved = store.save(b);
    store.updateMemberCount(saved.id, 42);
    const updated = store.getById(saved.id);
    expect(updated!.memberCount).toBe(42);
    expect(updated!.lastComputedAt).not.toBeNull();
  });

  it('ignores member count update for unknown id', () => {
    const store = createCohortStore();
    store.updateMemberCount('nonexistent', 10);
    expect(store.getAll()).toHaveLength(0);
  });
});

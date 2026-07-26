export type CohortOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'less_than'
  | 'gte' | 'lte'
  | 'between' | 'not_between'
  | 'in' | 'not_in'
  | 'contains' | 'starts_with';

export interface CohortCondition {
  readonly field: string;
  readonly operator: CohortOperator;
  readonly value: unknown;
}

export interface CohortDefinition {
  readonly name: string;
  readonly conditions: readonly CohortCondition[];
  readonly logic: 'and' | 'or';
}

export interface SavedCohort {
  readonly id: string;
  readonly definition: CohortDefinition;
  readonly memberCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly autoUpdate: boolean;
  readonly lastComputedAt: number | null;
}

export interface CohortBuilder {
  addCondition(condition: CohortCondition): void;
  removeCondition(index: number): void;
  updateCondition(index: number, condition: CohortCondition): void;
  setLogic(logic: 'and' | 'or'): void;
  setName(name: string): void;
  getDefinition(): CohortDefinition;
  evaluate(item: Record<string, unknown>): boolean;
  filter(data: readonly Record<string, unknown>[]): readonly Record<string, unknown>[];
  save(): SavedCohort;
}

let cohortCounter = 0;

export function createCohortBuilder(
  existing?: SavedCohort,
): CohortBuilder & { load(definition: CohortDefinition): void } {
  let definition: CohortDefinition = existing?.definition ?? {
    name: 'New Cohort',
    conditions: [],
    logic: 'and',
  };

  function evaluateCondition(item: Record<string, unknown>, condition: CohortCondition): boolean {
    const fieldValue = item[condition.field];
    const { operator, value } = condition;

    switch (operator) {
      case 'equals': return fieldValue === value;
      case 'not_equals': return fieldValue !== value;
      case 'greater_than': return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;
      case 'less_than': return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;
      case 'gte': return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;
      case 'lte': return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;
      case 'between': {
        if (!Array.isArray(value) || value.length !== 2) return false;
        const [min, max] = value as [number, number];
        return typeof fieldValue === 'number' && fieldValue >= min && fieldValue <= max;
      }
      case 'not_between': {
        if (!Array.isArray(value) || value.length !== 2) return false;
        const [min, max] = value as [number, number];
        return typeof fieldValue === 'number' && (fieldValue < min || fieldValue > max);
      }
      case 'in': return Array.isArray(value) && value.includes(fieldValue);
      case 'not_in': return Array.isArray(value) && !value.includes(fieldValue);
      case 'contains': return typeof fieldValue === 'string' && typeof value === 'string' && fieldValue.includes(value);
      case 'starts_with': return typeof fieldValue === 'string' && typeof value === 'string' && fieldValue.startsWith(value);
      default: return false;
    }
  }

  const builder: CohortBuilder & { load(definition: CohortDefinition): void } = {
    addCondition(condition: CohortCondition): void {
      definition = {
        ...definition,
        conditions: [...definition.conditions, condition],
      };
    },

    removeCondition(index: number): void {
      definition = {
        ...definition,
        conditions: definition.conditions.filter((_, i) => i !== index),
      };
    },

    updateCondition(index: number, condition: CohortCondition): void {
      definition = {
        ...definition,
        conditions: definition.conditions.map((c, i) => i === index ? condition : c),
      };
    },

    setLogic(logic: 'and' | 'or'): void {
      definition = { ...definition, logic };
    },

    setName(name: string): void {
      definition = { ...definition, name };
    },

    getDefinition(): CohortDefinition {
      return definition;
    },

    evaluate(item: Record<string, unknown>): boolean {
      if (definition.conditions.length === 0) return true;
      if (definition.logic === 'and') {
        return definition.conditions.every((c) => evaluateCondition(item, c));
      }
      return definition.conditions.some((c) => evaluateCondition(item, c));
    },

    filter(data: readonly Record<string, unknown>[]): readonly Record<string, unknown>[] {
      return data.filter((item) => this.evaluate(item));
    },

    save(): SavedCohort {
      return {
        id: `cohort_${Date.now().toString(36)}_${(cohortCounter++).toString(36)}`,
        definition: { ...definition, conditions: [...definition.conditions] },
        memberCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        autoUpdate: true,
        lastComputedAt: null,
      };
    },

    load(def: CohortDefinition): void {
      definition = { ...def, conditions: [...def.conditions] };
    },
  };

  if (existing) {
    builder.load(existing.definition);
  }

  return builder;
}

export interface CohortStore {
  save(builder: CohortBuilder): SavedCohort;
  getAll(): readonly SavedCohort[];
  getById(id: string): SavedCohort | null;
  delete(id: string): boolean;
  updateMemberCount(id: string, count: number): void;
}

export function createCohortStore(): CohortStore {
  const cohorts = new Map<string, SavedCohort>();

  return {
    save(builder: CohortBuilder): SavedCohort {
      const saved = builder.save();
      cohorts.set(saved.id, saved);
      return saved;
    },

    getAll(): readonly SavedCohort[] {
      return [...cohorts.values()];
    },

    getById(id: string): SavedCohort | null {
      return cohorts.get(id) ?? null;
    },

    delete(id: string): boolean {
      return cohorts.delete(id);
    },

    updateMemberCount(id: string, count: number): void {
      const existing = cohorts.get(id);
      if (existing) {
        cohorts.set(id, {
          ...existing,
          memberCount: count,
          updatedAt: Date.now(),
          lastComputedAt: Date.now(),
        });
      }
    },
  };
}

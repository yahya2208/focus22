import { describe, it, expect } from 'vitest';
import {
  createMetric,
  realMetric,
  comingSoonMetric,
  displayMetric,
} from '../../core/research/types';

describe('Metric System', () => {
  it('realMetric creates metric with source', () => {
    const m = realMetric(100, 'sessions');
    expect(m).toEqual({ value: 100, status: 'real', source: 'sessions' });
  });

  it('comingSoonMetric creates null metric', () => {
    const m = comingSoonMetric();
    expect(m).toEqual({ value: null, status: 'coming-soon', source: null });
  });

  it('createMetric creates metric with all params', () => {
    const m = createMetric('test', 'real', 'table.col');
    expect(m).toEqual({ value: 'test', status: 'real', source: 'table.col' });
  });

  it('displayMetric shows number as string', () => {
    expect(displayMetric(realMetric(42, 't'))).toBe('42');
  });

  it('displayMetric shows string directly', () => {
    expect(displayMetric(realMetric('ok', 't'))).toBe('ok');
  });

  it('displayMetric shows Yes/No for boolean', () => {
    expect(displayMetric(realMetric(true, 't'))).toBe('Yes');
    expect(displayMetric(realMetric(false, 't'))).toBe('No');
  });

  it('displayMetric shows dash for coming-soon', () => {
    expect(displayMetric(comingSoonMetric())).toBe('—');
  });

  it('displayMetric shows dash for null real value', () => {
    expect(displayMetric(createMetric(null, 'real', 't'))).toBe('—');
  });
});

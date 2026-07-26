import { describe, it, expect } from 'vitest';
import { validateStatistical } from '../../core/scientific/validation/statistical';

describe('validateStatistical', () => {
  it('should detect normal distribution', () => {
    const values = [200, 202, 198, 201, 199, 203, 197, 200, 202, 198];
    const r = validateStatistical(values);
    expect(r.isNormal).toBe(true);
  });

  it('should handle small sample', () => {
    const r = validateStatistical([200, 210]);
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should calculate Cohen\'s d with comparison group', () => {
    const group1 = [200, 210, 205, 215, 195];
    const group2 = [250, 260, 255, 265, 245];
    const r = validateStatistical(group1, group2);
    expect(Math.abs(r.effectSize)).toBeGreaterThan(0);
    expect(r.mannWhitneyU).not.toBeNull();
  });

  it('should handle identical groups', () => {
    const values = [200, 210, 205];
    const r = validateStatistical(values, values);
    expect(r.mannWhitneyU).toBeGreaterThanOrEqual(0);
  });

  it('should produce validation entries', () => {
    const r = validateStatistical([200, 210, 205, 195, 208]);
    expect(r.validations.length).toBeGreaterThanOrEqual(1);
    expect(r.validations[0]!.metric).toBe('statistical.normality');
  });

  it('should calculate power analysis', () => {
    const g1 = [200, 210, 205, 215, 195, 200, 210];
    const g2 = [250, 260, 255, 265, 245, 250, 260];
    const r = validateStatistical(g1, g2);
    expect(r.powerAnalysis.achievedPower).toBeGreaterThanOrEqual(0);
  });

  it('should handle skewed data', () => {
    const values = [100, 101, 102, 103, 104, 500];
    const r = validateStatistical(values);
    expect(r.shapiroWilkP).toBeGreaterThanOrEqual(0);
    expect(r.shapiroWilkP).toBeLessThanOrEqual(1);
  });
});

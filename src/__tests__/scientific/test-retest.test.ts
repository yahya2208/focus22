import { describe, it, expect } from 'vitest';
import { validateTestRetest } from '../../core/scientific/validation/test-retest';

describe('validateTestRetest', () => {
  it('should detect excellent test-retest reliability', () => {
    const s1 = [200, 210, 205, 215, 195];
    const s2 = [202, 212, 207, 213, 197];
    const r = validateTestRetest(s1, s2);
    expect(r.pearsonR).toBeGreaterThan(0.9);
    expect(r.rating).toBe('excellent');
  });

  it('should detect poor test-retest reliability', () => {
    const s1 = [150, 200, 250, 300, 350];
    const s2 = [350, 300, 250, 200, 150];
    const r = validateTestRetest(s1, s2);
    expect(r.pearsonR).toBeLessThan(0.5);
  });

  it('should calculate coefficient of repeatability', () => {
    const s1 = [200, 210, 205];
    const s2 = [202, 212, 207];
    const r = validateTestRetest(s1, s2);
    expect(r.coefficientOfRepeatability).toBeGreaterThanOrEqual(0);
  });

  it('should calculate limits of agreement', () => {
    const s1 = [200, 210, 205];
    const s2 = [202, 208, 206];
    const r = validateTestRetest(s1, s2);
    expect(r.limitsOfAgreement.lower).toBeLessThan(r.meanDifference);
    expect(r.limitsOfAgreement.upper).toBeGreaterThan(r.meanDifference);
  });

  it('should handle empty input', () => {
    const r = validateTestRetest([], []);
    expect(r.pearsonR).toBe(0);
    expect(r.rating).toBe('poor');
  });

  it('should handle single pair', () => {
    const r = validateTestRetest([200], [202]);
    expect(r.rating).toBe('poor');
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should calculate ICC', () => {
    const s1 = [200, 210, 205, 215];
    const s2 = [202, 211, 204, 216];
    const r = validateTestRetest(s1, s2);
    expect(r.intraclassCorrelation).toBeGreaterThan(0);
  });

  it('should produce validation entries', () => {
    const s1 = [200, 210, 205];
    const s2 = [202, 211, 204];
    const r = validateTestRetest(s1, s2);
    expect(r.validations.length).toBeGreaterThanOrEqual(3);
  });
});

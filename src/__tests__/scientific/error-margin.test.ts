import { describe, it, expect } from 'vitest';
import { validateErrorMargin } from '../../core/scientific/validation/error-margin';

describe('validateErrorMargin', () => {
  it('should calculate 95% CI correctly', () => {
    const r = validateErrorMargin([200, 210, 205, 195, 208]);
    expect(r.confidenceInterval95.lower).toBeLessThan(200 + r.marginOfError95);
    expect(r.confidenceInterval95.upper).toBeGreaterThan(200 - r.marginOfError95);
  });

  it('should calculate 99% CI wider than 95% CI', () => {
    const r = validateErrorMargin([200, 210, 205, 195, 208]);
    expect(r.marginOfError99).toBeGreaterThan(r.marginOfError95);
  });

  it('should handle small sample', () => {
    const r = validateErrorMargin([200]);
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should handle empty array', () => {
    const r = validateErrorMargin([]);
    expect(r.standardError).toBe(0);
  });

  it('should calculate standard error', () => {
    const r = validateErrorMargin([200, 210, 205]);
    expect(r.standardError).toBeGreaterThan(0);
  });

  it('should have lower < upper in CIs', () => {
    const r = validateErrorMargin([200, 210, 205, 195]);
    expect(r.confidenceInterval95.lower).toBeLessThan(r.confidenceInterval95.upper);
    expect(r.confidenceInterval99.lower).toBeLessThan(r.confidenceInterval99.upper);
  });

  it('should produce validation entries', () => {
    const r = validateErrorMargin([200, 210, 205]);
    expect(r.validations.length).toBeGreaterThanOrEqual(2);
  });
});

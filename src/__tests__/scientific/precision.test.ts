import { describe, it, expect } from 'vitest';
import { validatePrecision } from '../../core/scientific/validation/precision';

describe('validatePrecision', () => {
  it('should detect perfect precision (identical values)', () => {
    const r = validatePrecision([200, 200, 200, 200]);
    expect(r.standardDeviation).toBe(0);
    expect(r.coefficientOfVariation).toBe(0);
    expect(r.precisionRating).toBe('excellent');
  });

  it('should detect excellent precision (CV <= 10%)', () => {
    const values = [200, 202, 198, 201, 199];
    const r = validatePrecision(values);
    expect(r.precisionRating).toBe('excellent');
    expect(r.coefficientOfVariation).toBeLessThanOrEqual(0.1);
  });

  it('should detect good precision (CV <= 20%)', () => {
    const values = [180, 230, 195, 215, 170];
    const r = validatePrecision(values);
    expect(r.precisionRating).toBe('good');
  });

  it('should detect poor precision for high variance', () => {
    const values = [100, 200, 300, 400, 500];
    const r = validatePrecision(values);
    expect(r.precisionRating).toBe('poor');
  });

  it('should calculate IQR correctly', () => {
    const values = [100, 200, 300, 400, 500];
    const r = validatePrecision(values);
    expect(r.iqr).toBeGreaterThan(0);
  });

  it('should handle single value', () => {
    const r = validatePrecision([200]);
    expect(r.standardDeviation).toBe(0);
    expect(r.precisionRating).toBe('poor');
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should handle empty array', () => {
    const r = validatePrecision([]);
    expect(r.precisionRating).toBe('poor');
  });

  it('should produce 3 validation entries', () => {
    const r = validatePrecision([200, 210, 190]);
    expect(r.validations.length).toBe(3);
    expect(r.validations[0]!.metric).toBe('precision.cv');
  });
});

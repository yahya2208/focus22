import { describe, it, expect } from 'vitest';
import { validateCalibration } from '../../core/scientific/validation/calibration';

describe('validateCalibration', () => {
  it('should validate correct calibration', () => {
    const r = validateCalibration(24.667, 25, [60, 60, 60], [0.8, 0.85, 0.9]);
    expect(r.rating).toBe('valid');
    expect(r.calibrationAccuracy).toBeGreaterThan(0.9);
  });

  it('should detect invalid calibration with large lag error', () => {
    const r = validateCalibration(24.667, 50, [60, 60], [0.5, 0.4]);
    expect(r.rating).toBe('invalid');
  });

  it('should detect marginal calibration', () => {
    const r = validateCalibration(24.667, 35, [60, 60], [0.6, 0.55]);
    expect(r.rating).toMatch(/marginal|invalid/);
  });

  it('should handle empty input', () => {
    const r = validateCalibration(24.667, 25, [], []);
    expect(r.rating).toBe('invalid');
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should calculate lag compensation error', () => {
    const r = validateCalibration(24.667, 30, [60], [0.7]);
    expect(r.lagCompensationError).toBeCloseTo(5.333);
  });

  it('should calculate refresh rate consistency', () => {
    const r = validateCalibration(24.667, 25, [60, 60, 60], [0.8, 0.8, 0.8]);
    expect(r.refreshRateConsistency).toBeCloseTo(1);
  });

  it('should produce validation entries', () => {
    const r = validateCalibration(24.667, 25, [60], [0.8]);
    expect(r.validations.length).toBeGreaterThanOrEqual(2);
  });
});

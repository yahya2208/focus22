import { describe, it, expect } from 'vitest';
import { validateAccuracy } from '../../core/scientific/validation/accuracy';

describe('validateAccuracy', () => {
  it('should return perfect accuracy for identical arrays', () => {
    const r = validateAccuracy([200, 250, 300], [200, 250, 300]);
    expect(r.meanAbsoluteError).toBe(0);
    expect(r.rootMeanSquareError).toBe(0);
    expect(r.systematicBias).toBe(0);
    expect(r.accuracyRating).toBe('excellent');
    expect(r.validations.every((v) => v.status === 'passed')).toBe(true);
  });

  it('should detect systematic positive bias', () => {
    const r = validateAccuracy([210, 260, 310], [200, 250, 300]);
    expect(r.systematicBias).toBeCloseTo(10);
    expect(r.meanSignedError).toBeCloseTo(10);
  });

  it('should detect systematic negative bias', () => {
    const r = validateAccuracy([190, 240, 290], [200, 250, 300]);
    expect(r.systematicBias).toBeCloseTo(-10);
  });

  it('should calculate MAE correctly', () => {
    const r = validateAccuracy([200, 260, 300], [200, 250, 300]);
    expect(r.meanAbsoluteError).toBeCloseTo(3.333);
  });

  it('should calculate RMSE correctly', () => {
    const r = validateAccuracy([200, 260, 300], [200, 250, 300]);
    expect(r.rootMeanSquareError).toBeGreaterThan(0);
  });

  it('should rate excellent for MAE <= 5', () => {
    const r = validateAccuracy([202, 251, 299], [200, 250, 300]);
    expect(r.accuracyRating).toBe('excellent');
  });

  it('should rate good for MAE <= 15', () => {
    const r = validateAccuracy([210, 260, 310], [200, 250, 300]);
    expect(r.accuracyRating).toBe('good');
  });

  it('should rate acceptable for MAE <= 30', () => {
    const r = validateAccuracy([225, 275, 330], [200, 250, 300]);
    expect(r.accuracyRating).toBe('acceptable');
  });

  it('should rate poor for MAE > 30', () => {
    const r = validateAccuracy([300, 400, 500], [200, 250, 300]);
    expect(r.accuracyRating).toBe('poor');
  });

  it('should handle empty arrays', () => {
    const r = validateAccuracy([], []);
    expect(r.accuracyRating).toBe('poor');
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should handle mismatched array lengths', () => {
    const r = validateAccuracy([100, 200], [100]);
    expect(r.accuracyRating).toBe('poor');
  });

  it('should produce validation entries', () => {
    const r = validateAccuracy([200, 250], [200, 250]);
    expect(r.validations.length).toBe(3);
    expect(r.validations[0]!.metric).toBe('accuracy.mae');
    expect(r.validations[1]!.metric).toBe('accuracy.rmse');
    expect(r.validations[2]!.metric).toBe('accuracy.bias');
  });
});

import { describe, it, expect } from 'vitest';
import { validateRepeatability } from '../../core/scientific/validation/repeatability';

describe('validateRepeatability', () => {
  it('should detect excellent repeatability across sessions', () => {
    const sessions = [
      [200, 202, 198],
      [201, 199, 203],
      [198, 200, 201],
    ];
    const r = validateRepeatability(sessions);
    expect(r.rating).toBe('excellent');
    expect(r.withinSessionCV).toBeLessThanOrEqual(0.05);
  });

  it('should detect poor repeatability with varying sessions', () => {
    const sessions = [
      [150, 160, 155],
      [300, 310, 305],
      [200, 210, 205],
    ];
    const r = validateRepeatability(sessions);
    expect(r.rating).toBe('poor');
  });

  it('should handle empty input', () => {
    const r = validateRepeatability([]);
    expect(r.rating).toBe('poor');
    expect(r.validations[0]!.status).toBe('failed');
  });

  it('should handle single session', () => {
    const r = validateRepeatability([[200, 210, 190]]);
    expect(r.validations.some((v) => v.status === 'failed')).toBe(true);
  });

  it('should calculate between-session SD', () => {
    const sessions = [[200, 210], [220, 230]];
    const r = validateRepeatability(sessions);
    expect(r.withinSessionSD).toBeGreaterThan(0);
  });

  it('should produce validation entries', () => {
    const r = validateRepeatability([[200], [201]]);
    expect(r.validations.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle sessions with different sizes', () => {
    const sessions = [[200], [201, 202, 203], [199]];
    const r = validateRepeatability(sessions);
    expect(r.withinSessionCV).toBeGreaterThanOrEqual(0);
  });
});

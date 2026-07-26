import { describe, it, expect } from 'vitest';
import { calculateFocusScore } from '../../core/engine/scoring';

describe('Scoring Engine', () => {
  it('should compute Focus Score from weighted components', () => {
    const result = calculateFocusScore({
      meanCorrectedMs: 250,
      consistencyScore: 80,
      fatigueScore: 90,
      totalRounds: 20,
    });
    expect(result.focusScore).toBeGreaterThan(0);
    expect(result.focusScore).toBeLessThanOrEqual(100);
  });

  it('should assign grade A for high scores', () => {
    const result = calculateFocusScore({
      meanCorrectedMs: 160,
      consistencyScore: 95,
      fatigueScore: 95,
      totalRounds: 20,
    });
    expect(result.grade).toBe('A');
  });

  it('should assign grade F for low scores', () => {
    const result = calculateFocusScore({
      meanCorrectedMs: 380,
      consistencyScore: 20,
      fatigueScore: 10,
      totalRounds: 20,
    });
    expect(result.grade).toBe('F');
  });

  it('should respect weight distribution', () => {
    const result = calculateFocusScore({
      meanCorrectedMs: 250,
      consistencyScore: 100,
      fatigueScore: 100,
      totalRounds: 20,
    });
    expect(result.breakdown.consistencyContribution).toBeCloseTo(30, 0);
    expect(result.breakdown.fatigueContribution).toBeCloseTo(30, 0);
  });
});

import { describe, it, expect } from 'vitest';
import { processReactions } from '../../core/engine/reaction';

describe('Reaction Engine', () => {
  it('should correct all RTs by subtracting display and input lag', () => {
    const rawRts = [300, 250, 350];
    const result = processReactions(rawRts, 16.667, 8);
    expect(result.correctedRtMs[0]).toBeCloseTo(300 - 16.667 - 8, 1);
    expect(result.correctedRtMs[1]).toBeCloseTo(250 - 16.667 - 8, 1);
  });

  it('should compute correct mean', () => {
    const rawRts = [200, 300, 400];
    const result = processReactions(rawRts, 0, 0);
    expect(result.meanCorrectedMs).toBe(300);
  });

  it('should compute correct median for odd-length array', () => {
    const rawRts = [100, 200, 300];
    const result = processReactions(rawRts, 0, 0);
    expect(result.medianCorrectedMs).toBe(200);
  });

  it('should compute correct median for even-length array', () => {
    const rawRts = [100, 200, 300, 400];
    const result = processReactions(rawRts, 0, 0);
    expect(result.medianCorrectedMs).toBe(250);
  });

  it('should handle empty array', () => {
    const result = processReactions([], 0, 0);
    expect(result.isValid).toBe(false);
    expect(result.meanCorrectedMs).toBe(0);
  });

  it('should clamp negative corrected values to 0', () => {
    const rawRts = [5];
    const result = processReactions(rawRts, 16.667, 8);
    expect(result.correctedRtMs[0]).toBe(0);
    expect(result.isValid).toBe(false);
  });
});

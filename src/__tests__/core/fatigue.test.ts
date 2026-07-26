import { describe, it, expect } from 'vitest';
import { detectFatigue } from '../../core/engine/fatigue';

describe('Fatigue Engine', () => {
  it('should detect fatigue when block averages show negative slope', () => {
    const rts = [350, 340, 330, 300, 290, 280, 250, 240, 230];
    const result = detectFatigue(rts);
    expect(result.hasFatigue).toBe(true);
    expect(result.slope).toBeLessThan(0);
  });

  it('should not detect fatigue for stable RTs', () => {
    const rts = [200, 200, 200, 200, 200, 200, 200, 200, 200];
    const result = detectFatigue(rts);
    expect(result.hasFatigue).toBe(false);
    expect(result.fatigueIndex).toBe(0);
  });

  it('should handle insufficient data', () => {
    const rts = [200, 210];
    const result = detectFatigue(rts);
    expect(result.hasFatigue).toBe(false);
    expect(result.blockAverages).toHaveLength(0);
  });

  it('should compute correct block averages', () => {
    const rts = [100, 200, 300, 400, 500, 600];
    const result = detectFatigue(rts);
    expect(result.blockAverages.length).toBeGreaterThan(0);
  });
});

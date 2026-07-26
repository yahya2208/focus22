import { describe, it, expect } from 'vitest';
import { analyzeConsistency } from '../../core/engine/consistency';

describe('Consistency Engine', () => {
  it('should compute correct mean', () => {
    const rts = [200, 300, 400];
    const result = analyzeConsistency(rts);
    expect(result.meanMs).toBe(300);
  });

  it('should detect outliers via IQR method', () => {
    const rts = [200, 210, 220, 210, 205, 500];
    const result = analyzeConsistency(rts);
    expect(result.outlierCount).toBeGreaterThan(0);
    expect(result.outlierIndices).toContain(5);
  });

  it('should rate excellent consistency for low CV', () => {
    const rts = [200, 201, 199, 200, 202];
    const result = analyzeConsistency(rts);
    expect(result.rating).toBe('excellent');
  });

  it('should rate poor consistency for high CV', () => {
    const rts = [100, 300, 150, 400, 200];
    const result = analyzeConsistency(rts);
    expect(result.rating).toBe('poor');
  });

  it('should handle empty array', () => {
    const result = analyzeConsistency([]);
    expect(result.meanMs).toBe(0);
    expect(result.rating).toBe('poor');
  });

  it('should return clean values excluding outliers', () => {
    const rts = [200, 210, 220, 210, 205, 1000];
    const result = analyzeConsistency(rts);
    expect(result.cleanValues.length).toBeLessThan(rts.length);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateConfidence, createConfidenceEngine } from '../../ai/coach/confidence';
import type { ConfidenceInput } from '../../ai/coach/types';

function createEmptyInput(): ConfidenceInput {
  return {
    sessionCount: 0,
    calibrationConfidence: 0,
    deviceStability: 0,
    variance: 0,
    recentSessions: 0,
    daysActive: 0,
  };
}

describe('calculateConfidence', () => {
  it('should return low confidence for empty input', () => {
    const result = calculateConfidence(createEmptyInput());
    expect(result.level).toBe('low');
    expect(result.score).toBeLessThan(40);
  });

  it('should return high confidence for high values across all factors', () => {
    const result = calculateConfidence({
      sessionCount: 60,
      calibrationConfidence: 95,
      deviceStability: 90,
      variance: 10,
      recentSessions: 15,
      daysActive: 35,
    });
    expect(result.level).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('should return medium confidence for mixed values', () => {
    const result = calculateConfidence({
      sessionCount: 10,
      calibrationConfidence: 50,
      deviceStability: 50,
      variance: 30,
      recentSessions: 5,
      daysActive: 7,
    });
    expect(result.level).toBe('medium');
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
  });

  it('should penalize low session count', () => {
    const lowSessions = calculateConfidence({
      ...createEmptyInput(),
      sessionCount: 2,
    });
    const highSessions = calculateConfidence({
      ...createEmptyInput(),
      sessionCount: 50,
    });
    expect(lowSessions.score).toBeLessThan(highSessions.score);
  });

  it('should give higher contribution for high calibration', () => {
    const lowCal = calculateConfidence({
      ...createEmptyInput(),
      calibrationConfidence: 10,
    });
    const highCal = calculateConfidence({
      ...createEmptyInput(),
      calibrationConfidence: 90,
    });
    const lowCalFactor = lowCal.factors.find((f) => f.name === 'calibrationConfidence')!;
    const highCalFactor = highCal.factors.find((f) => f.name === 'calibrationConfidence')!;
    expect(highCalFactor.contribution).toBeGreaterThan(lowCalFactor.contribution);
  });

  it('should give better score for low variance', () => {
    const lowVariance = calculateConfidence({
      ...createEmptyInput(),
      variance: 5,
    });
    const highVariance = calculateConfidence({
      ...createEmptyInput(),
      variance: 200,
    });
    const lowVarFactor = lowVariance.factors.find((f) => f.name === 'variance')!;
    const highVarFactor = highVariance.factors.find((f) => f.name === 'variance')!;
    expect(lowVarFactor.contribution).toBeGreaterThan(highVarFactor.contribution);
  });

  it('should have factor weights that sum to 1', () => {
    const result = calculateConfidence(createEmptyInput());
    const totalWeight = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 2);
  });

  it('should generate an explanation string', () => {
    const result = calculateConfidence(createEmptyInput());
    expect(result.explanation).toBeTruthy();
    expect(typeof result.explanation).toBe('string');
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('should include level and score in explanation', () => {
    const result = calculateConfidence({
      sessionCount: 30,
      calibrationConfidence: 80,
      deviceStability: 70,
      variance: 15,
      recentSessions: 8,
      daysActive: 14,
    });
    expect(result.explanation).toContain(result.level);
    expect(result.explanation).toContain(String(result.score));
  });

  it('should return exactly 6 factors', () => {
    const result = calculateConfidence(createEmptyInput());
    expect(result.factors.length).toBe(6);
  });

  it('should clamp score to 0-100 range for all zeros', () => {
    const result = calculateConfidence(createEmptyInput());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should clamp score to 0-100 range for all max values', () => {
    const result = calculateConfidence({
      sessionCount: 100,
      calibrationConfidence: 100,
      deviceStability: 100,
      variance: 0,
      recentSessions: 100,
      daysActive: 100,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should have matching factor names', () => {
    const result = calculateConfidence(createEmptyInput());
    const names = result.factors.map((f) => f.name);
    expect(names).toContain('sessionCount');
    expect(names).toContain('calibrationConfidence');
    expect(names).toContain('deviceStability');
    expect(names).toContain('variance');
    expect(names).toContain('recentSessions');
    expect(names).toContain('daysActive');
  });

  it('should handle moderate session count (20 sessions)', () => {
    const result = calculateConfidence({
      ...createEmptyInput(),
      sessionCount: 20,
    });
    expect(result.factors.find((f) => f.name === 'sessionCount')!.value).toBe(60);
  });

  it('should handle boundary session counts', () => {
    const at5 = calculateConfidence({ ...createEmptyInput(), sessionCount: 5 });
    const at6 = calculateConfidence({ ...createEmptyInput(), sessionCount: 6 });
    expect(at5.factors.find((f) => f.name === 'sessionCount')!.value).toBe(20);
    expect(at6.factors.find((f) => f.name === 'sessionCount')!.value).toBe(60);
  });

  it('should produce consistent results for same input', () => {
    const input: ConfidenceInput = {
      sessionCount: 15,
      calibrationConfidence: 60,
      deviceStability: 70,
      variance: 25,
      recentSessions: 7,
      daysActive: 10,
    };
    const r1 = calculateConfidence(input);
    const r2 = calculateConfidence(input);
    expect(r1.score).toBe(r2.score);
    expect(r1.level).toBe(r2.level);
  });
});

describe('createConfidenceEngine', () => {
  it('should create a working engine instance', () => {
    const engine = createConfidenceEngine();
    expect(engine).toBeDefined();
    expect(typeof engine.evaluate).toBe('function');
  });

  it('should evaluate and return ConfidenceResult', () => {
    const engine = createConfidenceEngine();
    const result = engine.evaluate(createEmptyInput());
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('explanation');
  });

  it('should return same results as calculateConfidence', () => {
    const engine = createConfidenceEngine();
    const input: ConfidenceInput = {
      sessionCount: 25,
      calibrationConfidence: 70,
      deviceStability: 80,
      variance: 18,
      recentSessions: 10,
      daysActive: 12,
    };
    const engineResult = engine.evaluate(input);
    const directResult = calculateConfidence(input);
    expect(engineResult.score).toBe(directResult.score);
    expect(engineResult.level).toBe(directResult.level);
  });
});

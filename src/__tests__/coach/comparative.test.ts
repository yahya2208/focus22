import { describe, it, expect } from 'vitest';
import {
  comparePeriods,
  compareTimeOfDay,
  compareSessionLength,
  generateComparisons,
} from '../../ai/coach/comparative';
import type { CognitiveInput, SessionSnapshot } from '../../ai/coach/types';

function createTestSessions(count: number): SessionSnapshot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ses_${i}`,
    timestamp: Date.now() - (count - i) * 86400000,
    duration: 10,
    meanRT: 300,
    medianRT: 280,
    consistencyScore: 0.7,
    fatigueIndex: 0.3,
    fatigueScore: 0.6,
    focusScore: 65,
    accuracy: 85,
    calibrationConfidence: 0.8,
    grade: 'B',
    roundCount: 10,
  }));
}

function createInput(overrides: Partial<CognitiveInput> = {}): CognitiveInput {
  const sessions = overrides.sessions ?? createTestSessions(5);
  return {
    sessions,
    scientificMetrics: {
      reactionTime: { median: 280, mean: 300, stdDev: 40, variance: 1600 },
      percentiles: { p50: 280, p75: 310, p90: 360, p95: 400, p99: 500 },
      falseStarts: 0,
      accuracy: 85,
      consistency: { score: 0.7, rating: 'good', cv: 0.13 },
      fatigue: { index: 0.3, score: 0.6, detected: false },
      calibrationConfidence: 0.8,
      ...overrides.scientificMetrics,
    },
    calibrationConfidence: overrides.calibrationConfidence ?? 0.8,
    deviceStability: overrides.deviceStability ?? 0.9,
    recentActivity: overrides.recentActivity ?? [],
  };
}

describe('comparePeriods', () => {
  it('detects positive change when current is higher', () => {
    const result = comparePeriods([80, 85, 90], [70, 72, 75], 'focusScore');
    expect(result.changePercent).toBeGreaterThan(0);
    expect(result.trend).toBe('improving');
  });

  it('detects negative change when current is lower', () => {
    const result = comparePeriods([50, 45, 40], [70, 72, 75], 'focusScore');
    expect(result.changePercent).toBeLessThan(0);
    expect(result.trend).toBe('regressing');
  });

  it('detects stable when values are equal', () => {
    const result = comparePeriods([70, 70, 70], [70, 70, 70], 'focusScore');
    expect(result.changePercent).toBe(0);
    expect(result.trend).toBe('plateau');
  });

  it('returns low confidence with empty arrays', () => {
    const result = comparePeriods([], [], 'focusScore');
    expect(result.confidence.level).toBe('low');
    expect(result.confidence.score).toBe(0);
  });

  it('sets baseline and current means', () => {
    const result = comparePeriods([100], [50], 'metric');
    expect(result.baseline).toBe(50);
    expect(result.current).toBe(100);
  });

  it('handles zero previous mean without division error', () => {
    const result = comparePeriods([10, 20], [0, 0], 'metric');
    expect(result.changePercent).toBe(0);
  });
});

describe('compareTimeOfDay', () => {
  it('returns correct structure for morning vs evening', () => {
    const result = compareTimeOfDay([100, 110, 120], [90, 95, 100], 'medianRT');
    expect(result.dimension).toBe('medianRT');
    expect(result.label).toBe('Morning vs Evening');
    expect(typeof result.changePercent).toBe('number');
  });

  it('detects morning better when morning values higher', () => {
    const result = compareTimeOfDay([120, 130, 140], [80, 85, 90], 'focusScore');
    expect(result.changePercent).toBeGreaterThan(0);
  });

  it('handles empty evening sessions', () => {
    const result = compareTimeOfDay([100, 110], [], 'metric');
    expect(result.confidence.level).toBe('low');
  });
});

describe('compareSessionLength', () => {
  it('returns correct structure for short vs long', () => {
    const result = compareSessionLength([90, 95], [80, 85], 'accuracy');
    expect(result.dimension).toBe('accuracy');
    expect(result.label).toBe('Short vs Long Sessions');
  });

  it('detects short sessions better when short values higher', () => {
    const result = compareSessionLength([100, 105, 110], [80, 82, 85], 'focusScore');
    expect(result.changePercent).toBeGreaterThan(0);
    expect(result.trend).toBe('improving');
  });

  it('handles empty long sessions', () => {
    const result = compareSessionLength([100], [], 'metric');
    expect(result.confidence.level).toBe('low');
  });
});

describe('generateComparisons', () => {
  it('returns array of comparisons for valid sessions', () => {
    const input = createInput({ sessions: createTestSessions(10) });
    const comparisons = generateComparisons(input);
    expect(Array.isArray(comparisons)).toBe(true);
    expect(comparisons.length).toBeGreaterThan(0);
  });

  it('returns comparisons even with empty sessions', () => {
    const input = createInput({ sessions: [] });
    const comparisons = generateComparisons(input);
    expect(Array.isArray(comparisons)).toBe(true);
  });

  it('all comparisons are self-referential (no external data)', () => {
    const input = createInput({ sessions: createTestSessions(15) });
    const comparisons = generateComparisons(input);
    for (const comp of comparisons) {
      expect(typeof comp.dimension).toBe('string');
      expect(typeof comp.changePercent).toBe('number');
      expect(['improving', 'regressing', 'plateau']).toContain(comp.trend);
    }
  });

  it('confidence is based on sample size', () => {
    const input = createInput({ sessions: createTestSessions(10) });
    const comparisons = generateComparisons(input);
    for (const comp of comparisons) {
      expect(comp.confidence).toBeDefined();
      expect(comp.confidence.level).toMatch(/^(high|medium|low)$/);
      expect(comp.confidence.factors.length).toBeGreaterThan(0);
    }
  });

  it('each comparison has valid trend', () => {
    const input = createInput({ sessions: createTestSessions(10) });
    const comparisons = generateComparisons(input);
    for (const comp of comparisons) {
      expect(['improving', 'regressing', 'plateau']).toContain(comp.trend);
    }
  });
});

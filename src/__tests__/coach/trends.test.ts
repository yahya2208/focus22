import { describe, it, expect } from 'vitest';
import { detectTrend, computeStatisticalSignificance, analyzeTrends } from '../../ai/coach/trends';
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

function createInput(sessions: SessionSnapshot[]): CognitiveInput {
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
    },
    calibrationConfidence: 0.8,
    deviceStability: 0.9,
    recentActivity: [],
  };
}

describe('detectTrend', () => {
  it('returns plateau with fewer than 3 data points', () => {
    const points = [
      { date: '2026-01-01', value: 50 },
      { date: '2026-01-02', value: 60 },
    ];
    expect(detectTrend(points)).toBe('plateau');
  });

  it('detects improving trend with increasing values', () => {
    const points = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 110 },
      { date: '2026-01-03', value: 120 },
      { date: '2026-01-04', value: 130 },
      { date: '2026-01-05', value: 140 },
    ];
    expect(detectTrend(points)).toBe('improving');
  });

  it('detects regressing trend with decreasing values', () => {
    const points = [
      { date: '2026-01-01', value: 140 },
      { date: '2026-01-02', value: 130 },
      { date: '2026-01-03', value: 120 },
      { date: '2026-01-04', value: 110 },
      { date: '2026-01-05', value: 100 },
    ];
    expect(detectTrend(points)).toBe('regressing');
  });

  it('detects plateau with stable values', () => {
    const points = [
      { date: '2026-01-01', value: 50 },
      { date: '2026-01-02', value: 50 },
      { date: '2026-01-03', value: 50 },
      { date: '2026-01-04', value: 50 },
      { date: '2026-01-05', value: 50 },
    ];
    expect(detectTrend(points)).toBe('plateau');
  });

  it('detects unstable trend with high variance', () => {
    const points = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 80 },
      { date: '2026-01-03', value: 5 },
      { date: '2026-01-04', value: 90 },
      { date: '2026-01-05', value: 15 },
    ];
    expect(detectTrend(points)).toBe('unstable');
  });
});

describe('computeStatisticalSignificance', () => {
  it('returns 0 for empty array', () => {
    expect(computeStatisticalSignificance([])).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(computeStatisticalSignificance([50])).toBe(0);
  });

  it('returns high significance (0.001) for large consistent sample', () => {
    const values = [99, 100, 101, 100, 100, 99, 101, 100, 100, 99, 101, 100, 100, 99, 101, 100, 100, 99, 101, 100];
    expect(computeStatisticalSignificance(values)).toBe(0.001);
  });

  it('returns 0 when all values are zero', () => {
    expect(computeStatisticalSignificance([0, 0, 0, 0, 0])).toBe(0);
  });

  it('returns low significance for high variance sample', () => {
    const values = [1, 100, 2, 99, 3];
    const sig = computeStatisticalSignificance(values);
    expect(sig).toBeGreaterThanOrEqual(0);
    expect(sig).toBeLessThanOrEqual(1);
  });
});

describe('analyzeTrends', () => {
  it('returns empty dataPoints with no sessions', () => {
    const input = createInput([]);
    const trends = analyzeTrends(input);
    expect(trends).toHaveLength(6);
    for (const trend of trends) {
      expect(trend.dataPoints).toHaveLength(0);
    }
  });

  it('returns 6 dimension trends for valid sessions', () => {
    const input = createInput(createTestSessions(5));
    const trends = analyzeTrends(input);
    expect(trends).toHaveLength(6);
  });

  it('each trend has a confidence result', () => {
    const input = createInput(createTestSessions(5));
    const trends = analyzeTrends(input);
    for (const trend of trends) {
      expect(trend.confidence).toBeDefined();
      expect(trend.confidence.level).toMatch(/^(high|medium|low)$/);
      expect(typeof trend.confidence.score).toBe('number');
    }
  });

  it('each trend has data points', () => {
    const input = createInput(createTestSessions(5));
    const trends = analyzeTrends(input);
    for (const trend of trends) {
      expect(trend.dataPoints).toBeDefined();
      expect(Array.isArray(trend.dataPoints)).toBe(true);
      expect(trend.dataPoints).toHaveLength(5);
    }
  });

  it('each trend has a valid dimension name', () => {
    const input = createInput(createTestSessions(5));
    const trends = analyzeTrends(input);
    const expectedDimensions = ['reactionTime', 'consistency', 'fatigue', 'focusScore', 'accuracy', 'sessionDuration'];
    const actualDimensions = trends.map((t) => t.dimension);
    expect(actualDimensions).toEqual(expectedDimensions);
  });

  it('each trend has statistical significance', () => {
    const input = createInput(createTestSessions(5));
    const trends = analyzeTrends(input);
    for (const trend of trends) {
      expect(typeof trend.statisticalSignificance).toBe('number');
      expect(trend.statisticalSignificance).toBeGreaterThanOrEqual(0);
    }
  });

  it('each trend has a magnitude value', () => {
    const input = createInput(createTestSessions(5));
    const trends = analyzeTrends(input);
    for (const trend of trends) {
      expect(typeof trend.magnitude).toBe('number');
    }
  });
});

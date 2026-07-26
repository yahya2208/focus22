import { describe, it, expect } from 'vitest';
import { generateRecommendations, createRecommendation } from '../../ai/coach/recommendations';
import type { CognitiveInput, SessionSnapshot, ConfidenceResult } from '../../ai/coach/types';

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

const defaultConfidence: ConfidenceResult = {
  level: 'medium',
  score: 0.7,
  factors: [{ name: 'test', value: 1, weight: 1, contribution: 0.7 }],
  explanation: 'test confidence',
};

describe('createRecommendation', () => {
  it('creates a recommendation with valid id', () => {
    const rec = createRecommendation({
      category: 'test',
      message: 'Test message',
      rationale: 'Test rationale',
      evidence: [],
      priority: 1,
      confidence: defaultConfidence,
      scientificBasis: 'Test basis',
    });
    expect(rec.id).toMatch(/^rec_test_/);
  });

  it('defaults researchTag to scientific', () => {
    const rec = createRecommendation({
      category: 'test',
      message: 'msg',
      rationale: 'rat',
      evidence: [],
      priority: 1,
      confidence: defaultConfidence,
      scientificBasis: 'basis',
    });
    expect(rec.researchTag).toBe('scientific');
  });

  it('accepts custom researchTag', () => {
    const rec = createRecommendation({
      category: 'test',
      message: 'msg',
      rationale: 'rat',
      evidence: [],
      priority: 1,
      confidence: defaultConfidence,
      scientificBasis: 'basis',
      researchTag: 'experimental',
    });
    expect(rec.researchTag).toBe('experimental');
  });
});

describe('generateRecommendations', () => {
  it('returns few or no recommendations for empty sessions', () => {
    const input = createInput({ sessions: [] });
    const recs = generateRecommendations(input);
    expect(recs.length).toBeLessThanOrEqual(2);
  });

  it('generates fatigue rest recommendation when fatigue is high', () => {
    const sessions = createTestSessions(5);
    const highFatigueSessions = sessions.map((s) => ({ ...s, fatigueIndex: 0.8 }));
    const input = createInput({ sessions: highFatigueSessions });
    const recs = generateRecommendations(input);
    const fatigueRec = recs.find((r) => r.category === 'fatigue_rest');
    expect(fatigueRec).toBeDefined();
    expect(fatigueRec!.message).toContain('fatigue');
  });

  it('generates frequency recommendation when session count is low', () => {
    const input = createInput({ sessions: createTestSessions(1) });
    const recs = generateRecommendations(input);
    const freqRec = recs.find((r) => r.category === 'session_frequency');
    expect(freqRec).toBeDefined();
  });

  it('generates calibration recommendation when calibration is low', () => {
    const input = createInput({
      calibrationConfidence: 0.4,
      scientificMetrics: {
        reactionTime: { median: 280, mean: 300, stdDev: 40, variance: 1600 },
        percentiles: { p50: 280, p75: 310, p90: 360, p95: 400, p99: 500 },
        falseStarts: 0,
        accuracy: 85,
        consistency: { score: 0.7, rating: 'good', cv: 0.13 },
        fatigue: { index: 0.3, score: 0.6, detected: false },
        calibrationConfidence: 0.4,
      },
    });
    const recs = generateRecommendations(input);
    const calRec = recs.find((r) => r.category === 'calibration');
    expect(calRec).toBeDefined();
  });

  it('generates consistency recommendation when consistency is low', () => {
    const input = createInput({
      scientificMetrics: {
        reactionTime: { median: 280, mean: 300, stdDev: 40, variance: 1600 },
        percentiles: { p50: 280, p75: 310, p90: 360, p95: 400, p99: 500 },
        falseStarts: 0,
        accuracy: 85,
        consistency: { score: 0.3, rating: 'poor', cv: 0.4 },
        fatigue: { index: 0.3, score: 0.6, detected: false },
        calibrationConfidence: 0.8,
      },
    });
    const recs = generateRecommendations(input);
    const consRec = recs.find((r) => r.category === 'consistency');
    expect(consRec).toBeDefined();
  });

  it('recommendations have valid IDs', () => {
    const input = createInput({ sessions: createTestSessions(1) });
    const recs = generateRecommendations(input);
    for (const rec of recs) {
      expect(rec.id).toMatch(/^rec_/);
    }
  });

  it('recommendations have evidence arrays', () => {
    const sessions = createTestSessions(5).map((s) => ({ ...s, fatigueIndex: 0.8 }));
    const input = createInput({ sessions });
    const recs = generateRecommendations(input);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(Array.isArray(rec.evidence)).toBe(true);
      expect(rec.evidence.length).toBeGreaterThan(0);
    }
  });

  it('recommendations have scientificBasis strings', () => {
    const input = createInput({ calibrationConfidence: 0.3 });
    const recs = generateRecommendations(input);
    for (const rec of recs) {
      expect(typeof rec.scientificBasis).toBe('string');
      expect(rec.scientificBasis.length).toBeGreaterThan(0);
    }
  });

  it('recommendations have researchTag', () => {
    const input = createInput({ calibrationConfidence: 0.3 });
    const recs = generateRecommendations(input);
    for (const rec of recs) {
      expect(['scientific', 'experimental', 'informational']).toContain(rec.researchTag);
    }
  });

  it('recommendations are sorted by priority ascending', () => {
    const sessions = createTestSessions(1);
    const input = createInput({ sessions, calibrationConfidence: 0.3 });
    const recs = generateRecommendations(input);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i]!.priority).toBeGreaterThanOrEqual(recs[i - 1]!.priority);
    }
  });

  it('multiple conditions produce multiple recommendations', () => {
    const sessions = createTestSessions(1).map((s) => ({ ...s, fatigueIndex: 0.9 }));
    const input = createInput({
      sessions,
      calibrationConfidence: 0.3,
      scientificMetrics: {
        reactionTime: { median: 280, mean: 300, stdDev: 40, variance: 1600 },
        percentiles: { p50: 280, p75: 310, p90: 360, p95: 400, p99: 500 },
        falseStarts: 0,
        accuracy: 85,
        consistency: { score: 0.2, rating: 'poor', cv: 0.5 },
        fatigue: { index: 0.9, score: 0.1, detected: true },
        calibrationConfidence: 0.3,
      },
    });
    const recs = generateRecommendations(input);
    expect(recs.length).toBeGreaterThanOrEqual(3);
  });
});

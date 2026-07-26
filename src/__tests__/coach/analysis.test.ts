import { describe, it, expect } from 'vitest';
import {
  analyzePerformance,
  analyzeDimension,
} from '../../ai/coach/analysis';
import type {
  CognitiveInput,
  SessionSnapshot,
  ConfidenceResult,
} from '../../ai/coach/types';

function createEmptyInput(): CognitiveInput {
  return {
    sessions: [],
    scientificMetrics: {
      reactionTime: { median: 0, mean: 0, stdDev: 0, variance: 0 },
      percentiles: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
      falseStarts: 0,
      accuracy: 0,
      consistency: { score: 0, rating: '', cv: 0 },
      fatigue: { index: 0, score: 0, detected: false },
      calibrationConfidence: 0,
    },
    calibrationConfidence: 0,
    deviceStability: 0,
    recentActivity: [],
  };
}

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: `ses_${Date.now()}`,
    timestamp: Date.now(),
    duration: 120,
    meanRT: 280,
    medianRT: 270,
    consistencyScore: 0.75,
    fatigueIndex: 0.2,
    fatigueScore: 70,
    focusScore: 70,
    accuracy: 0.8,
    calibrationConfidence: 0.75,
    grade: 'B',
    roundCount: 30,
    ...overrides,
  };
}

function makeConfidence(overrides: Partial<ConfidenceResult> = {}): ConfidenceResult {
  return {
    level: 'medium',
    score: 50,
    factors: [],
    explanation: 'Fallback.',
    ...overrides,
  };
}

describe('analyzeDimension', () => {
  it('should rate Excellent for value meeting excellent threshold (higherIsBetter=true)', () => {
    const result = analyzeDimension({
      value: 0.9,
      history: [0.8, 0.85, 0.88, 0.9],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.rating).toBe('Excellent');
  });

  it('should rate Good for value meeting good threshold (higherIsBetter=true)', () => {
    const result = analyzeDimension({
      value: 0.75,
      history: [0.7, 0.72, 0.75],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.rating).toBe('Good');
  });

  it('should rate Fair for value between good*0.7 and good (higherIsBetter=true)', () => {
    const result = analyzeDimension({
      value: 0.55,
      history: [0.5, 0.52, 0.55],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.rating).toBe('Fair');
  });

  it('should rate Needs Improvement for low value (higherIsBetter=true)', () => {
    const result = analyzeDimension({
      value: 0.3,
      history: [0.4, 0.35, 0.3],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.rating).toBe('Needs Improvement');
  });

  it('should rate Excellent for low RT when higherIsBetter=false', () => {
    const result = analyzeDimension({
      value: 200,
      history: [300, 280, 250, 200],
      goodThreshold: 300,
      excellentThreshold: 250,
      higherIsBetter: false,
      confidence: makeConfidence(),
      dimensionName: 'Reaction time',
    });
    expect(result.rating).toBe('Excellent');
  });

  it('should rate Good for RT at goodThreshold when higherIsBetter=false', () => {
    const result = analyzeDimension({
      value: 290,
      history: [320, 310, 300, 290],
      goodThreshold: 300,
      excellentThreshold: 250,
      higherIsBetter: false,
      confidence: makeConfidence(),
      dimensionName: 'Reaction time',
    });
    expect(result.rating).toBe('Good');
  });

  it('should detect improving trend with upward history (higherIsBetter=true)', () => {
    const result = analyzeDimension({
      value: 0.9,
      history: [0.5, 0.6, 0.7, 0.8, 0.9],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.trend).toBe('improving');
  });

  it('should detect regressing trend with downward history (higherIsBetter=true)', () => {
    const result = analyzeDimension({
      value: 0.5,
      history: [0.9, 0.85, 0.8, 0.7, 0.5],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.trend).toBe('regressing');
  });

  it('should detect plateau for stable history', () => {
    const result = analyzeDimension({
      value: 0.7,
      history: [0.7, 0.71, 0.7, 0.71, 0.7],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.trend).toBe('plateau');
  });

  it('should return plateau for short history (< 3 points)', () => {
    const result = analyzeDimension({
      value: 0.7,
      history: [0.7, 0.71],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.trend).toBe('plateau');
  });

  it('should include explanation string', () => {
    const result = analyzeDimension({
      value: 0.8,
      history: [0.7, 0.75, 0.8],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: makeConfidence(),
      dimensionName: 'Consistency',
    });
    expect(result.explanation).toContain('Consistency');
    expect(result.explanation).toContain(result.rating);
  });

  it('should include confidence in result', () => {
    const conf = makeConfidence({ level: 'high', score: 90 });
    const result = analyzeDimension({
      value: 0.9,
      history: [0.8, 0.85, 0.9],
      goodThreshold: 0.7,
      excellentThreshold: 0.85,
      higherIsBetter: true,
      confidence: conf,
      dimensionName: 'Consistency',
    });
    expect(result.confidence).toBe(conf);
  });

  it('should detect improving trend for RT decreasing (higherIsBetter=false)', () => {
    const result = analyzeDimension({
      value: 180,
      history: [350, 320, 280, 230, 180],
      goodThreshold: 300,
      excellentThreshold: 250,
      higherIsBetter: false,
      confidence: makeConfidence(),
      dimensionName: 'Reaction time',
    });
    expect(result.trend).toBe('improving');
  });
});

describe('analyzePerformance', () => {
  it('should handle minimal sessions (use fallback values)', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
    };
    const result = analyzePerformance(input);
    expect(result).toHaveProperty('reactionTime');
    expect(result).toHaveProperty('consistency');
    expect(result).toHaveProperty('fatigue');
    expect(result).toHaveProperty('calibration');
    expect(result).toHaveProperty('focusScore');
    expect(result).toHaveProperty('accuracy');
    expect(result).toHaveProperty('overall');
  });

  it('should include all dimensions in result', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
    };
    const result = analyzePerformance(input);
    expect(result.reactionTime).toBeDefined();
    expect(result.consistency).toBeDefined();
    expect(result.fatigue).toBeDefined();
    expect(result.calibration).toBeDefined();
    expect(result.focusScore).toBeDefined();
    expect(result.accuracy).toBeDefined();
    expect(result.overall).toBeDefined();
  });

  it('should analyze single session correctly', () => {
    const session = makeSession({
      medianRT: 260,
      consistencyScore: 0.85,
      fatigueIndex: 0.1,
      calibrationConfidence: 0.9,
      focusScore: 85,
      accuracy: 0.9,
    });
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [session],
      calibrationConfidence: 0.9,
    };
    const result = analyzePerformance(input);
    expect(result.reactionTime.current).toBe(260);
    expect(result.consistency.current).toBe(0.85);
    expect(result.fatigue.current).toBe(0.1);
    expect(result.calibration.current).toBe(0.9);
  });

  it('should use latest session for current values', () => {
    const sessions = [
      makeSession({ medianRT: 350, consistencyScore: 0.5, focusScore: 50 }),
      makeSession({ medianRT: 250, consistencyScore: 0.9, focusScore: 90 }),
    ];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
      calibrationConfidence: 0.85,
    };
    const result = analyzePerformance(input);
    expect(result.reactionTime.current).toBe(250);
    expect(result.consistency.current).toBe(0.9);
  });

  it('should compute overall score as average of normalized dimensions', () => {
    const sessions = [makeSession()];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
      calibrationConfidence: 0.75,
    };
    const result = analyzePerformance(input);
    expect(result.overall.current).toBeGreaterThanOrEqual(0);
    expect(result.overall.current).toBeLessThanOrEqual(100);
  });

  it('should detect fatigue dimension from sessions', () => {
    const sessions = [
      makeSession({ fatigueIndex: 0.5 }),
      makeSession({ fatigueIndex: 0.6 }),
      makeSession({ fatigueIndex: 0.7 }),
    ];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
    };
    const result = analyzePerformance(input);
    expect(result.fatigue.current).toBe(0.7);
  });

  it('should rate accuracy dimension from latest session', () => {
    const sessions = [
      makeSession({ accuracy: 0.6 }),
      makeSession({ accuracy: 0.95 }),
    ];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
    };
    const result = analyzePerformance(input);
    expect(result.accuracy.current).toBe(0.95);
    expect(result.accuracy.rating).toBe('Excellent');
  });

  it('should have trend plateau for single session history', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
    };
    const result = analyzePerformance(input);
    expect(result.reactionTime.trend).toBe('plateau');
  });

  it('should detect improving consistency across multiple sessions', () => {
    const sessions = [
      makeSession({ consistencyScore: 0.4, timestamp: 1 }),
      makeSession({ consistencyScore: 0.55, timestamp: 2 }),
      makeSession({ consistencyScore: 0.7, timestamp: 3 }),
      makeSession({ consistencyScore: 0.85, timestamp: 4 }),
      makeSession({ consistencyScore: 0.95, timestamp: 5 }),
    ];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
    };
    const result = analyzePerformance(input);
    expect(result.consistency.trend).toBe('improving');
  });

  it('should use calibrationConfidence from input not session', () => {
    const sessions = [makeSession({ calibrationConfidence: 0.5 })];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
      calibrationConfidence: 0.9,
    };
    const result = analyzePerformance(input);
    expect(result.calibration.current).toBe(0.9);
  });
});

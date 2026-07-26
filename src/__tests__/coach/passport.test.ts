import { describe, it, expect } from 'vitest';
import { generatePassport } from '../../ai/coach/passport';
import type { CognitiveInput, SessionSnapshot } from '../../ai/coach/types';

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
    id: `ses_${Date.now()}_${Math.random()}`,
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

describe('generatePassport - empty sessions', () => {
  it('should return a valid passport for empty sessions', () => {
    const passport = generatePassport(createEmptyInput());
    expect(passport).toHaveProperty('profile');
    expect(passport).toHaveProperty('strengths');
    expect(passport).toHaveProperty('areasToImprove');
    expect(passport).toHaveProperty('reliabilityIndex');
    expect(passport).toHaveProperty('milestones');
    expect(passport).toHaveProperty('timeline');
    expect(passport).toHaveProperty('updatedAt');
  });

  it('should have zero session count in profile', () => {
    const passport = generatePassport(createEmptyInput());
    expect(passport.profile.sessionCount).toBe(0);
  });

  it('should have updatedAt as a timestamp', () => {
    const before = Date.now();
    const passport = generatePassport(createEmptyInput());
    const after = Date.now();
    expect(passport.updatedAt).toBeGreaterThanOrEqual(before);
    expect(passport.updatedAt).toBeLessThanOrEqual(after);
  });
});

describe('generatePassport - profile', () => {
  it('should compute correct session count', () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
    };
    const passport = generatePassport(input);
    expect(passport.profile.sessionCount).toBe(3);
  });

  it('should generate a summary string', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession({ focusScore: 75 })],
    };
    const passport = generatePassport(input);
    expect(typeof passport.profile.summary).toBe('string');
    expect(passport.profile.summary.length).toBeGreaterThan(0);
  });

  it('should compute overall score from average focus', () => {
    const sessions = [
      makeSession({ focusScore: 60 }),
      makeSession({ focusScore: 80 }),
    ];
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
    };
    const passport = generatePassport(input);
    expect(passport.profile.overallScore).toBe(70);
  });

  it('should have non-empty dominantStrength', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.9,
        consistency: { score: 0.8, rating: 'good', cv: 0.1 },
        fatigue: { index: 0.1, score: 90, detected: false },
      },
    };
    const passport = generatePassport(input);
    expect(passport.profile.dominantStrength.length).toBeGreaterThan(0);
  });
});

describe('generatePassport - strengths', () => {
  it('should detect high accuracy as strength', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.9,
        consistency: { score: 0.5, rating: 'fair', cv: 0.2 },
        fatigue: { index: 0.5, score: 50, detected: true },
      },
    };
    const passport = generatePassport(input);
    expect(passport.strengths.some((s) => s.dimension === 'Accuracy')).toBe(true);
  });

  it('should detect strong consistency', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.5,
        consistency: { score: 0.85, rating: 'excellent', cv: 0.05 },
        fatigue: { index: 0.5, score: 50, detected: true },
      },
    };
    const passport = generatePassport(input);
    expect(passport.strengths.some((s) => s.dimension === 'Consistency')).toBe(true);
  });

  it('should provide engagement fallback when no other strengths', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.3,
        consistency: { score: 0.3, rating: 'poor', cv: 0.4 },
        fatigue: { index: 0.6, score: 40, detected: true },
      },
    };
    const passport = generatePassport(input);
    expect(passport.strengths.length).toBeGreaterThan(0);
  });
});

describe('generatePassport - areas to improve', () => {
  it('should suggest consistency improvement when low', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.8,
        consistency: { score: 0.4, rating: 'poor', cv: 0.3 },
        fatigue: { index: 0.1, score: 90, detected: false },
      },
    };
    const passport = generatePassport(input);
    expect(passport.areasToImprove.some((a) => a.dimension === 'Consistency')).toBe(true);
  });

  it('should suggest fatigue improvement when high', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.8,
        consistency: { score: 0.8, rating: 'good', cv: 0.1 },
        fatigue: { index: 0.5, score: 50, detected: true },
      },
    };
    const passport = generatePassport(input);
    expect(passport.areasToImprove.some((a) => a.dimension === 'Fatigue Resistance')).toBe(true);
  });

  it('should suggest accuracy improvement when low', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        accuracy: 0.4,
        consistency: { score: 0.8, rating: 'good', cv: 0.1 },
        fatigue: { index: 0.1, score: 90, detected: false },
      },
    };
    const passport = generatePassport(input);
    expect(passport.areasToImprove.some((a) => a.dimension === 'Accuracy')).toBe(true);
  });

  it('should suggest data coverage improvement when fewer than 10 sessions', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions,
    };
    const passport = generatePassport(input);
    expect(passport.areasToImprove.some((a) => a.dimension === 'Data Coverage')).toBe(true);
  });
});

describe('generatePassport - reliability index', () => {
  it('should increase with more sessions', () => {
    const fewSessions = Array.from({ length: 3 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const manySessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const few = generatePassport({ ...createEmptyInput(), sessions: fewSessions, calibrationConfidence: 0.5, deviceStability: 0.5 });
    const many = generatePassport({ ...createEmptyInput(), sessions: manySessions, calibrationConfidence: 0.5, deviceStability: 0.5 });
    expect(many.reliabilityIndex).toBeGreaterThan(few.reliabilityIndex);
  });

  it('should increase with higher calibration confidence', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const lowCal = generatePassport({ ...createEmptyInput(), sessions, calibrationConfidence: 0.2, deviceStability: 0.5 });
    const highCal = generatePassport({ ...createEmptyInput(), sessions, calibrationConfidence: 0.9, deviceStability: 0.5 });
    expect(highCal.reliabilityIndex).toBeGreaterThan(lowCal.reliabilityIndex);
  });

  it('should increase with higher device stability', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const lowDev = generatePassport({ ...createEmptyInput(), sessions, calibrationConfidence: 0.5, deviceStability: 0.1 });
    const highDev = generatePassport({ ...createEmptyInput(), sessions, calibrationConfidence: 0.5, deviceStability: 0.9 });
    expect(highDev.reliabilityIndex).toBeGreaterThan(lowDev.reliabilityIndex);
  });

  it('should be clamped to 0-100 range', () => {
    const sessions = Array.from({ length: 60 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const passport = generatePassport({ ...createEmptyInput(), sessions, calibrationConfidence: 1, deviceStability: 1 });
    expect(passport.reliabilityIndex).toBeLessThanOrEqual(100);
    expect(passport.reliabilityIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('generatePassport - milestones', () => {
  it('should have first assessment milestone for 1+ sessions', () => {
    const sessions = [makeSession()];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.milestones.some((m) => m.id === 'milestone_1')).toBe(true);
  });

  it('should have foundation builder milestone at 5 sessions', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.milestones.some((m) => m.id === 'milestone_5')).toBe(true);
  });

  it('should have dedicated researcher milestone at 10 sessions', () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.milestones.some((m) => m.id === 'milestone_10')).toBe(true);
  });

  it('should have cognitive analyst milestone at 25 sessions', () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.milestones.some((m) => m.id === 'milestone_25')).toBe(true);
  });

  it('should not have milestone_50 for fewer than 50 sessions', () => {
    const sessions = Array.from({ length: 30 }, (_, i) =>
      makeSession({ timestamp: Date.now() + i }),
    );
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.milestones.some((m) => m.id === 'milestone_50')).toBe(false);
  });

  it('should detect grade milestones', () => {
    const sessions = [
      makeSession({ grade: 'C', timestamp: 1 }),
      makeSession({ grade: 'A', timestamp: 2 }),
    ];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.milestones.some((m) => m.id === 'milestone_grade_C')).toBe(true);
    expect(passport.milestones.some((m) => m.id === 'milestone_grade_A')).toBe(true);
  });

  it('should have correct milestone category', () => {
    const sessions = [makeSession()];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    const firstMilestone = passport.milestones.find((m) => m.id === 'milestone_1');
    expect(firstMilestone!.category).toBe('sessions');
  });
});

describe('generatePassport - timeline', () => {
  it('should group sessions by date', () => {
    const baseDate = new Date('2026-01-15').getTime();
    const sessions = [
      makeSession({ timestamp: baseDate, focusScore: 60, medianRT: 300, consistencyScore: 0.6, fatigueIndex: 0.3 }),
      makeSession({ timestamp: baseDate + 3600000, focusScore: 80, medianRT: 250, consistencyScore: 0.8, fatigueIndex: 0.1 }),
    ];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.timeline.length).toBe(1);
  });

  it('should average metrics across same-day sessions', () => {
    const baseDate = new Date('2026-01-15').getTime();
    const sessions = [
      makeSession({ timestamp: baseDate, focusScore: 60, medianRT: 300, consistencyScore: 0.5, fatigueIndex: 0.2 }),
      makeSession({ timestamp: baseDate + 3600000, focusScore: 80, medianRT: 200, consistencyScore: 0.9, fatigueIndex: 0.4 }),
    ];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.timeline[0]!.overallScore).toBe(70);
    expect(passport.timeline[0]!.reactionTime).toBe(250);
  });

  it('should create multiple entries for different dates', () => {
    const sessions = [
      makeSession({ timestamp: new Date('2026-01-10').getTime() }),
      makeSession({ timestamp: new Date('2026-01-11').getTime() }),
      makeSession({ timestamp: new Date('2026-01-12').getTime() }),
    ];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    expect(passport.timeline.length).toBe(3);
  });

  it('should sort timeline by date ascending', () => {
    const sessions = [
      makeSession({ timestamp: new Date('2026-01-15').getTime() }),
      makeSession({ timestamp: new Date('2026-01-10').getTime() }),
      makeSession({ timestamp: new Date('2026-01-20').getTime() }),
    ];
    const passport = generatePassport({ ...createEmptyInput(), sessions });
    const dates = passport.timeline.map((t) => t.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('should return empty timeline for empty sessions', () => {
    const passport = generatePassport(createEmptyInput());
    expect(passport.timeline.length).toBe(0);
  });
});

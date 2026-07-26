import { describe, it, expect } from 'vitest';
import {
  generateGoals,
  createGoal,
  evaluateGoalProgress,
} from '../../ai/coach/goals';
import type {
  CognitiveInput,
  SessionSnapshot,
  Goal,
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

describe('generateGoals', () => {
  it('should return empty array for empty sessions', () => {
    const goals = generateGoals(createEmptyInput());
    expect(goals).toEqual([]);
  });

  it('should generate 2-5 goals for a normal session', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [{ date: '2026-01-01', sessions: 2, avgFocusScore: 70, avgRT: 280 }],
    };
    const goals = generateGoals(input);
    expect(goals.length).toBeGreaterThanOrEqual(2);
    expect(goals.length).toBeLessThanOrEqual(6);
  });

  it('should generate goals with valid IDs', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [],
    };
    const goals = generateGoals(input);
    for (const goal of goals) {
      expect(goal.id).toMatch(/^goal_/);
    }
  });

  it('should include researchTag in each goal', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [],
    };
    const goals = generateGoals(input);
    for (const goal of goals) {
      expect(['scientific', 'experimental', 'informational']).toContain(goal.researchTag);
    }
  });

  it('should set RT target below current value', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 300, mean: 305, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [],
    };
    const goals = generateGoals(input);
    const rtGoal = goals.find((g) => g.dimension === 'reactionTime');
    expect(rtGoal).toBeDefined();
    expect(rtGoal!.targetValue).toBeLessThan(rtGoal!.currentValue);
  });

  it('should set consistency target above current value', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.7, rating: 'good', cv: 0.15 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [],
    };
    const goals = generateGoals(input);
    const conGoal = goals.find((g) => g.dimension === 'consistency');
    expect(conGoal).toBeDefined();
    expect(conGoal!.targetValue).toBeGreaterThan(conGoal!.currentValue);
  });

  it('should generate fatigue goal only when fatigue detected', () => {
    const inputWithFatigue: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession({ fatigueIndex: 0.5 })],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.5, score: 50, detected: true },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [],
    };
    const goalsFatigue = generateGoals(inputWithFatigue);
    expect(goalsFatigue.some((g) => g.dimension === 'fatigue')).toBe(true);

    const inputNoFatigue: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession({ fatigueIndex: 0.1 })],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.1, score: 90, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [],
    };
    const goalsNoFatigue = generateGoals(inputNoFatigue);
    expect(goalsNoFatigue.some((g) => g.dimension === 'fatigue')).toBe(false);
  });

  it('should generate calibration goal only when low (<0.8)', () => {
    const inputLow: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.65,
      },
      calibrationConfidence: 0.65,
      recentActivity: [],
    };
    const goalsLow = generateGoals(inputLow);
    expect(goalsLow.some((g) => g.dimension === 'calibration')).toBe(true);

    const inputHigh: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.9,
      },
      calibrationConfidence: 0.9,
      recentActivity: [],
    };
    const goalsHigh = generateGoals(inputHigh);
    expect(goalsHigh.some((g) => g.dimension === 'calibration')).toBe(false);
  });

  it('should generate session frequency goal when sessions per week < 3', () => {
    const input: CognitiveInput = {
      ...createEmptyInput(),
      sessions: [makeSession()],
      scientificMetrics: {
        ...createEmptyInput().scientificMetrics,
        reactionTime: { median: 280, mean: 285, stdDev: 30, variance: 900 },
        consistency: { score: 0.75, rating: 'good', cv: 0.12 },
        fatigue: { index: 0.2, score: 70, detected: false },
        calibrationConfidence: 0.75,
      },
      calibrationConfidence: 0.75,
      recentActivity: [{ date: '2026-01-01', sessions: 1, avgFocusScore: 70, avgRT: 280 }],
    };
    const goals = generateGoals(input);
    expect(goals.some((g) => g.dimension === 'sessionFrequency')).toBe(true);
  });
});

describe('createGoal', () => {
  it('should create a goal with correct structure', () => {
    const goal = createGoal({
      title: 'Test Goal',
      description: 'Test description',
      dimension: 'reactionTime',
      targetValue: 200,
      currentValue: 300,
      unit: 'ms',
      deadline: Date.now() + 86400000,
    });
    expect(goal.id).toMatch(/^goal_/);
    expect(goal.title).toBe('Test Goal');
    expect(goal.status).toBe('active');
    expect(goal.unit).toBe('ms');
  });

  it('should compute progress as currentValue/targetValue * 100', () => {
    const goal = createGoal({
      title: 'Test',
      description: 'Desc',
      dimension: 'consistency',
      targetValue: 0.9,
      currentValue: 0.45,
      unit: 'score',
      deadline: Date.now() + 86400000,
    });
    expect(goal.progress).toBeCloseTo(50, 0);
  });

  it('should cap progress at 100', () => {
    const goal = createGoal({
      title: 'Test',
      description: 'Desc',
      dimension: 'reactionTime',
      targetValue: 200,
      currentValue: 300,
      unit: 'ms',
      deadline: Date.now() + 86400000,
    });
    expect(goal.progress).toBe(100);
  });

  it('should assign scientific tag for reactionTime', () => {
    const goal = createGoal({
      title: 'RT Goal',
      description: 'Desc',
      dimension: 'reactionTime',
      targetValue: 200,
      currentValue: 250,
      unit: 'ms',
      deadline: Date.now() + 86400000,
    });
    expect(goal.researchTag).toBe('scientific');
  });

  it('should assign scientific tag for fatigue', () => {
    const goal = createGoal({
      title: 'Fatigue Goal',
      description: 'Desc',
      dimension: 'fatigue',
      targetValue: 0.1,
      currentValue: 0.5,
      unit: 'index',
      deadline: Date.now() + 86400000,
    });
    expect(goal.researchTag).toBe('scientific');
  });

  it('should assign experimental tag for sessionFrequency', () => {
    const goal = createGoal({
      title: 'Frequency Goal',
      description: 'Desc',
      dimension: 'sessionFrequency',
      targetValue: 5,
      currentValue: 2,
      unit: 'sessions/week',
      deadline: Date.now() + 86400000,
    });
    expect(goal.researchTag).toBe('experimental');
  });

  it('should assign informational tag for other dimensions', () => {
    const goal = createGoal({
      title: 'Other Goal',
      description: 'Desc',
      dimension: 'calibration',
      targetValue: 0.85,
      currentValue: 0.6,
      unit: 'confidence',
      deadline: Date.now() + 86400000,
    });
    expect(goal.researchTag).toBe('informational');
  });
});

describe('evaluateGoalProgress', () => {
  function makeGoal(overrides: Partial<Goal> = {}): Goal {
    return {
      id: 'goal_test_1',
      title: 'Test Goal',
      description: 'Desc',
      dimension: 'reactionTime',
      targetValue: 250,
      currentValue: 300,
      unit: 'ms',
      deadline: Date.now() + 86400000,
      status: 'active',
      progress: 83,
      researchTag: 'scientific',
      ...overrides,
    };
  }

  it('should mark as completed when target met', () => {
    const goal = makeGoal({ targetValue: 250, currentValue: 300 });
    const result = evaluateGoalProgress(goal, 250);
    expect(result.status).toBe('completed');
    expect(result.progress).toBe(100);
  });

  it('should mark as overdue when past deadline', () => {
    const goal = makeGoal({
      deadline: Date.now() - 1000,
      currentValue: 300,
      targetValue: 350,
    });
    const result = evaluateGoalProgress(goal, 200);
    expect(result.status).toBe('overdue');
  });

  it('should remain active when in progress and not overdue', () => {
    const goal = makeGoal({
      deadline: Date.now() + 86400000,
      currentValue: 200,
      targetValue: 250,
    });
    const result = evaluateGoalProgress(goal, 210);
    expect(result.status).toBe('active');
  });

  it('should compute updated progress for active goals', () => {
    const goal = makeGoal({
      deadline: Date.now() + 86400000,
      currentValue: 200,
      targetValue: 250,
    });
    const result = evaluateGoalProgress(goal, 220);
    expect(result.progress).toBeCloseTo(88, 0);
  });

  it('should cap progress at 99 for active goals', () => {
    const goal = makeGoal({
      deadline: Date.now() + 86400000,
      currentValue: 200,
      targetValue: 200,
    });
    const result = evaluateGoalProgress(goal, 198);
    expect(result.progress).toBe(99);
  });

  it('should update currentValue in returned goal', () => {
    const goal = makeGoal();
    const result = evaluateGoalProgress(goal, 275);
    expect(result.currentValue).toBe(275);
  });

  it('should mark as adapted when significant change from original', () => {
    const goal = makeGoal({
      deadline: Date.now() + 86400000,
      currentValue: 300,
      targetValue: 400,
    });
    const result = evaluateGoalProgress(goal, 200);
    expect(result.status).toBe('adapted');
  });
});

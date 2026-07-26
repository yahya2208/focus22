import { describe, it, expect } from 'vitest';
import { createLearningEngine } from '../../ai/coach/learning';
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

function createInput(sessions: SessionSnapshot[] = createTestSessions(5)): CognitiveInput {
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

describe('createLearningEngine', () => {
  it('starts with an empty profile', () => {
    const engine = createLearningEngine();
    const profile = engine.getProfile();
    expect(profile.totalSessionsAnalyzed).toBe(0);
    expect(profile.preferredPlayTimes).toEqual([]);
    expect(profile.averageSessionLength).toBe(0);
  });

  it('populates profile after update', () => {
    const engine = createLearningEngine();
    const profile = engine.updateProfile(createInput());
    expect(profile.totalSessionsAnalyzed).toBe(5);
  });

  it('extracts preferredPlayTimes from timestamps', () => {
    const engine = createLearningEngine();
    const morningSessions = Array.from({ length: 5 }, (_, i) => ({
      id: `ses_${i}`,
      timestamp: new Date(2026, 0, 1 + i, 9, 0).getTime(),
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
    const profile = engine.updateProfile(createInput(morningSessions));
    expect(profile.preferredPlayTimes.length).toBeGreaterThan(0);
    expect(profile.preferredPlayTimes[0]).toMatch(/^\d+:00$/);
  });

  it('computes averageSessionLength correctly', () => {
    const engine = createLearningEngine();
    const sessions = [
      { ...createTestSessions(1)[0]!, duration: 10 },
      { ...createTestSessions(1)[0]!, id: 'ses_1', timestamp: Date.now() - 86400000, duration: 20 },
    ];
    const profile = engine.updateProfile(createInput(sessions));
    expect(profile.averageSessionLength).toBe(15);
  });

  it('detects fatigue pattern when consistent', () => {
    const engine = createLearningEngine();
    const sessions = Array.from({ length: 6 }, (_, i) => ({
      id: `ses_${i}`,
      timestamp: Date.now() - (6 - i) * 86400000,
      duration: 10,
      meanRT: 300,
      medianRT: 280,
      consistencyScore: 0.7,
      fatigueIndex: i < 3 ? 0.1 : 0.6,
      fatigueScore: 0.6,
      focusScore: 65,
      accuracy: 85,
      calibrationConfidence: 0.8,
      grade: 'B',
      roundCount: i < 3 ? 1 : 2,
    }));
    const profile = engine.updateProfile(createInput(sessions));
    expect(typeof profile.typicalFatiguePattern).toBe('string');
  });

  it('favoriteGames returns known games', () => {
    const engine = createLearningEngine();
    const profile = engine.updateProfile(createInput());
    expect(profile.favoriteGames).toContain('reaction-light');
  });

  it('totalSessionsAnalyzed is incremented', () => {
    const engine = createLearningEngine();
    engine.updateProfile(createInput(createTestSessions(3)));
    const profile = engine.updateProfile(createInput(createTestSessions(2)));
    expect(profile.totalSessionsAnalyzed).toBe(5);
  });

  it('lastUpdated is set after update', () => {
    const engine = createLearningEngine();
    const before = Date.now();
    const profile = engine.updateProfile(createInput());
    expect(profile.lastUpdated).toBeGreaterThanOrEqual(before);
    expect(profile.lastUpdated).toBeLessThanOrEqual(Date.now());
  });

  it('reset clears profile', () => {
    const engine = createLearningEngine();
    engine.updateProfile(createInput(createTestSessions(10)));
    expect(engine.getProfile().totalSessionsAnalyzed).toBe(10);
    engine.reset();
    expect(engine.getProfile().totalSessionsAnalyzed).toBe(0);
  });

  it('multiple updates accumulate', () => {
    const engine = createLearningEngine();
    engine.updateProfile(createInput(createTestSessions(3)));
    engine.updateProfile(createInput(createTestSessions(4)));
    engine.updateProfile(createInput(createTestSessions(5)));
    const profile = engine.getProfile();
    expect(profile.totalSessionsAnalyzed).toBe(12);
  });
});

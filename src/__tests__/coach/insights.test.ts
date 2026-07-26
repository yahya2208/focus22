import { describe, it, expect } from 'vitest';
import { generateInsights } from '../../ai/coach/insights';
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

describe('generateInsights', () => {
  it('returns empty array with fewer than 2 sessions', () => {
    const input = createInput({ sessions: createTestSessions(1) });
    const insights = generateInsights(input);
    expect(insights).toEqual([]);
  });

  it('returns empty array with no sessions', () => {
    const input = createInput({ sessions: [] });
    const insights = generateInsights(input);
    expect(insights).toEqual([]);
  });

  it('generates improvement insight when reaction time improves', () => {
    const olderSessions: SessionSnapshot[] = Array.from({ length: 4 }, (_, i) => ({
      id: `ses_old_${i}`,
      timestamp: Date.now() - (10 - i) * 86400000,
      duration: 10,
      meanRT: 400,
      medianRT: 380,
      consistencyScore: 0.7,
      fatigueIndex: 0.3,
      fatigueScore: 0.6,
      focusScore: 65,
      accuracy: 80,
      calibrationConfidence: 0.8,
      grade: 'B-',
      roundCount: 10,
    }));
    const recentSessions: SessionSnapshot[] = Array.from({ length: 4 }, (_, i) => ({
      id: `ses_new_${i}`,
      timestamp: Date.now() - (3 - i) * 86400000,
      duration: 10,
      meanRT: 280,
      medianRT: 260,
      consistencyScore: 0.75,
      fatigueIndex: 0.25,
      fatigueScore: 0.7,
      focusScore: 70,
      accuracy: 88,
      calibrationConfidence: 0.8,
      grade: 'B+',
      roundCount: 10,
    }));
    const input = createInput({ sessions: [...olderSessions, ...recentSessions] });
    const insights = generateInsights(input);
    const rtInsight = insights.find((i) => i.category === 'improvement');
    expect(rtInsight).toBeDefined();
  });

  it('generates fatigue pattern insight for sessions with high fatigue', () => {
    const sessions: SessionSnapshot[] = [
      { ...createTestSessions(1)[0]!, fatigueIndex: 0.2, roundCount: 1 },
      { ...createTestSessions(1)[0]!, id: 'ses_1', timestamp: Date.now() - 4 * 86400000, fatigueIndex: 0.3, roundCount: 2 },
      { ...createTestSessions(1)[0]!, id: 'ses_2', timestamp: Date.now() - 3 * 86400000, fatigueIndex: 0.7, roundCount: 3 },
    ];
    const input = createInput({ sessions });
    const insights = generateInsights(input);
    const fatigueInsight = insights.find((i) => i.category === 'pattern');
    expect(fatigueInsight).toBeDefined();
  });

  it('generates calibration milestone insight when calibration is high', () => {
    const sessions = createTestSessions(5);
    const input = createInput({ sessions, calibrationConfidence: 0.9 });
    const insights = generateInsights(input);
    const calInsight = insights.find((i) => i.id.includes('calibration'));
    expect(calInsight).toBeDefined();
  });

  it('generates streak insight for 3+ consecutive days', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      id: `ses_${i}`,
      timestamp: Date.now() - (4 - i) * 86400000,
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
    const input = createInput({ sessions });
    const insights = generateInsights(input);
    const streakInsight = insights.find((i) => i.category === 'stability' && i.id.includes('streak'));
    expect(streakInsight).toBeDefined();
  });

  it('insights have valid IDs', () => {
    const input = createInput({ sessions: createTestSessions(5) });
    const insights = generateInsights(input);
    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      expect(insight.id.startsWith('ins_')).toBe(true);
    }
  });

  it('insights have evidence arrays', () => {
    const olderSessions = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      timestamp: Date.now() - (8 - i) * 86400000,
      duration: 10, meanRT: 400, medianRT: 380, consistencyScore: 0.7,
      fatigueIndex: 0.3, fatigueScore: 0.6, focusScore: 65, accuracy: 80,
      calibrationConfidence: 0.8, grade: 'B-', roundCount: 10,
    }));
    const recentSessions = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i + 3}`,
      timestamp: Date.now() - (2 - i) * 86400000,
      duration: 10, meanRT: 280, medianRT: 260, consistencyScore: 0.75,
      fatigueIndex: 0.25, fatigueScore: 0.7, focusScore: 70, accuracy: 88,
      calibrationConfidence: 0.8, grade: 'B+', roundCount: 10,
    }));
    const input = createInput({ sessions: [...olderSessions, ...recentSessions] });
    const insights = generateInsights(input);
    const withEvidence = insights.filter((i) => i.evidence.length > 0);
    expect(withEvidence.length).toBeGreaterThan(0);
    for (const insight of withEvidence) {
      expect(Array.isArray(insight.evidence)).toBe(true);
    }
  });

  it('insights have confidence with valid level', () => {
    const input = createInput({ sessions: createTestSessions(6) });
    const insights = generateInsights(input);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(insight.confidence).toBeDefined();
      expect(insight.confidence.level).toMatch(/^(high|medium|low)$/);
    }
  });

  it('insights have researchTag', () => {
    const input = createInput({ sessions: createTestSessions(6) });
    const insights = generateInsights(input);
    for (const insight of insights) {
      expect(['scientific', 'experimental', 'informational']).toContain(insight.researchTag);
    }
  });

  it('returns at most 8 insights', () => {
    const sessions = createTestSessions(20).map((s, i) => ({
      ...s,
      fatigueIndex: i % 2 === 0 ? 0.1 : 0.8,
      accuracy: 70 + i,
      medianRT: 350 - i * 5,
    }));
    const input = createInput({ sessions });
    const insights = generateInsights(input);
    expect(insights.length).toBeLessThanOrEqual(8);
  });
});

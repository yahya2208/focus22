import type {
  CognitiveInput, PerformanceAnalysis, TrendResult, Goal, Recommendation,
  Insight, ConfidenceResult, CoachReport, CognitivePassport, ComparativeResult,
  ReportPeriod, SessionSnapshot, ScientificSnapshot,
} from './types';
import { analyzePerformance } from './analysis';
import { analyzeTrends } from './trends';
import { generateGoals } from './goals';
import { generateRecommendations } from './recommendations';
import { generateInsights } from './insights';
import { calculateConfidence } from './confidence';
import { generatePassport } from './passport';
import { generateComparisons } from './comparative';
import { createLearningEngine, type LearningEngine } from './learning';
import { generateReport, formatReport, exportReport } from './reports';
import { getPersonalityConstraints, validateMessage, applyPersonality } from './personality';
import type { PersonalityConstraints } from './types';

export interface CoachEngine {
  analyze(input: CognitiveInput): CoachState;
  generateReport(period: ReportPeriod, state: CoachState): CoachReport;
  formatReport(report: CoachReport): string;
  exportReport(report: CoachReport, format: 'json' | 'text'): string;
  getLearning(): LearningEngine;
  getPersonality(): PersonalityConstraints;
  validateMessage(message: string): { readonly valid: boolean; readonly violations: readonly string[] };
}

export interface CoachState {
  readonly performance: PerformanceAnalysis;
  readonly trends: readonly TrendResult[];
  readonly goals: readonly Goal[];
  readonly recommendations: readonly Recommendation[];
  readonly insights: readonly Insight[];
  readonly confidence: ConfidenceResult;
  readonly passport: CognitivePassport;
  readonly comparisons: readonly ComparativeResult[];
}

export function createCoachEngine(): CoachEngine {
  const learning = createLearningEngine();

  return {
    analyze(input: CognitiveInput): CoachState {
      learning.updateProfile(input);

      const performance = analyzePerformance(input);
      const trends = analyzeTrends(input);
      const goals = generateGoals(input);
      const recs = generateRecommendations(input);
      const insights = generateInsights(input);
      const confidence = calculateConfidence({
        sessionCount: input.sessions.length,
        calibrationConfidence: input.calibrationConfidence,
        deviceStability: input.deviceStability,
        variance: input.scientificMetrics.reactionTime.variance,
        recentSessions: input.sessions.filter((s) => Date.now() - s.timestamp < 7 * 86400000).length,
        daysActive: new Set(input.sessions.map((s) => new Date(s.timestamp).toDateString())).size,
      });
      const passport = generatePassport(input);
      const comparisons = generateComparisons(input);

      const polishedRecs = recs.map((r) => {
        const validated = validateMessage(r.message);
        return validated.valid ? r : { ...r, message: applyPersonality(r.message) };
      });

      return { performance, trends, goals, recommendations: polishedRecs, insights, confidence, passport, comparisons };
    },

    generateReport(period: ReportPeriod, state: CoachState): CoachReport {
      const input: CognitiveInput = { sessions: [], scientificMetrics: emptyMetrics(), calibrationConfidence: 0, deviceStability: 0, recentActivity: [] };
      return generateReport(period, input, state.performance, state.trends, state.goals, state.recommendations, state.insights, state.confidence, state.passport);
    },

    formatReport(report: CoachReport): string {
      return formatReport(report);
    },

    exportReport(report: CoachReport, format: 'json' | 'text'): string {
      return exportReport(report, format);
    },

    getLearning(): LearningEngine {
      return learning;
    },

    getPersonality(): PersonalityConstraints {
      return getPersonalityConstraints();
    },

    validateMessage(message: string) {
      return validateMessage(message);
    },
  };
}

function emptyMetrics(): ScientificSnapshot {
  return {
    reactionTime: { median: 0, mean: 0, stdDev: 0, variance: 0 },
    percentiles: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
    falseStarts: 0,
    accuracy: 0,
    consistency: { score: 0, rating: 'unknown', cv: 0 },
    fatigue: { index: 0, score: 0, detected: false },
    calibrationConfidence: 0,
  };
}

export function buildCognitiveInput(sessions: readonly SessionSnapshot[]): CognitiveInput {
  const n = sessions.length;
  if (n === 0) {
    return {
      sessions: [],
      scientificMetrics: emptyMetrics(),
      calibrationConfidence: 0,
      deviceStability: 0,
      recentActivity: [],
    };
  }

  const rts = sessions.map((s) => s.medianRT);
  const mean = rts.reduce((a, b) => a + b, 0) / n;
  const variance = rts.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const sorted = [...rts].sort((a, b) => a - b);

  const scientificMetrics: ScientificSnapshot = {
    reactionTime: { median: sorted[Math.floor(n / 2)] ?? 0, mean, stdDev: Math.sqrt(variance), variance },
    percentiles: computePercentiles(rts),
    falseStarts: 0,
    accuracy: sessions.reduce((a, s) => a + s.accuracy, 0) / n,
    consistency: {
      score: sessions.reduce((a, s) => a + s.consistencyScore, 0) / n,
      rating: '',
      cv: mean > 0 ? Math.sqrt(variance) / mean : 0,
    },
    fatigue: {
      index: sessions.reduce((a, s) => a + s.fatigueIndex, 0) / n,
      score: sessions.reduce((a, s) => a + s.fatigueScore, 0) / n,
      detected: sessions.some((s) => s.fatigueIndex > 0.4),
    },
    calibrationConfidence: sessions.reduce((a, s) => a + s.calibrationConfidence, 0) / n,
  };

  const recentActivity = buildRecentActivity(sessions);

  return {
    sessions,
    scientificMetrics,
    calibrationConfidence: scientificMetrics.calibrationConfidence,
    deviceStability: 0.8,
    recentActivity,
  };
}

function computePercentiles(values: readonly number[]): { p50: number; p75: number; p90: number; p95: number; p99: number } {
  if (values.length === 0) return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p = (n: number) => sorted[Math.max(0, Math.ceil(sorted.length * n / 100) - 1)] ?? 0;
  return { p50: p(50), p75: p(75), p90: p(90), p95: p(95), p99: p(99) };
}

function buildRecentActivity(sessions: readonly SessionSnapshot[]): { date: string; sessions: number; avgFocusScore: number; avgRT: number }[] {
  const byDate = new Map<string, readonly SessionSnapshot[]>();
  for (const s of sessions) {
    const date = new Date(s.timestamp).toISOString().split('T')[0]!;
    const existing = byDate.get(date) ?? [];
    byDate.set(date, [...existing, s]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30)
    .map(([date, daySessions]) => ({
      date,
      sessions: daySessions.length,
      avgFocusScore: daySessions.reduce((a, s) => a + s.focusScore, 0) / daySessions.length,
      avgRT: daySessions.reduce((a, s) => a + s.medianRT, 0) / daySessions.length,
    }));
}

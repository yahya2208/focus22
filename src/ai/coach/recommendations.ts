import type {
  Recommendation,
  CognitiveInput,
  Evidence,
  ConfidenceResult,
  ConfidenceFactor,
} from './types';

const FATIGUE_THRESHOLD = 0.4;
const SESSION_FREQUENCY_MIN = 3;
const SESSION_DURATION_LIMIT = 20;
const CALIBRATION_THRESHOLD = 0.7;
const CONSISTENCY_THRESHOLD = 0.5;

function createDefaultConfidence(score: number, factors: readonly ConfidenceFactor[] = []): ConfidenceResult {
  const level = score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  return {
    level,
    score,
    factors,
    explanation: `Confidence level: ${level} (${(score * 100).toFixed(0)}%)`,
  };
}

export function createRecommendation(params: {
  readonly category: string;
  readonly message: string;
  readonly rationale: string;
  readonly evidence: readonly Evidence[];
  readonly priority: number;
  readonly confidence: ConfidenceResult;
  readonly scientificBasis: string;
  readonly researchTag?: 'scientific' | 'experimental' | 'informational';
}): Recommendation {
  const id = `rec_${params.category}_${Date.now()}`;
  return {
    id,
    category: params.category,
    message: params.message,
    rationale: params.rationale,
    evidence: params.evidence,
    priority: params.priority,
    confidence: params.confidence,
    researchTag: params.researchTag ?? 'scientific',
    scientificBasis: params.scientificBasis,
  };
}

function countSessionsThisWeek(sessions: CognitiveInput['sessions']): number {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => s.timestamp >= oneWeekAgo).length;
}

function avgSessionDuration(sessions: CognitiveInput['sessions']): number {
  if (sessions.length === 0) return 0;
  const total = sessions.reduce((sum, s) => sum + s.duration, 0);
  return total / sessions.length;
}

function latestSession(sessions: CognitiveInput['sessions']): CognitiveInput['sessions'][number] | undefined {
  if (sessions.length === 0) return undefined;
  return sessions.reduce((latest, s) => (s.timestamp > latest.timestamp ? s : latest));
}

function detectTimeOfDayTrend(
  recentActivity: CognitiveInput['recentActivity']
): { peakHours: string; recommendation: string } | null {
  if (recentActivity.length < 2) return null;

  const sorted = [...recentActivity].sort((a, b) => {
    const hourA = new Date(a.date).getHours();
    const hourB = new Date(b.date).getHours();
    return hourA - hourB;
  });

  let bestWindow = sorted[0]!;
  let bestScore = sorted[0]!.avgFocusScore;

  for (const entry of sorted) {
    if (entry.avgFocusScore > bestScore) {
      bestScore = entry.avgFocusScore;
      bestWindow = entry;
    }
  }

  const hour = new Date(bestWindow.date).getHours();
  const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return {
    peakHours: timeLabel,
    recommendation: `Your cognitive performance peaks in the ${timeLabel}. Consider scheduling focused sessions during this window.`,
  };
}

function areMetricsStable(
  sessions: CognitiveInput['sessions']
): { stable: boolean; improving: boolean } {
  if (sessions.length < 2) return { stable: false, improving: false };

  const recent = sessions.slice(-3);
  const earlier = sessions.slice(0, Math.max(1, sessions.length - 3));

  const recentAvgFocus = recent.reduce((s, r) => s + r.focusScore, 0) / recent.length;
  const earlierAvgFocus = earlier.reduce((s, r) => s + r.focusScore, 0) / earlier.length;

  const recentAvgConsistency = recent.reduce((s, r) => s + r.consistencyScore, 0) / recent.length;
  const earlierAvgConsistency = earlier.reduce((s, r) => s + r.consistencyScore, 0) / earlier.length;

  const focusDelta = Math.abs(recentAvgFocus - earlierAvgFocus);
  const consistencyDelta = Math.abs(recentAvgConsistency - earlierAvgConsistency);

  const stable = focusDelta < 0.1 && consistencyDelta < 0.1;
  const improving = recentAvgFocus > earlierAvgFocus && recentAvgConsistency > earlierAvgConsistency;

  return { stable, improving };
}

export function generateRecommendations(input: CognitiveInput): readonly Recommendation[] {
  const { sessions, scientificMetrics, recentActivity } = input;
  const recommendations: Recommendation[] = [];

  const latest = latestSession(sessions);

  if (latest && latest.fatigueIndex > FATIGUE_THRESHOLD) {
    const fatigueScore = scientificMetrics.fatigue.score;
    recommendations.push(
      createRecommendation({
        category: 'fatigue_rest',
        message: `Your fatigue index is ${(latest.fatigueIndex * 100).toFixed(0)}%, which is above the optimal threshold. Consider taking a break before your next session.`,
        rationale: 'High fatigue impairs reaction accuracy and cognitive throughput.',
        evidence: [
          {
            metric: 'Fatigue Index',
            previous: FATIGUE_THRESHOLD,
            current: latest.fatigueIndex,
            unit: 'ratio',
            changePercent: ((latest.fatigueIndex - FATIGUE_THRESHOLD) / FATIGUE_THRESHOLD) * 100,
            direction: 'up',
          },
          {
            metric: 'Fatigue Score',
            previous: 0,
            current: fatigueScore,
            unit: 'score',
            changePercent: 0,
            direction: 'up',
          },
        ],
        priority: 1,
        confidence: createDefaultConfidence(0.9),
        scientificBasis:
          'Cognitive fatigue reduces reaction accuracy by 15-30% (Mizuno et al., 2012)',
        researchTag: 'scientific',
      })
    );
  }

  const sessionsThisWeek = countSessionsThisWeek(sessions);
  if (sessionsThisWeek < SESSION_FREQUENCY_MIN) {
    recommendations.push(
      createRecommendation({
        category: 'session_frequency',
        message: `You've completed ${sessionsThisWeek} session${sessionsThisWeek === 1 ? '' : 's'} this week. Aim for at least ${SESSION_FREQUENCY_MIN} distributed sessions for optimal retention.`,
        rationale: 'Distributed practice promotes stronger memory consolidation than massed practice.',
        evidence: [
          {
            metric: 'Sessions This Week',
            previous: SESSION_FREQUENCY_MIN,
            current: sessionsThisWeek,
            unit: 'count',
            changePercent: ((sessionsThisWeek - SESSION_FREQUENCY_MIN) / SESSION_FREQUENCY_MIN) * 100,
            direction: 'down',
          },
        ],
        priority: 2,
        confidence: createDefaultConfidence(0.75),
        scientificBasis:
          'Motor learning requires distributed practice for retention (Schmidt & Lee, 2011)',
        researchTag: 'scientific',
      })
    );
  }

  const avgDuration = avgSessionDuration(sessions);
  if (avgDuration > SESSION_DURATION_LIMIT && latest && latest.fatigueIndex > FATIGUE_THRESHOLD) {
    recommendations.push(
      createRecommendation({
        category: 'session_duration',
        message: `Your average session length is ${avgDuration.toFixed(0)} minutes with elevated fatigue. Shorter sessions (10-15 min) may improve quality.`,
        rationale: 'Sustained attention degrades progressively, reducing data quality in later minutes.',
        evidence: [
          {
            metric: 'Average Session Duration',
            previous: SESSION_DURATION_LIMIT,
            current: avgDuration,
            unit: 'minutes',
            changePercent: ((avgDuration - SESSION_DURATION_LIMIT) / SESSION_DURATION_LIMIT) * 100,
            direction: 'up',
          },
          {
            metric: 'Fatigue Index',
            previous: FATIGUE_THRESHOLD,
            current: latest.fatigueIndex,
            unit: 'ratio',
            changePercent: ((latest.fatigueIndex - FATIGUE_THRESHOLD) / FATIGUE_THRESHOLD) * 100,
            direction: 'up',
          },
        ],
        priority: 2,
        confidence: createDefaultConfidence(0.8),
        scientificBasis:
          'Sustained attention degrades after 15-20 minutes (Mackworth, 1948)',
        researchTag: 'scientific',
      })
    );
  }

  if (scientificMetrics.calibrationConfidence < CALIBRATION_THRESHOLD) {
    recommendations.push(
      createRecommendation({
        category: 'calibration',
        message: `Calibration confidence is at ${(scientificMetrics.calibrationConfidence * 100).toFixed(0)}%. Recalibrate to ensure measurement validity.`,
        rationale: 'Low calibration confidence undermines the reliability of all derived metrics.',
        evidence: [
          {
            metric: 'Calibration Confidence',
            previous: CALIBRATION_THRESHOLD,
            current: scientificMetrics.calibrationConfidence,
            unit: 'ratio',
            changePercent:
              ((scientificMetrics.calibrationConfidence - CALIBRATION_THRESHOLD) /
                CALIBRATION_THRESHOLD) *
              100,
            direction: 'down',
          },
        ],
        priority: 1,
        confidence: createDefaultConfidence(0.85),
        scientificBasis:
          'Calibration accuracy directly affects measurement validity',
        researchTag: 'informational',
      })
    );
  }

  if (scientificMetrics.consistency.score < CONSISTENCY_THRESHOLD) {
    recommendations.push(
      createRecommendation({
        category: 'consistency',
        message: `Consistency score is ${(scientificMetrics.consistency.score * 100).toFixed(0)}%. Try to maintain steady-state testing conditions (same environment, alertness level).`,
        rationale: 'High inter-trial variability reduces the interpretability of your data.',
        evidence: [
          {
            metric: 'Consistency Score',
            previous: CONSISTENCY_THRESHOLD,
            current: scientificMetrics.consistency.score,
            unit: 'ratio',
            changePercent:
              ((scientificMetrics.consistency.score - CONSISTENCY_THRESHOLD) /
                CONSISTENCY_THRESHOLD) *
              100,
            direction: 'down',
          },
          {
            metric: 'Coefficient of Variation',
            previous: 0.3,
            current: scientificMetrics.consistency.cv,
            unit: 'ratio',
            changePercent: 0,
            direction: scientificMetrics.consistency.cv > 0.3 ? 'up' : 'stable',
          },
        ],
        priority: 3,
        confidence: createDefaultConfidence(0.7),
        scientificBasis:
          'Inter-trial variability indicates attentional instability (Wöstmann et al., 2013)',
        researchTag: 'scientific',
      })
    );
  }

  const timeOfDay = detectTimeOfDayTrend(recentActivity);
  if (timeOfDay) {
    const recentTimeFocus = recentActivity.map((a) => a.avgFocusScore);
    const avgRecentFocus = recentTimeFocus.length > 0
      ? recentTimeFocus.reduce((s, v) => s + v, 0) / recentTimeFocus.length
      : 0;

    recommendations.push(
      createRecommendation({
        category: 'time_of_day',
        message: timeOfDay.recommendation,
        rationale: 'Aligning training with your natural circadian peak maximizes cognitive output.',
        evidence: [
          {
            metric: 'Peak Performance Window',
            previous: 0,
            current: avgRecentFocus,
            unit: 'focus score',
            changePercent: 0,
            direction: 'up',
          },
        ],
        priority: 4,
        confidence: createDefaultConfidence(0.65),
        scientificBasis:
          'Cognitive performance follows circadian rhythms (Schmidt et al., 2007)',
        researchTag: 'experimental',
      })
    );
  }

  const metrics = areMetricsStable(sessions);
  if (metrics.stable && metrics.improving) {
    recommendations.push(
      createRecommendation({
        category: 'progress',
        message: 'Your metrics are stable and improving. Keep up the consistent practice for continued gains.',
        rationale: 'Positive reinforcement encourages adherence to effective training habits.',
        evidence: [
          {
            metric: 'Focus Score Trend',
            previous: 0,
            current: latest?.focusScore ?? 0,
            unit: 'score',
            changePercent: 5,
            direction: 'up',
          },
          {
            metric: 'Consistency Trend',
            previous: 0,
            current: latest?.consistencyScore ?? 0,
            unit: 'ratio',
            changePercent: 3,
            direction: 'up',
          },
        ],
        priority: 4,
        confidence: createDefaultConfidence(0.7),
        scientificBasis:
          'Positive reinforcement maintains training adherence',
        researchTag: 'informational',
      })
    );
  }

  return recommendations.sort((a, b) => a.priority - b.priority);
}

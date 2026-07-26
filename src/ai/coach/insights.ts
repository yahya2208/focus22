import type {
  Insight,
  CognitiveInput,
  Evidence,
  ConfidenceResult,
  ConfidenceLevel,
} from './types';

function confidence(sessionCount: number): ConfidenceResult {
  let level: ConfidenceLevel;
  let score: number;

  if (sessionCount > 5) {
    level = 'high';
    score = 0.85 + Math.min(sessionCount * 0.01, 0.15);
  } else if (sessionCount >= 3) {
    level = 'medium';
    score = 0.6 + sessionCount * 0.05;
  } else {
    level = 'low';
    score = 0.3 + sessionCount * 0.1;
  }

  return {
    level,
    score: Math.min(score, 1),
    factors: [
      { name: 'sessionCount', value: sessionCount, weight: 1, contribution: sessionCount / 10 },
    ],
    explanation: `Confidence based on ${sessionCount} session(s).`,
  };
}

function makeEvidence(
  metric: string,
  previous: number,
  current: number,
  unit: string,
): Evidence {
  const changePercent =
    previous === 0 ? 0 : ((current - previous) / previous) * 100;
  const direction: Evidence['direction'] =
    changePercent > 0.5 ? 'up' : changePercent < -0.5 ? 'down' : 'stable';

  return { metric, previous, current, unit, changePercent, direction };
}

function computeStreak(sessions: readonly { timestamp: number }[]): number {
  if (sessions.length === 0) return 0;

  const dates = [
    ...new Set(
      sessions.map((s) => new Date(s.timestamp).toISOString().slice(0, 10)),
    ),
  ].sort();

  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const prev = new Date(dates[i - 1]!);
    const curr = new Date(dates[i]!);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0] ?? '');
}

export function generateInsights(input: CognitiveInput): readonly Insight[] {
  const { sessions } = input;
  if (sessions.length < 2) return [];

  const now = Date.now();
  const insights: Insight[] = [];

  const recentCount = Math.max(2, Math.floor(sessions.length / 2));
  const recentSessions = sessions.slice(-recentCount);
  const olderSessions = sessions.slice(0, -recentCount);

  if (olderSessions.length === 0) {
    if (sessions.length >= 2) {
      const hasFatigueIncrease = sessions.some((s, i) => {
        if (i === 0) return false;
        return s.fatigueIndex > sessions[i - 1]!.fatigueIndex && s.roundCount > 1;
      });

      if (hasFatigueIncrease) {
        const fatigueSession = sessions.find((s) => s.fatigueIndex > 0.5);
        if (fatigueSession) {
          const maxFatigueRound = sessions.reduce(
            (max, s) => (s.fatigueIndex > max.fatigueIndex ? s : max),
            sessions[0]!,
          );
          const evidence: readonly Evidence[] = [
            makeEvidence(
              'fatigueIndex',
              0,
              maxFatigueRound.fatigueIndex,
              'index',
            ),
          ];

          insights.push({
            id: `ins_pattern_fatigue_${now}`,
            text: `Your fatigue index rises after the ${ordinal(maxFatigueRound.roundCount)} round.`,
            category: 'pattern',
            evidence,
            confidence: confidence(sessions.length),
            researchTag: 'scientific',
          });
        }
      }
    }
  } else {
    const olderMedian =
      olderSessions.reduce((sum, s) => sum + s.medianRT, 0) /
      olderSessions.length;
    const recentMedian =
      recentSessions.reduce((sum, s) => sum + s.medianRT, 0) /
      recentSessions.length;

    if (olderMedian > 0 && recentMedian > 0) {
      const rtChange = ((olderMedian - recentMedian) / olderMedian) * 100;

      if (rtChange > 5) {
        const timeframe =
          recentSessions.length === 1 ? 'yesterday' : 'recent sessions';
        const evidence: readonly Evidence[] = [
          makeEvidence('medianRT', olderMedian, recentMedian, 'ms'),
        ];

        insights.push({
          id: `ins_improvement_rt_${now}`,
          text: `Your reaction time improved ${rtChange.toFixed(1)}% compared to ${timeframe}.`,
          category: 'improvement',
          evidence,
          confidence: confidence(sessions.length),
          researchTag: 'scientific',
        });
      }
    }

    const olderConsistency =
      olderSessions.reduce((sum, s) => sum + s.consistencyScore, 0) /
      olderSessions.length;
    const recentConsistency =
      recentSessions.reduce((sum, s) => sum + s.consistencyScore, 0) /
      recentSessions.length;

    const consistencyDiff = Math.abs(recentConsistency - olderConsistency);
    if (consistencyDiff < 0.05 && recentSessions.length > olderSessions.length) {
      const evidence: readonly Evidence[] = [
        makeEvidence(
          'consistencyScore',
          olderConsistency,
          recentConsistency,
          'score',
        ),
      ];

      insights.push({
        id: `ins_stability_consistency_${now}`,
        text: `Your consistency is stable despite more sessions.`,
        category: 'stability',
        evidence,
        confidence: confidence(sessions.length),
        researchTag: 'scientific',
      });
    }

    const olderAccuracy =
      olderSessions.reduce((sum, s) => sum + s.accuracy, 0) /
      olderSessions.length;
    const recentAccuracy =
      recentSessions.reduce((sum, s) => sum + s.accuracy, 0) /
      recentSessions.length;

    if (recentAccuracy > olderAccuracy && recentAccuracy > 0) {
      const gradeOrder = [
        'F',
        'D',
        'C',
        'B-',
        'B',
        'B+',
        'A-',
        'A',
        'A+',
        'S',
        'S+',
      ];
      const olderGrade = olderSessions[olderSessions.length - 1]!.grade;
      const recentGrade = recentSessions[recentSessions.length - 1]!.grade;
      const olderIdx = gradeOrder.indexOf(olderGrade);
      const recentIdx = gradeOrder.indexOf(recentGrade);

      if (recentIdx > olderIdx && olderIdx >= 0) {
        const evidence: readonly Evidence[] = [
          makeEvidence('accuracy', olderAccuracy, recentAccuracy, '%'),
        ];

        insights.push({
          id: `ins_improvement_grade_${now}`,
          text: `Your performance grade improved from ${olderGrade} to ${recentGrade}.`,
          category: 'improvement',
          evidence,
          confidence: confidence(sessions.length),
          researchTag: 'scientific',
        });
      }
    }

    const olderVariance =
      olderSessions.reduce(
        (sum, s) => sum + Math.pow(s.medianRT - olderMedian, 2),
        0,
      ) / olderSessions.length;
    const recentVariance =
      recentSessions.reduce(
        (sum, s) => sum + Math.pow(s.medianRT - recentMedian, 2),
        0,
      ) / recentSessions.length;

    if (olderVariance > 0) {
      const varianceChange =
        ((recentVariance - olderVariance) / olderVariance) * 100;

      if (Math.abs(varianceChange) > 15) {
        const direction = varianceChange < 0 ? 'decreased' : 'increased';
        const evidence: readonly Evidence[] = [
          makeEvidence(
            'responseVariance',
            olderVariance,
            recentVariance,
            'variance',
          ),
        ];

        insights.push({
          id: `ins_pattern_variance_${now}`,
          text: `Your response variability has ${direction} by ${Math.abs(varianceChange).toFixed(1)}%.`,
          category: 'pattern',
          evidence,
          confidence: confidence(sessions.length),
          researchTag: 'scientific',
        });
      }
    }

    const maxFatigueRound = sessions.reduce(
      (max, s) => (s.fatigueIndex > max.fatigueIndex ? s : max),
      sessions[0]!,
    );

    if (maxFatigueRound.fatigueIndex > 0.5 && sessions.length >= 3) {
      const evidence: readonly Evidence[] = [
        makeEvidence(
          'fatigueIndex',
          0,
          maxFatigueRound.fatigueIndex,
          'index',
        ),
      ];

      insights.push({
        id: `ins_pattern_fatigue_${now}`,
        text: `Your fatigue index rises after the ${ordinal(maxFatigueRound.roundCount)} round.`,
        category: 'pattern',
        evidence,
        confidence: confidence(sessions.length),
        researchTag: 'scientific',
      });
    }

    if (input.calibrationConfidence > 0.8) {
      const evidence: readonly Evidence[] = [
        makeEvidence(
          'calibrationConfidence',
          0,
          input.calibrationConfidence,
          'score',
        ),
      ];

      insights.push({
        id: `ins_milestone_calibration_${now}`,
        text: `Calibration quality is excellent, increasing confidence in today's results.`,
        category: 'milestone',
        evidence,
        confidence: confidence(sessions.length),
        researchTag: 'scientific',
      });
    }
  }

  const streak = computeStreak(sessions);
  if (streak >= 3) {
    insights.push({
      id: `ins_stability_streak_${now}`,
      text: `You've maintained a ${streak}-day practice streak.`,
      category: 'stability',
      evidence: [],
      confidence: confidence(streak),
      researchTag: 'informational',
    });
  }

  if (sessions.length >= 3) {
    const bestAccuracy = Math.max(...sessions.map((s) => s.accuracy));
    const recentBest = Math.max(
      ...recentSessions.map((s) => s.accuracy),
    );

    if (
      recentBest >= 90 &&
      recentBest === bestAccuracy &&
      sessions.filter((s) => s.accuracy >= 90).length === 1
    ) {
      const evidence: readonly Evidence[] = [
        makeEvidence('accuracy', 0, recentBest, '%'),
      ];

      insights.push({
        id: `ins_milestone_accuracy_${now}`,
        text: `Your accuracy reached ${recentBest.toFixed(0)}%, a new personal best.`,
        category: 'milestone',
        evidence,
        confidence: confidence(sessions.length),
        researchTag: 'informational',
      });
    }
  }

  return insights.slice(0, 8);
}

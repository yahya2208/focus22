import type {
  CognitivePassport, CognitiveProfile, StrengthEntry, ImprovementEntry,
  CognitiveMilestone, TimelineEntry, CognitiveInput, SessionSnapshot,
} from './types';

export function generatePassport(input: CognitiveInput): CognitivePassport {
  const sessions = input.sessions;
  const metrics = input.scientificMetrics;

  const profile = buildProfile(sessions, metrics);
  const strengths = findStrengths(sessions, metrics);
  const areasToImprove = findImprovements(sessions, metrics);
  const reliabilityIndex = computeReliability(input);
  const milestones = detectMilestones(sessions);
  const timeline = buildTimeline(sessions);

  return { profile, strengths, areasToImprove, reliabilityIndex, milestones, timeline, updatedAt: Date.now() };
}

function buildProfile(
  sessions: readonly SessionSnapshot[],
  metrics: { readonly consistency: { readonly score: number }; readonly fatigue: { readonly index: number }; readonly accuracy: number },
): CognitiveProfile {
  const sessionCount = sessions.length;
  const daysActive = new Set(sessions.map((s) => new Date(s.timestamp).toDateString())).size;
  const avgFocus = sessionCount > 0 ? sessions.reduce((a, s) => a + s.focusScore, 0) / sessionCount : 0;

  const dominantStrength = findDominantStrength(metrics);
  const primaryFocus = findPrimaryFocus(metrics);

  return {
    summary: `Cognitive profile based on ${sessionCount} sessions over ${daysActive} days. Overall focus: ${avgFocus.toFixed(0)}/100.`,
    overallScore: Math.round(avgFocus),
    dominantStrength,
    primaryFocus,
    sessionCount,
    daysActive,
  };
}

function findDominantStrength(metrics: { readonly consistency: { readonly score: number }; readonly accuracy: number; readonly fatigue: { readonly index: number } }): string {
  if (metrics.accuracy >= 0.85) return 'High Accuracy';
  if (metrics.consistency.score >= 0.8) return 'Strong Consistency';
  if (metrics.fatigue.index <= 0.15) return 'Low Fatigue Susceptibility';
  return 'Steady Performance';
}

function findPrimaryFocus(metrics: { readonly consistency: { readonly score: number }; readonly fatigue: { readonly index: number }; readonly accuracy: number }): string {
  if (metrics.fatigue.index > 0.4) return 'Fatigue Management';
  if (metrics.consistency.score < 0.5) return 'Consistency Building';
  if (metrics.accuracy < 0.6) return 'Accuracy Improvement';
  return 'Performance Maintenance';
}

function findStrengths(
  sessions: readonly SessionSnapshot[],
  metrics: { readonly consistency: { readonly score: number }; readonly accuracy: number; readonly fatigue: { readonly index: number } },
): readonly StrengthEntry[] {
  const strengths: StrengthEntry[] = [];

  if (metrics.consistency.score >= 0.7) {
    strengths.push({ dimension: 'Consistency', score: metrics.consistency.score * 100, description: 'Your response timing is highly consistent.' });
  }
  if (metrics.accuracy >= 0.7) {
    strengths.push({ dimension: 'Accuracy', score: metrics.accuracy * 100, description: 'You demonstrate strong accuracy in stimulus detection.' });
  }
  if (metrics.fatigue.index <= 0.2 && sessions.length >= 5) {
    strengths.push({ dimension: 'Endurance', score: (1 - metrics.fatigue.index) * 100, description: 'You maintain performance well across sessions.' });
  }

  if (sessions.length >= 10) {
    const recentRT = sessions.slice(-5).reduce((a, s) => a + s.medianRT, 0) / 5;
    const earlyRT = sessions.slice(0, 5).reduce((a, s) => a + s.medianRT, 0) / 5;
    if (recentRT < earlyRT * 0.9) {
      strengths.push({ dimension: 'Improvement', score: 80, description: 'Your reaction time has shown measurable improvement.' });
    }
  }

  if (strengths.length === 0) {
    strengths.push({ dimension: 'Engagement', score: 50, description: 'You are actively building your cognitive profile.' });
  }

  return strengths;
}

function findImprovements(
  sessions: readonly SessionSnapshot[],
  metrics: { readonly consistency: { readonly score: number }; readonly fatigue: { readonly index: number }; readonly accuracy: number },
): readonly ImprovementEntry[] {
  const improvements: ImprovementEntry[] = [];

  if (metrics.consistency.score < 0.6) {
    improvements.push({ dimension: 'Consistency', currentScore: metrics.consistency.score * 100, targetScore: 70, suggestion: 'Practice in consistent testing conditions to improve response stability.' });
  }
  if (metrics.fatigue.index > 0.3) {
    improvements.push({ dimension: 'Fatigue Resistance', currentScore: (1 - metrics.fatigue.index) * 100, targetScore: 75, suggestion: 'Consider shorter sessions with breaks to manage fatigue.' });
  }
  if (metrics.accuracy < 0.6) {
    improvements.push({ dimension: 'Accuracy', currentScore: metrics.accuracy * 100, targetScore: 70, suggestion: 'Focus on careful stimulus detection rather than speed alone.' });
  }
  if (sessions.length < 10) {
    improvements.push({ dimension: 'Data Coverage', currentScore: sessions.length * 10, targetScore: 100, suggestion: 'Complete more sessions to enable more reliable analysis.' });
  }

  return improvements;
}

function computeReliability(input: CognitiveInput): number {
  const sessionCount = input.sessions.length;
  const calConf = input.calibrationConfidence;
  const deviceStab = input.deviceStability;

  let score = 0;
  if (sessionCount >= 50) score += 40;
  else if (sessionCount >= 20) score += 30;
  else if (sessionCount >= 10) score += 20;
  else if (sessionCount >= 5) score += 10;
  else score += 5;

  score += calConf * 35;
  score += deviceStab * 25;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function detectMilestones(sessions: readonly SessionSnapshot[]): readonly CognitiveMilestone[] {
  const milestones: CognitiveMilestone[] = [];
  const count = sessions.length;

  const thresholds = [
    { n: 1, title: 'First Assessment', desc: 'Completed first cognitive assessment' },
    { n: 5, title: 'Foundation Builder', desc: 'Completed 5 sessions' },
    { n: 10, title: 'Dedicated Researcher', desc: 'Completed 10 sessions' },
    { n: 25, title: 'Cognitive Analyst', desc: 'Completed 25 sessions' },
    { n: 50, title: 'Expert Subject', desc: 'Completed 50 sessions' },
    { n: 100, title: 'Century Club', desc: 'Completed 100 sessions' },
  ];

  for (const t of thresholds) {
    if (count >= t.n) {
      const session = sessions[t.n - 1]!;
      milestones.push({
        id: `milestone_${t.n}`,
        title: t.title,
        description: t.desc,
        achievedAt: session.timestamp,
        category: 'sessions',
      });
    }
  }

  const grades = ['A', 'B', 'C', 'D'];
  for (const grade of grades) {
    const idx = sessions.findIndex((s) => s.grade === grade);
    if (idx >= 0) {
      milestones.push({
        id: `milestone_grade_${grade}`,
        title: `Grade ${grade} Achieved`,
        description: `First session with grade ${grade}`,
        achievedAt: sessions[idx]!.timestamp,
        category: 'performance',
      });
    }
  }

  return milestones;
}

function buildTimeline(sessions: readonly SessionSnapshot[]): readonly TimelineEntry[] {
  const byDate = new Map<string, readonly SessionSnapshot[]>();
  for (const s of sessions) {
    const date = new Date(s.timestamp).toISOString().split('T')[0]!;
    const existing = byDate.get(date) ?? [];
    byDate.set(date, [...existing, s]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySessions]) => ({
      date,
      overallScore: Math.round(daySessions.reduce((a, s) => a + s.focusScore, 0) / daySessions.length),
      reactionTime: Math.round(daySessions.reduce((a, s) => a + s.medianRT, 0) / daySessions.length),
      consistency: Math.round(daySessions.reduce((a, s) => a + s.consistencyScore, 0) / daySessions.length * 100),
      fatigueIndex: Math.round(daySessions.reduce((a, s) => a + s.fatigueIndex, 0) / daySessions.length * 100),
    }));
}

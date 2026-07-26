import type { LearningProfile, CognitiveInput, SessionSnapshot } from './types';

export interface LearningEngine {
  readonly updateProfile: (input: CognitiveInput) => LearningProfile;
  readonly getProfile: () => LearningProfile;
  readonly reset: () => void;
}

function groupByHour(sessions: readonly SessionSnapshot[]): readonly string[] {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    const hour = new Date(s.timestamp).getHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const maxCount = Math.max(...counts.values());
  return [...counts.entries()]
    .filter(([, c]) => c === maxCount)
    .map(([h]) => `${h}:00`);
}

function meanDuration(sessions: readonly SessionSnapshot[]): number {
  if (sessions.length === 0) return 0;
  return sessions.reduce((s, sess) => s + sess.duration, 0) / sessions.length;
}

function detectFatiguePattern(sessions: readonly SessionSnapshot[]): string {
  if (sessions.length < 3) return 'insufficient data';
  const byRounds = new Map<number, number[]>();
  for (const s of sessions) {
    if (!byRounds.has(s.roundCount)) byRounds.set(s.roundCount, []);
    byRounds.get(s.roundCount)!.push(s.fatigueIndex);
  }
  for (let n = 1; n <= 10; n++) {
    const current = byRounds.get(n);
    const next = byRounds.get(n + 1);
    if (!current || !next || current.length < 2 || next.length < 2) continue;
    const avgCurrent = current.reduce((a, b) => a + b, 0) / current.length;
    const avgNext = next.reduce((a, b) => a + b, 0) / next.length;
    if (avgNext > avgCurrent * 1.2) return `fatigue after round ${n}`;
  }
  return 'no consistent pattern';
}

function classifyDifficulty(sessions: readonly SessionSnapshot[]): string {
  if (sessions.length === 0) return 'unknown';
  const avg = sessions.reduce((s, sess) => s + sess.focusScore, 0) / sessions.length;
  if (avg >= 70) return 'challenging';
  if (avg >= 40) return 'moderate';
  return 'easy';
}

export function createLearningEngine(): LearningEngine {
  let history: readonly SessionSnapshot[] = [];

  function buildProfile(): LearningProfile {
    return {
      preferredPlayTimes: groupByHour(history),
      averageSessionLength: meanDuration(history),
      typicalFatiguePattern: detectFatiguePattern(history),
      preferredDifficulty: classifyDifficulty(history),
      favoriteGames: ['reaction-light'],
      totalSessionsAnalyzed: history.length,
      lastUpdated: Date.now(),
    } as const;
  }

  return {
    updateProfile(input: CognitiveInput): LearningProfile {
      history = [...history, ...input.sessions];
      return buildProfile();
    },

    getProfile(): LearningProfile {
      return buildProfile();
    },

    reset(): void {
      history = [];
    },
  };
}

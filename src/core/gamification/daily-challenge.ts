export type DailyChallengeType = 'beat_time' | 'play_sessions' | 'reach_consistency';

export interface DailyChallenge {
  id: string;
  date: string;
  type: DailyChallengeType;
  target: number;
  title: string;
  description: string;
  completed: boolean;
  completedAt?: number;
}

const STORAGE_KEY = 'focus_daily_challenge';
const COMPLETED_KEY = 'focus_daily_completed';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function getDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateChallengeForDate(dateStr: string): DailyChallenge {
  const seed = dateStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = seededRandom(seed);

  const challenges: { type: DailyChallengeType; target: number; title: string; description: string }[] = [
    { type: 'beat_time', target: Math.round(180 + rand() * 40), title: 'Beat the Clock', description: '' },
    { type: 'beat_time', target: Math.round(160 + rand() * 30), title: 'Lightning Round', description: '' },
    { type: 'play_sessions', target: Math.round(2 + rand() * 2), title: 'Multi-Round', description: '' },
    { type: 'play_sessions', target: Math.round(3 + rand() * 2), title: 'Marathon Focus', description: '' },
    { type: 'reach_consistency', target: 1, title: 'Consistency King', description: '' },
  ];

  const pick = challenges[Math.floor(rand() * challenges.length)]!;

  let description: string;
  switch (pick.type) {
    case 'beat_time':
      description = `Achieve a reaction time under ${pick.target}ms`;
      break;
    case 'play_sessions':
      description = `Complete ${pick.target} sessions today`;
      break;
    case 'reach_consistency':
      description = 'Achieve an A or A+ consistency rating';
      break;
  }

  return {
    id: `daily-${dateStr}`,
    date: dateStr,
    type: pick.type,
    target: pick.target,
    title: `Today's Challenge: ${pick.title}`,
    description,
    completed: false,
  };
}

export function getTodayChallenge(): DailyChallenge {
  const today = getDateStr(new Date());
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as DailyChallenge;
      if (saved.date === today) return saved;
    }
  } catch { /* regenerate */ }

  const challenge = generateChallengeForDate(today);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(challenge));
  return challenge;
}

export function checkChallengeCompletion(
  challenge: DailyChallenge,
  stats: { bestTimeMs: number; sessionsToday: number; hasAGradeOrBetter: boolean }
): DailyChallenge {
  if (challenge.completed) return challenge;

  let completed = false;
  switch (challenge.type) {
    case 'beat_time':
      completed = stats.bestTimeMs > 0 && stats.bestTimeMs < challenge.target;
      break;
    case 'play_sessions':
      completed = stats.sessionsToday >= challenge.target;
      break;
    case 'reach_consistency':
      completed = stats.hasAGradeOrBetter;
      break;
  }

  if (completed) {
    const updated = { ...challenge, completed: true, completedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Track completed challenges count
    try {
      const raw = localStorage.getItem(COMPLETED_KEY);
      const count = raw ? parseInt(raw, 10) + 1 : 1;
      localStorage.setItem(COMPLETED_KEY, String(count));
    } catch { /* silent */ }
    return updated;
  }
  return challenge;
}

export function getCompletedChallengeCount(): number {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

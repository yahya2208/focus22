export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'speed' | 'consistency' | 'streak' | 'milestone' | 'challenge';
  requirement: number;
  unlockedAt?: number;
}

export type AchievementId =
  | 'first_light'
  | 'speed_demon'
  | 'lightning_reflexes'
  | 'sub_200'
  | 'sub_150'
  | 'consistent_streak_3'
  | 'consistent_streak_7'
  | 'consistent_streak_30'
  | 'session_10'
  | 'session_50'
  | 'session_100'
  | 'daily_challenge_1'
  | 'daily_challenge_7'
  | 'daily_challenge_30'
  | 'perfect_consistency'
  | 'no_fatigue'
  | 'night_owl'
  | 'early_bird';

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_light', title: 'First Light', description: 'Complete your first measurement', icon: '💡', category: 'milestone', requirement: 1 },
  { id: 'speed_demon', title: 'Speed Demon', description: 'Achieve a reaction time under 250ms', icon: '⚡', category: 'speed', requirement: 250 },
  { id: 'lightning_reflexes', title: 'Lightning Reflexes', description: 'Achieve a reaction time under 200ms', icon: '🌩️', category: 'speed', requirement: 200 },
  { id: 'sub_200', title: 'Sub-200 Club', description: 'Average reaction time under 200ms', icon: '🎯', category: 'speed', requirement: 200 },
  { id: 'sub_150', title: 'Sub-150 Elite', description: 'Average reaction time under 150ms', icon: '🏆', category: 'speed', requirement: 150 },
  { id: 'consistent_streak_3', title: 'Steady Hand', description: '3 consecutive sessions with A grade', icon: '✋', category: 'consistency', requirement: 3 },
  { id: 'consistent_streak_7', title: 'Iron Focus', description: '7 consecutive sessions with A grade', icon: '🔥', category: 'consistency', requirement: 7 },
  { id: 'consistent_streak_30', title: 'Unbreakable', description: '30 consecutive sessions with A grade', icon: '💎', category: 'consistency', requirement: 30 },
  { id: 'session_10', title: 'Getting Serious', description: 'Complete 10 sessions', icon: '📊', category: 'milestone', requirement: 10 },
  { id: 'session_50', title: 'Dedicated', description: 'Complete 50 sessions', icon: '🏅', category: 'milestone', requirement: 50 },
  { id: 'session_100', title: 'Centurion', description: 'Complete 100 sessions', icon: '👑', category: 'milestone', requirement: 100 },
  { id: 'daily_challenge_1', title: 'Challenger', description: 'Complete your first daily challenge', icon: '🗡️', category: 'challenge', requirement: 1 },
  { id: 'daily_challenge_7', title: 'Weekly Warrior', description: 'Complete 7 daily challenges', icon: '⚔️', category: 'challenge', requirement: 7 },
  { id: 'daily_challenge_30', title: 'Monthly Master', description: 'Complete 30 daily challenges', icon: '🐉', category: 'challenge', requirement: 30 },
  { id: 'perfect_consistency', title: 'Perfect Consistency', description: 'Achieve A+ consistency rating', icon: '✨', category: 'consistency', requirement: 1 },
  { id: 'no_fatigue', title: 'Fresh Mind', description: 'Complete a session with no fatigue detected', icon: '🧠', category: 'milestone', requirement: 1 },
  { id: 'night_owl', title: 'Night Owl', description: 'Complete a session after midnight', icon: '🦉', category: 'milestone', requirement: 1 },
  { id: 'early_bird', title: 'Early Bird', description: 'Complete a session before 7 AM', icon: '🌅', category: 'milestone', requirement: 1 },
];

const STORAGE_KEY = 'focus_achievements';

export function loadAchievements(): Achievement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ACHIEVEMENTS;
    const saved = JSON.parse(raw) as Record<string, { unlockedAt: number }>;
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedAt: saved[a.id]?.unlockedAt,
    }));
  } catch {
    return ACHIEVEMENTS;
  }
}

export function saveAchievements(achievements: Achievement[]): void {
  const data: Record<string, { unlockedAt: number }> = {};
  achievements.forEach((a) => {
    if (a.unlockedAt) data[a.id] = { unlockedAt: a.unlockedAt };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function checkAchievements(
  current: Achievement[],
  stats: {
    totalSessions: number;
    bestTimeMs: number;
    avgTimeMs: number;
    consecutiveAGrade: number;
    consecutiveChallenges: number;
    hasNoFatigue: boolean;
    hasAPLusConsistency: boolean;
    hourOfDay: number;
  }
): { updated: Achievement[]; newlyUnlocked: Achievement[] } {
  const newlyUnlocked: Achievement[] = [];
  const updated = current.map((a) => {
    if (a.unlockedAt) return a;
    let unlock = false;
    switch (a.id) {
      case 'first_light': unlock = stats.totalSessions >= 1; break;
      case 'speed_demon': unlock = stats.bestTimeMs > 0 && stats.bestTimeMs < 250; break;
      case 'lightning_reflexes': unlock = stats.bestTimeMs > 0 && stats.bestTimeMs < 200; break;
      case 'sub_200': unlock = stats.avgTimeMs > 0 && stats.avgTimeMs < 200; break;
      case 'sub_150': unlock = stats.avgTimeMs > 0 && stats.avgTimeMs < 150; break;
      case 'consistent_streak_3': unlock = stats.consecutiveAGrade >= 3; break;
      case 'consistent_streak_7': unlock = stats.consecutiveAGrade >= 7; break;
      case 'consistent_streak_30': unlock = stats.consecutiveAGrade >= 30; break;
      case 'session_10': unlock = stats.totalSessions >= 10; break;
      case 'session_50': unlock = stats.totalSessions >= 50; break;
      case 'session_100': unlock = stats.totalSessions >= 100; break;
      case 'daily_challenge_1': unlock = stats.consecutiveChallenges >= 1; break;
      case 'daily_challenge_7': unlock = stats.consecutiveChallenges >= 7; break;
      case 'daily_challenge_30': unlock = stats.consecutiveChallenges >= 30; break;
      case 'perfect_consistency': unlock = stats.hasAPLusConsistency; break;
      case 'no_fatigue': unlock = stats.hasNoFatigue; break;
      case 'night_owl': unlock = stats.hourOfDay >= 0 && stats.hourOfDay < 5; break;
      case 'early_bird': unlock = stats.hourOfDay >= 5 && stats.hourOfDay < 7; break;
    }
    if (unlock) {
      const unlocked = { ...a, unlockedAt: Date.now() };
      newlyUnlocked.push(unlocked);
      return unlocked;
    }
    return a;
  });
  return { updated, newlyUnlocked };
}

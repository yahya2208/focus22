import type { Session } from '../session';
import type { SessionRepository, SessionFilter } from '../repository/types';

export interface HistoryStats {
  readonly totalSessions: number;
  readonly totalGameModes: number;
  readonly avgFocusScore: number;
  readonly bestFocusScore: number;
  readonly worstFocusScore: number;
  readonly avgReactionTime: number;
  readonly medianReactionTime: number;
  readonly totalPlayTimeMs: number;
  readonly uniqueDaysPlayed: number;
}

export interface TrendPoint {
  readonly date: string;
  readonly avgScore: number;
  readonly sessionCount: number;
}

export interface TrendPeriod {
  readonly period: 'daily' | 'weekly' | 'monthly';
  readonly points: readonly TrendPoint[];
}

export interface HistorySearchResult {
  readonly sessions: readonly Session[];
  readonly total: number;
}

export interface HistoryService {
  getStats(filter?: SessionFilter): Promise<HistoryStats>;
  getTrend(period: 'daily' | 'weekly' | 'monthly', filter?: SessionFilter): Promise<TrendPeriod>;
  search(query: string, limit?: number): Promise<HistorySearchResult>;
  exportSessions(filter?: SessionFilter): Promise<string>;
}

function getDateKey(timestamp: number, period: 'daily' | 'weekly' | 'monthly'): string {
  const d = new Date(timestamp);
  if (period === 'daily') {
    return d.toISOString().slice(0, 10);
  }
  if (period === 'weekly') {
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function createHistoryService(repo: SessionRepository): HistoryService {
  return {
    async getStats(filter?: SessionFilter): Promise<HistoryStats> {
      const { sessions } = await repo.getAll(filter, undefined, 0, 10000);

      if (sessions.length === 0) {
        return {
          totalSessions: 0,
          totalGameModes: 0,
          avgFocusScore: 0,
          bestFocusScore: 0,
          worstFocusScore: 0,
          avgReactionTime: 0,
          medianReactionTime: 0,
          totalPlayTimeMs: 0,
          uniqueDaysPlayed: 0,
        };
      }

      const scores = sessions
        .filter((s) => s.scientificResults != null)
        .map((s) => s.scientificResults!.focusScore);

      const rts = sessions
        .filter((s) => s.scientificResults != null)
        .map((s) => s.scientificResults!.meanCorrectedMs);

      const gameModes = new Set(sessions.map((s) => s.pluginId));
      const days = new Set(sessions.map((s) => new Date(s.createdAt).toISOString().slice(0, 10)));

      const totalPlayTime = sessions.reduce((sum, s) => {
        if (s.finishedAt && s.createdAt) return sum + (s.finishedAt - s.createdAt);
        return sum;
      }, 0);

      return {
        totalSessions: sessions.length,
        totalGameModes: gameModes.size,
        avgFocusScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        bestFocusScore: scores.length > 0 ? Math.max(...scores) : 0,
        worstFocusScore: scores.length > 0 ? Math.min(...scores) : 0,
        avgReactionTime: rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0,
        medianReactionTime: rts.length > 0 ? calculateMedian(rts) : 0,
        totalPlayTimeMs: totalPlayTime,
        uniqueDaysPlayed: days.size,
      };
    },

    async getTrend(
      period: 'daily' | 'weekly' | 'monthly',
      filter?: SessionFilter,
    ): Promise<TrendPeriod> {
      const { sessions } = await repo.getAll(filter, undefined, 0, 10000);

      const grouped = new Map<string, { scores: number[]; count: number }>();

      for (const session of sessions) {
        const key = getDateKey(session.createdAt, period);
        const existing = grouped.get(key) ?? { scores: [], count: 0 };
        grouped.set(key, {
          scores: [
            ...existing.scores,
            ...(session.scientificResults != null ? [session.scientificResults.focusScore] : []),
          ],
          count: existing.count + 1,
        });
      }

      const points: TrendPoint[] = Array.from(grouped.entries())
        .map(([date, data]) => ({
          date,
          avgScore: data.scores.length > 0
            ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
            : 0,
          sessionCount: data.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return { period, points };
    },

    async search(query: string, limit = 20): Promise<HistorySearchResult> {
      const { sessions } = await repo.getAll(undefined, undefined, 0, 10000);
      const lower = query.toLowerCase();
      const matched = sessions.filter(
        (s) =>
          s.pluginId.toLowerCase().includes(lower) ||
          s.status.toLowerCase().includes(lower) ||
          s.id.toLowerCase().includes(lower) ||
          (s.scientificResults?.grade.toLowerCase().includes(lower) ?? false),
      );

      return { sessions: matched.slice(0, limit), total: matched.length };
    },

    async exportSessions(filter?: SessionFilter): Promise<string> {
      const { sessions } = await repo.getAll(filter, undefined, 0, 10000);
      return JSON.stringify(sessions, null, 2);
    },
  };
}

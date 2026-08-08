import type { Session } from '../session';
import type { DeviceProfile } from '../device';
import type { ResearchFilters } from './filters';

export interface OverviewStats {
  readonly totalUsers: number;
  readonly guestUsers: number;
  readonly registeredUsers: number;
  readonly conversionRate: number;
  readonly totalSessions: number;
  readonly gamesPlayed: number;
  readonly gamesToday: number;
  readonly gamesThisWeek: number;
  readonly gamesThisMonth: number;
  readonly avgReactionTime: number;
  readonly avgFocusScore: number;
  readonly avgConsistency: number;
  readonly avgFatigue: number;
  readonly avgCalibrationConfidence: number;
  readonly countries: number;
  readonly cities: number;
  readonly devices: number;
  readonly currentOnline: number;
  readonly peakToday: number;
  readonly retentionD1: number;
  readonly retentionD7: number;
  readonly retentionD30: number;
}

export interface ScientificMetrics {
  readonly reactionTime: { readonly median: number; readonly mean: number; readonly stdDev: number; readonly variance: number };
  readonly percentiles: { readonly p50: number; readonly p75: number; readonly p90: number; readonly p95: number; readonly p99: number };
  readonly falseStarts: number;
  readonly accuracy: number;
  readonly consistency: { readonly score: number; readonly rating: string; readonly cv: number };
  readonly fatigue: { readonly index: number; readonly score: number; readonly detected: boolean };
  readonly calibrationConfidence: number;
  readonly distribution: { readonly label: string; readonly value: number }[];
  readonly byDimension: Record<string, { readonly mean: number; readonly count: number }>;
}

export interface UserAnalytics {
  readonly guestUsers: number;
  readonly registeredUsers: number;
  readonly conversions: number;
  readonly newUsers: number;
  readonly returningUsers: number;
  readonly dailyActiveUsers: number;
  readonly weeklyActiveUsers: number;
  readonly monthlyActiveUsers: number;
  readonly avgSessionsPerUser: number;
  readonly avgGamesPerUser: number;
}

export interface SessionAnalytics {
  readonly sessionsTimeline: { readonly date: string; readonly count: number; readonly completed: number }[];
  readonly completionRate: number;
  readonly abortRate: number;
  readonly calibrationFailures: number;
  readonly avgSessionDuration: number;
  readonly avgGameDuration: number;
  readonly avgCountdownTime: number;
  readonly stateDistribution: { readonly state: string; readonly count: number }[];
  readonly syncSuccessRate: number;
  readonly offlineSessions: number;
  readonly pendingSync: number;
  readonly failedSync: number;
}

export interface DeviceAnalytics {
  readonly osDistribution: { readonly os: string; readonly count: number; readonly percentage: number }[];
  readonly browserDistribution: { readonly browser: string; readonly count: number; readonly percentage: number }[];
  readonly refreshRateDistribution: { readonly rate: number; readonly count: number }[];
  readonly cpuCoresDistribution: { readonly cores: number; readonly count: number }[];
  readonly ramDistribution: { readonly ram: string; readonly count: number }[];
  readonly inputTypeDistribution: { readonly type: string; readonly count: number }[];
  readonly resolutionDistribution: { readonly resolution: string; readonly count: number }[];
  readonly calibrationByDevice: { readonly device: string; readonly avgConfidence: number }[];
  readonly inputLagDistribution: { readonly label: string; readonly count: number }[];
}

export interface SurveyAnalytics {
  readonly ageDistribution: { readonly range: string; readonly count: number }[];
  readonly genderDistribution: { readonly gender: string; readonly count: number }[];
  readonly educationDistribution: { readonly level: string; readonly count: number }[];
  readonly countryDistribution: { readonly country: string; readonly count: number }[];
  readonly sleepDistribution: { readonly hours: string; readonly count: number }[];
  readonly coffeeDistribution: { readonly frequency: string; readonly count: number }[];
  readonly exerciseDistribution: { readonly frequency: string; readonly count: number }[];
  readonly completionRate: number;
  readonly correlationMatrix: { readonly field1: string; readonly field2: string; readonly correlation: number }[];
}

export interface LiveEvent {
  readonly type: 'player_connected' | 'landing' | 'calibration' | 'countdown' | 'playing' | 'finished' | 'results' | 'registration' | 'synced';
  readonly timestamp: number;
  readonly sessionId: string;
  readonly userId: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  readonly supabaseStatus: 'healthy' | 'degraded' | 'down';
  readonly realtimeStatus: 'connected' | 'disconnected' | 'reconnecting';
  readonly offlineQueueLength: number;
  readonly syncQueueLength: number;
  readonly dbLatencyMs: number;
  readonly apiResponseTimeMs: number;
  readonly errors24h: number;
  readonly warnings24h: number;
  readonly telemetryHealth: 'healthy' | 'degraded' | 'down';
  readonly storageUsedMb: number;
  readonly buildVersion: string;
  readonly gitTag: string;
}

export interface ResearchAPI {
  getOverview(filters?: ResearchFilters): Promise<OverviewStats>;
  getScientific(filters?: ResearchFilters): Promise<ScientificMetrics>;
  getUserAnalytics(filters?: ResearchFilters): Promise<UserAnalytics>;
  getSessionAnalytics(filters?: ResearchFilters): Promise<SessionAnalytics>;
  getDeviceAnalytics(filters?: ResearchFilters): Promise<DeviceAnalytics>;
  getSurveyAnalytics(filters?: ResearchFilters): Promise<SurveyAnalytics>;
  getLiveEvents(): readonly LiveEvent[];
  addLiveEvent(event: LiveEvent): void;
  getSystemHealth(): Promise<SystemHealth>;
}

const EMPTY_OVERVIEW: OverviewStats = {
  totalUsers: 0, guestUsers: 0, registeredUsers: 0, conversionRate: 0,
  totalSessions: 0, gamesPlayed: 0, gamesToday: 0, gamesThisWeek: 0, gamesThisMonth: 0,
  avgReactionTime: 0, avgFocusScore: 0, avgConsistency: 0, avgFatigue: 0, avgCalibrationConfidence: 0,
  countries: 0, cities: 0, devices: 0,
  currentOnline: 0, peakToday: 0, retentionD1: 0, retentionD7: 0, retentionD30: 0,
};

export function createResearchAPI(
  sessions: readonly Session[] = [],
  _devices: readonly DeviceProfile[] = [],
): ResearchAPI {
  const liveEvents: LiveEvent[] = [];

  function filterSessions(filters?: ResearchFilters): readonly Session[] {
    if (!filters) return sessions;
    return sessions.filter((s) => {
      if (filters.dateFrom && s.createdAt < filters.dateFrom) return false;
      if (filters.dateTo && s.createdAt > filters.dateTo) return false;
      if (filters.game && s.pluginId !== filters.game) return false;
      return true;
    });
  }

  function computeScientificFromSessions(filtered: readonly Session[]): ScientificMetrics {
    const completed = filtered.filter((s) => s.scientificResults);
    const rts = completed.flatMap((s) => s.measurements?.correctedRts ?? []);
    const consistencies = completed.map((s) => s.scientificResults!.consistencyScore);
    const fatigues = completed.map((s) => s.scientificResults!.fatigueScore);

    const n = rts.length;
    const mean = n > 0 ? rts.reduce((a, b) => a + b, 0) / n : 0;
    const sorted = [...rts].sort((a, b) => a - b);
    const median = n > 0 ? (n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!) : 0;
    const variance = n > 0 ? rts.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0;

    return {
      reactionTime: { median, mean, stdDev: Math.sqrt(variance), variance },
      percentiles: computePercentiles(rts),
      falseStarts: 0,
      accuracy: completed.length > 0 ? completed.length / filtered.length : 0,
      consistency: {
        score: consistencies.length > 0 ? consistencies.reduce((a, b) => a + b, 0) / consistencies.length : 0,
        rating: 'unknown',
        cv: mean > 0 ? Math.sqrt(variance) / mean : 0,
      },
      fatigue: {
        index: fatigues.length > 0 ? fatigues.reduce((a, b) => a + b, 0) / fatigues.length : 0,
        score: fatigues.length > 0 ? fatigues.reduce((a, b) => a + b, 0) / fatigues.length : 0,
        detected: false,
      },
      calibrationConfidence: 0,
      distribution: computeDistribution(rts, 10),
      byDimension: {},
    };
  }

  return {
    async getOverview(filters?: ResearchFilters): Promise<OverviewStats> {
      const filtered = filterSessions(filters);
      const now = Date.now();
      const dayMs = 86400000;
      const completed = filtered.filter((s) => s.status === 'completed');

      // In-memory mock has no user identity, so deviceId approximates a returning
      // user. The live implementation (api-supabase) groups by user_id.
      const deviceActiveDays = new Map<string, Set<string>>();
      const firstDeviceDay = new Map<string, string>();
      for (const s of filtered) {
        if (!s.deviceId) continue;
        const day = new Date(s.createdAt).toISOString().slice(0, 10);
        if (!deviceActiveDays.has(s.deviceId)) deviceActiveDays.set(s.deviceId, new Set());
        deviceActiveDays.get(s.deviceId)!.add(day);
        if (!firstDeviceDay.has(s.deviceId)) firstDeviceDay.set(s.deviceId, day);
      }
      const retentionRate = (delta: number): number => {
        let returned = 0;
        let total = 0;
        for (const [deviceId, firstDay] of firstDeviceDay) {
          const days = deviceActiveDays.get(deviceId);
          if (!days || days.size < 1) continue;
          total++;
          const target = new Date(firstDay);
          target.setDate(target.getDate() + delta);
          if (days.has(target.toISOString().slice(0, 10))) returned++;
        }
        return total > 0 ? Math.round((returned / total) * 100) : 0;
      };

      return {
        ...EMPTY_OVERVIEW,
        totalSessions: filtered.length,
        gamesPlayed: completed.length,
        gamesToday: filtered.filter((s) => now - s.createdAt < dayMs).length,
        gamesThisWeek: filtered.filter((s) => now - s.createdAt < 7 * dayMs).length,
        gamesThisMonth: filtered.filter((s) => now - s.createdAt < 30 * dayMs).length,
        avgFocusScore: completed.length > 0 ? completed.reduce((a, s) => a + (s.scientificResults?.focusScore ?? 0), 0) / completed.length : 0,
        devices: new Set(filtered.map((s) => s.deviceId)).size,
        retentionD1: retentionRate(1),
        retentionD7: retentionRate(7),
        retentionD30: retentionRate(30),
      };
    },

    async getScientific(filters?: ResearchFilters): Promise<ScientificMetrics> {
      return computeScientificFromSessions(filterSessions(filters));
    },

    async getUserAnalytics(_filters?: ResearchFilters): Promise<UserAnalytics> {
      void filterSessions;
      // In-memory mock has no user identity, so deviceId approximates a returning user.
      const deviceActiveDays = new Map<string, Set<string>>();
      for (const s of sessions) {
        if (!s.deviceId) continue;
        const day = new Date(s.createdAt).toISOString().slice(0, 10);
        if (!deviceActiveDays.has(s.deviceId)) deviceActiveDays.set(s.deviceId, new Set());
        deviceActiveDays.get(s.deviceId)!.add(day);
      }
      const returningUsers = [...deviceActiveDays.values()].filter((days) => days.size >= 2).length;
      return {
        guestUsers: 0, registeredUsers: 0, conversions: 0,
        newUsers: 0, returningUsers,
        dailyActiveUsers: 0, weeklyActiveUsers: 0, monthlyActiveUsers: 0,
        avgSessionsPerUser: 0, avgGamesPerUser: 0,
      };
    },

    async getSessionAnalytics(filters?: ResearchFilters): Promise<SessionAnalytics> {
      const filteredSessions = filterSessions(filters);
      const completed = filteredSessions.filter((s) => s.status === 'completed').length;
      return {
        sessionsTimeline: [], completionRate: filteredSessions.length > 0 ? completed / filteredSessions.length : 0,
        abortRate: 0, calibrationFailures: 0,
        avgSessionDuration: 0, avgGameDuration: 0, avgCountdownTime: 0,
        stateDistribution: [], syncSuccessRate: 0, offlineSessions: 0, pendingSync: 0, failedSync: 0,
      };
    },

    async getDeviceAnalytics(_filters?: ResearchFilters): Promise<DeviceAnalytics> {
      return {
        osDistribution: [], browserDistribution: [], refreshRateDistribution: [],
        cpuCoresDistribution: [], ramDistribution: [], inputTypeDistribution: [],
        resolutionDistribution: [], calibrationByDevice: [], inputLagDistribution: [],
      };
    },

    async getSurveyAnalytics(_filters?: ResearchFilters): Promise<SurveyAnalytics> {
      return {
        ageDistribution: [], genderDistribution: [], educationDistribution: [],
        countryDistribution: [], sleepDistribution: [], coffeeDistribution: [],
        exerciseDistribution: [], completionRate: 0, correlationMatrix: [],
      };
    },

    getLiveEvents(): readonly LiveEvent[] {
      return [...liveEvents];
    },

    addLiveEvent(event: LiveEvent): void {
      liveEvents.push(event);
      if (liveEvents.length > 1000) liveEvents.splice(0, liveEvents.length - 1000);
    },

    async getSystemHealth(): Promise<SystemHealth> {
      return {
        supabaseStatus: 'healthy', realtimeStatus: 'connected',
        offlineQueueLength: 0, syncQueueLength: 0,
        dbLatencyMs: 0, apiResponseTimeMs: 0,
        errors24h: 0, warnings24h: 0, telemetryHealth: 'healthy',
        storageUsedMb: 0, buildVersion: '0.1.0-alpha', gitTag: 'v2.0-phase7',
      };
    },
  };
}

function computePercentiles(values: readonly number[]): { p50: number; p75: number; p90: number; p95: number; p99: number } {
  if (values.length === 0) return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p = (n: number) => sorted[Math.max(0, Math.ceil(sorted.length * n / 100) - 1)]!;
  return { p50: p(50), p75: p(75), p90: p(90), p95: p(95), p99: p(99) };
}

function computeDistribution(values: readonly number[], bins: number): { label: string; value: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: `${min.toFixed(0)}`, value: values.length }];
  const size = (max - min) / bins;
  const result: { label: string; value: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = min + i * size;
    const hi = lo + size;
    const count = values.filter((v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
    result.push({ label: `${lo.toFixed(0)}-${hi.toFixed(0)}`, value: count });
  }
  return result;
}

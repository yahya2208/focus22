import type { ResearchFilters } from './filters';
import { getSupabaseClient } from '../supabase/client';
import { parseDeviceBrandModel } from '../device/parser';

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

export interface DeviceHealthMetrics {
  readonly avgCalibrationConfidence: number;
  readonly reactionConsistency: number;
  readonly completionRate: number;
  readonly failureRate: number;
  readonly abandonRate: number;
  readonly ranking: 'excellent' | 'good' | 'average' | 'poor' | 'bad';
  readonly avgFocusScore: number;
}

export interface DeviceIntelligence {
  readonly id: string;
  readonly browser: string;
  readonly browserVersion: string;
  readonly os: string;
  readonly osVersion: string;
  readonly platform: string;
  readonly brand: string;
  readonly model: string;
  readonly marketingName: string;
  readonly language: string | null;
  readonly userAgent: string | null;
  readonly collectedAt: string | null;
  readonly sessionsCount: number;
  readonly completedSessions: number;
  readonly abandonedSessions: number;
  readonly avgDuration: number;
  readonly avgRt: number;
  readonly avgFocusScore: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly health: DeviceHealthMetrics;
}

export interface DeviceHierarchyGroup {
  readonly os: string;
  readonly count: number;
  readonly brands: readonly DeviceBrandGroup[];
}

export interface DeviceBrandGroup {
  readonly brand: string;
  readonly count: number;
  readonly models: readonly DeviceModelGroup[];
}

export interface DeviceModelGroup {
  readonly model: string;
  readonly count: number;
  readonly marketingName: string;
  readonly devices: readonly DeviceIntelligence[];
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

export interface SessionRow {
  readonly id: string;
  readonly createdAt: string;
  readonly status: string;
  readonly endedReason: string | null;
  readonly lastActivityAt: string | null;
  readonly userName: string;
  readonly userType: 'Guest' | 'Registered';
  readonly pluginId: string;
  readonly correctedRts: readonly number[];
  readonly avgRt: number;
  readonly bestRt: number;
  readonly grade: string;
  readonly focusScore: number;
  readonly consistencyRating: string;
  readonly deviceInfo: string;
  readonly deviceOs: string;
  readonly deviceBrowser: string;
  readonly brand: string;
  readonly model: string;
  readonly marketingName: string;
  readonly language: string | null;
  readonly userAgent: string | null;
  readonly fatigueScore: number | null;
  readonly calibrationConfidence: number | null;
}

export interface ResearchAPI {
  getOverview(filters?: ResearchFilters): Promise<OverviewStats>;
  getScientific(filters?: ResearchFilters): Promise<ScientificMetrics>;
  getUserAnalytics(filters?: ResearchFilters): Promise<UserAnalytics>;
  getSessionAnalytics(filters?: ResearchFilters): Promise<SessionAnalytics>;
  getSessionList(filters?: ResearchFilters): Promise<readonly SessionRow[]>;
  getDeviceAnalytics(filters?: ResearchFilters): Promise<DeviceAnalytics>;
  getDeviceIntelligence(filters?: ResearchFilters): Promise<readonly DeviceHierarchyGroup[]>;
  getLiveEvents(): readonly LiveEvent[];
  addLiveEvent(event: LiveEvent): void;
  getSystemHealth(): Promise<SystemHealth>;
}

export function createResearchAPI(): ResearchAPI {
  const liveEvents: LiveEvent[] = [];
  const client = getSupabaseClient();

  return {
    async getOverview(filters?: ResearchFilters): Promise<OverviewStats> {
      void filters;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [usersResult, sessionsResult, todayResult, weekResult, monthResult, runningResult] = await Promise.all([
        client.from('users').select('id, role', { count: 'exact' }),
        client.from('sessions').select('id, status, measurements, scientific_results, created_at, device_id, user_id, calibration_id', { count: 'exact' }),
        client.from('sessions').select('id, created_at', { count: 'exact' }).gte('created_at', todayStart),
        client.from('sessions').select('id', { count: 'exact' }).gte('created_at', weekStart),
        client.from('sessions').select('id', { count: 'exact' }).gte('created_at', monthStart),
        client.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      ]);

      const users = usersResult.data ?? [];
      const sessions = sessionsResult.data ?? [];
      const runningCount = runningResult.count ?? 0;
      const completedSessions = sessions.filter(s => s.status === 'completed');

      const guestUsers = users.filter(u => u.role === 'guest').length;
      const registeredUsers = users.filter(u => u.role !== 'guest').length;
      const conversionRate = users.length > 0 ? (registeredUsers / users.length) * 100 : 0;

      const focusScores = completedSessions
        .map(s => (s.scientific_results as Record<string, unknown>)?.focus_score as number)
        .filter(score => typeof score === 'number' && !isNaN(score));

      const allCorrectedRts = completedSessions.flatMap(s => {
        const measurements = s.measurements as Record<string, unknown> | null;
        return ((measurements?.corrected_rts as number[]) ?? []);
      });

      const avgFocusScore = focusScores.length > 0
        ? focusScores.reduce((a, b) => a + b, 0) / focusScores.length
        : 0;

      const uniqueDevices = new Set(sessions.map(s => s.device_id)).size;

      const todaySessions = todayResult.data ?? [];
      const hourBuckets = new Map<number, number>();
      for (const s of todaySessions) {
        if (s.created_at) {
          const hour = new Date(s.created_at as string).getHours();
          hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);
        }
      }
      const peakToday = hourBuckets.size > 0 ? Math.max(...hourBuckets.values()) : 0;

      const userFirstSession = new Map<string, string>();
      const userDaySet = new Map<string, Set<string>>();
      for (const s of sessions) {
        if (!s.user_id) continue;
        const uid = s.user_id as string;
        const day = (s.created_at as string).slice(0, 10);
        if (!userFirstSession.has(uid)) userFirstSession.set(uid, day);
        if (!userDaySet.has(uid)) userDaySet.set(uid, new Set());
        userDaySet.get(uid)!.add(day);
      }
      const retentionD1 = (() => {
        let returned = 0;
        let total = 0;
        for (const [uid, firstDay] of userFirstSession) {
          const days = userDaySet.get(uid);
          if (!days || days.size < 1) continue;
          total++;
          const nextDay = new Date(firstDay);
          nextDay.setDate(nextDay.getDate() + 1);
          const nextDayStr = nextDay.toISOString().slice(0, 10);
          if (days.has(nextDayStr)) returned++;
        }
        return total > 0 ? Math.round((returned / total) * 100) : 0;
      })();
      const retentionD7 = (() => {
        let returned = 0;
        let total = 0;
        for (const [uid, firstDay] of userFirstSession) {
          const days = userDaySet.get(uid);
          if (!days || days.size < 1) continue;
          total++;
          const weekLater = new Date(firstDay);
          weekLater.setDate(weekLater.getDate() + 7);
          const weekLaterStr = weekLater.toISOString().slice(0, 10);
          if (days.has(weekLaterStr)) returned++;
        }
        return total > 0 ? Math.round((returned / total) * 100) : 0;
      })();
      const retentionD30 = (() => {
        let returned = 0;
        let total = 0;
        for (const [uid, firstDay] of userFirstSession) {
          const days = userDaySet.get(uid);
          if (!days || days.size < 1) continue;
          total++;
          const monthLater = new Date(firstDay);
          monthLater.setDate(monthLater.getDate() + 30);
          const monthLaterStr = monthLater.toISOString().slice(0, 10);
          if (days.has(monthLaterStr)) returned++;
        }
        return total > 0 ? Math.round((returned / total) * 100) : 0;
      })();

      const avgCalibrationConfidence = await (async () => {
        const calibrationIds = [...new Set(completedSessions
          .map(s => (s as { calibration_id?: string | null }).calibration_id)
          .filter((v): v is string => typeof v === 'string' && v !== ''))];
        if (calibrationIds.length === 0) return 0;
        const { data: cals } = await client
          .from('calibrations')
          .select('id, confidence')
          .in('id', calibrationIds.slice(0, 100));
        const confidences = (cals ?? [])
          .map(c => c.confidence)
          .filter((v): v is number => typeof v === 'number' && !isNaN(v));
        return confidences.length > 0
          ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10
          : 0;
      })();

      return {
        totalUsers: users.length,
        guestUsers,
        registeredUsers,
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalSessions: sessionsResult.count ?? 0,
        gamesPlayed: completedSessions.length,
        gamesToday: todayResult.count ?? 0,
        gamesThisWeek: weekResult.count ?? 0,
        gamesThisMonth: monthResult.count ?? 0,
        avgReactionTime: allCorrectedRts.length > 0 ? Math.round(allCorrectedRts.reduce((a, b) => a + b, 0) / allCorrectedRts.length) : 0,
        avgFocusScore: Math.round(avgFocusScore * 10) / 10,
        avgConsistency: (() => {
          const consistencyScores = completedSessions
            .map(s => (s.scientific_results as Record<string, unknown>)?.consistency_score as number)
            .filter(score => typeof score === 'number' && !isNaN(score));
          return consistencyScores.length > 0 ? Math.round(consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length * 10) / 10 : 0;
        })(),
        avgFatigue: (() => {
          const fatigueScores = completedSessions
            .map(s => (s.scientific_results as Record<string, unknown>)?.fatigue_score as number)
            .filter(score => typeof score === 'number' && !isNaN(score));
          return fatigueScores.length > 0 ? Math.round(fatigueScores.reduce((a, b) => a + b, 0) / fatigueScores.length * 10) / 10 : 0;
        })(),
        avgCalibrationConfidence,
        countries: 0,
        cities: 0,
        devices: uniqueDevices,
        currentOnline: runningCount,
        peakToday,
        retentionD1,
        retentionD7,
        retentionD30,
      };
    },

    async getScientific(filters?: ResearchFilters): Promise<ScientificMetrics> {
      let query = client.from('sessions').select('measurements, scientific_results').eq('status', 'completed');
      
      if (filters?.dateFrom) query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
      if (filters?.dateTo) query = query.lte('created_at', new Date(filters.dateTo).toISOString());
      if (filters?.game) query = query.eq('plugin_id', filters.game);

      const { data } = await query;
      const sessions = data ?? [];

      const allCorrectedRts = sessions.flatMap(s => {
        const measurements = s.measurements as Record<string, unknown> | null;
        return (measurements?.corrected_rts as number[]) ?? [];
      });

      const consistencyScores = sessions
        .map(s => (s.scientific_results as Record<string, unknown>)?.consistency_score as number)
        .filter(score => typeof score === 'number');

      const fatigueScores = sessions
        .map(s => (s.scientific_results as Record<string, unknown>)?.fatigue_score as number)
        .filter(score => typeof score === 'number');

      const falseStarts = allCorrectedRts.filter(rt => rt < 150).length;

      const n = allCorrectedRts.length;
      const mean = n > 0 ? allCorrectedRts.reduce((a, b) => a + b, 0) / n : 0;
      const sorted = [...allCorrectedRts].sort((a, b) => a - b);
      const median = n > 0 ? (n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!) : 0;
      const variance = n > 0 ? allCorrectedRts.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

      const consistencyScore = consistencyScores.length > 0
        ? consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length
        : cv > 0 ? Math.max(0, 100 - cv * 100) : 0;

      const rating = consistencyScore >= 80 ? 'excellent' : consistencyScore >= 60 ? 'good'
        : consistencyScore >= 40 ? 'average' : consistencyScore >= 20 ? 'poor' : 'unknown';

      const fatigueIndex = fatigueScores.length > 0
        ? fatigueScores.reduce((a, b) => a + b, 0) / fatigueScores.length / 100
        : 0;

      return {
        reactionTime: { median, mean, stdDev: Math.sqrt(variance), variance },
        percentiles: computePercentiles(allCorrectedRts),
        falseStarts,
        accuracy: sessions.length > 0 ? Math.round((1 - falseStarts / n) * 100) : 0,
        consistency: {
          score: Math.round(consistencyScore * 10) / 10,
          rating,
          cv: Math.round(cv * 1000) / 1000,
        },
        fatigue: {
          index: Math.round(fatigueIndex * 1000) / 1000,
          score: Math.round(fatigueScores.length > 0 ? fatigueScores.reduce((a, b) => a + b, 0) / fatigueScores.length : 0),
          detected: fatigueIndex > 0.1,
        },
        calibrationConfidence: 0,
        distribution: computeDistribution(allCorrectedRts, 10),
        byDimension: {},
      };
    },

    async getUserAnalytics(_filters?: ResearchFilters): Promise<UserAnalytics> {
      const { data: users } = await client.from('users').select('id, role, created_at');
      const { data: sessions } = await client.from('sessions').select('id, user_id, created_at');

      const userList = users ?? [];
      const sessionList = sessions ?? [];

      const guestUsers = userList.filter(u => u.role === 'guest').length;
      const registeredUsers = userList.filter(u => u.role !== 'guest').length;
      const conversions = userList.filter(u => u.role === 'user' || u.role === 'researcher' || u.role === 'admin').length;

      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const dailyActiveUsers = new Set(
        sessionList.filter(s => s.created_at >= dayAgo).map(s => s.user_id)
      ).size;
      const weeklyActiveUsers = new Set(
        sessionList.filter(s => s.created_at >= weekAgo).map(s => s.user_id)
      ).size;
      const monthlyActiveUsers = new Set(
        sessionList.filter(s => s.created_at >= monthAgo).map(s => s.user_id)
      ).size;

      const sessionsPerUser = userList.length > 0 ? sessionList.length / userList.length : 0;

      const userActiveDays = new Map<string, Set<string>>();
      for (const s of sessionList) {
        if (!s.user_id || !s.created_at) continue;
        const uid = s.user_id as string;
        const day = (s.created_at as string).slice(0, 10);
        if (!userActiveDays.has(uid)) userActiveDays.set(uid, new Set());
        userActiveDays.get(uid)!.add(day);
      }
      const returningUsers = [...userActiveDays.values()].filter(days => days.size >= 2).length;

      return {
        guestUsers,
        registeredUsers,
        conversions,
        newUsers: userList.length,
        returningUsers,
        dailyActiveUsers,
        weeklyActiveUsers,
        monthlyActiveUsers,
        avgSessionsPerUser: Math.round(sessionsPerUser * 10) / 10,
        avgGamesPerUser: sessionsPerUser,
      };
    },

    async getSessionAnalytics(filters?: ResearchFilters): Promise<SessionAnalytics> {
      let query = client.from('sessions').select('id, status, created_at, updated_at, finished_at');
      
      if (filters?.dateFrom) query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
      if (filters?.dateTo) query = query.lte('created_at', new Date(filters.dateTo).toISOString());

      const { data } = await query;
      const sessions = data ?? [];

      const completed = sessions.filter(s => s.status === 'completed').length;
      const failed = sessions.filter(s => s.status === 'failed').length;

      const timelineMap = new Map<string, { count: number; completed: number }>();
      sessions.forEach(s => {
        const date = s.created_at.split('T')[0];
        const existing = timelineMap.get(date) ?? { count: 0, completed: 0 };
        existing.count++;
        if (s.status === 'completed') existing.completed++;
        timelineMap.set(date, existing);
      });

      const sessionsTimeline = Array.from(timelineMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...data }));

      const durations = sessions
        .filter(s => s.finished_at && s.created_at)
        .map(s => new Date(s.finished_at!).getTime() - new Date(s.created_at).getTime());
      const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length / 1000 : 0;

      const stateDistribution = [
        { state: 'completed', count: completed },
        { state: 'failed', count: failed },
        { state: 'draft', count: sessions.filter(s => s.status === 'draft').length },
      ];

      return {
        sessionsTimeline,
        completionRate: sessions.length > 0 ? Math.round((completed / sessions.length) * 100 * 10) / 10 : 0,
        abortRate: sessions.length > 0 ? Math.round((failed / sessions.length) * 100 * 10) / 10 : 0,
        calibrationFailures: sessions.filter(s => s.status === 'failed').length,
        avgSessionDuration: Math.round(avgDuration),
        avgGameDuration: Math.round(avgDuration),
        avgCountdownTime: 0,
        stateDistribution,
        syncSuccessRate: 100,
        offlineSessions: 0,
        pendingSync: 0,
        failedSync: 0,
      };
    },

    async getSessionList(filters?: ResearchFilters): Promise<readonly SessionRow[]> {
      let query = client.from('sessions')
        .select('id, user_id, device_id, plugin_id, status, updated_at, measurements, scientific_results, metadata, created_at');

      if (filters?.dateFrom) query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
      if (filters?.dateTo) query = query.lte('created_at', new Date(filters.dateTo).toISOString());
      if (filters?.game) query = query.eq('plugin_id', filters.game);

      query = query.order('created_at', { ascending: false }).limit(200);

      const { data: sessions } = await query;
      const sessionList = sessions ?? [];

      const userIds = [...new Set(sessionList.map(s => s.user_id).filter(Boolean))];
      const deviceIds = [...new Set(sessionList.map(s => s.device_id).filter(Boolean))];

      const [usersResult, devicesResult] = await Promise.all([
        userIds.length > 0
          ? client.from('users').select('id, role').in('id', userIds)
          : Promise.resolve({ data: [] }),
        deviceIds.length > 0
          ? client.from('devices').select('id, os, os_version, browser, browser_version, platform, language, user_agent').in('id', deviceIds)
          : Promise.resolve({ data: [] }),
      ]);

      const usersMap = new Map((usersResult.data ?? []).map(u => [u.id, u]));
      const devicesMap = new Map((devicesResult.data ?? []).map(d => [d.id, d]));

      const { parseDeviceBrandModel } = await import('../device/parser');

      return sessionList.map(s => {
        const measurements = s.measurements as Record<string, unknown> | null;
        const results = s.scientific_results as Record<string, unknown> | null;
        const correctedRts = (measurements?.corrected_rts as number[]) ?? [];
        const avg = correctedRts.length > 0
          ? correctedRts.reduce((a, b) => a + b, 0) / correctedRts.length
          : 0;
        const best = correctedRts.length > 0 ? Math.min(...correctedRts) : 0;
        const user = usersMap.get(s.user_id);
        const device = devicesMap.get(s.device_id);
        const ua = device?.user_agent ?? '';
        const parsed = ua ? parseDeviceBrandModel(ua) : { brand: 'Unknown', model: 'Unknown', marketingName: 'Unknown' };

        return {
          id: s.id,
          createdAt: s.created_at,
          status: s.status ?? 'unknown',
          endedReason: null,
          lastActivityAt: s.updated_at ?? null,
          userName: user?.role === 'guest' ? 'Guest' : 'User',
          userType: user?.role === 'guest' ? 'Guest' as const : 'Registered' as const,
          pluginId: s.plugin_id ?? 'unknown',
          correctedRts,
          avgRt: Math.round(avg),
          bestRt: Math.round(best),
          grade: (results?.grade as string) ?? '-',
          focusScore: (results?.focus_score as number) ?? 0,
          consistencyRating: (results?.consistency_rating as string) ?? '-',
          deviceInfo: device ? `${device.browser} / ${device.os}` : '-',
          deviceOs: device ? `${device.os} ${device.os_version ?? ''}`.trim() : '-',
          deviceBrowser: device ? `${device.browser} ${device.browser_version ?? ''}`.trim() : '-',
          brand: parsed.brand,
          model: parsed.model,
          marketingName: parsed.marketingName,
          language: device?.language ?? null,
          userAgent: ua || null,
          fatigueScore: (results?.fatigue_score as number) ?? null,
          calibrationConfidence: (results?.calibration_confidence as number) ?? null,
        };
      });
    },

    async getDeviceAnalytics(_filters?: ResearchFilters): Promise<DeviceAnalytics> {
      const { data: devices } = await client.from('devices').select('id, os, browser');
      const deviceList = devices ?? [];

      const osCounts = new Map<string, number>();
      const browserCounts = new Map<string, number>();

      deviceList.forEach(d => {
        osCounts.set(d.os, (osCounts.get(d.os) ?? 0) + 1);
        browserCounts.set(d.browser, (browserCounts.get(d.browser) ?? 0) + 1);
      });

      const total = deviceList.length || 1;

      return {
        osDistribution: Array.from(osCounts.entries()).map(([os, count]) => ({ os, count, percentage: (count / total) * 100 })),
        browserDistribution: Array.from(browserCounts.entries()).map(([browser, count]) => ({ browser, count, percentage: (count / total) * 100 })),
        refreshRateDistribution: [],
        cpuCoresDistribution: [],
        ramDistribution: [],
        inputTypeDistribution: [],
        resolutionDistribution: [],
        calibrationByDevice: [],
        inputLagDistribution: [],
      };
    },

    async getDeviceIntelligence(_filters?: ResearchFilters): Promise<readonly DeviceHierarchyGroup[]> {
      const { data: deviceRows } = await client.from('devices').select('id, os, os_version, browser, browser_version, platform, language, user_agent, collected_at');
      const deviceList = deviceRows ?? [];
      if (deviceList.length === 0) return [];

      const deviceIds = deviceList.map(d => d.id);
      const { data: sessionsData } = await client
        .from('sessions')
        .select('id, device_id, status, created_at, finished_at, measurements, scientific_results')
        .in('device_id', deviceIds);
      if (!sessionsData) return [];

      interface SessionData { id?: string; device_id: string; status: string; created_at: string | null; finished_at: string | null; measurements: Record<string, unknown> | null; scientific_results: Record<string, unknown> | null }

      const sessionsByDevice = new Map<string, SessionData[]>();
      for (const s of sessionsData as SessionData[]) {
        const list = sessionsByDevice.get(s.device_id) ?? [];
        list.push(s);
        sessionsByDevice.set(s.device_id, list);
      }

      // Fetch calibration data for health metrics
      const sessionIds = (sessionsData ?? []).filter(s => s.id).map(s => s.id!);
      let calibrationData: Map<string, { confidence: number }[]> = new Map();
      if (sessionIds.length > 0) {
        const { data: calSessions } = await client
          .from('sessions')
          .select('id, calibration_id')
          .in('id', sessionIds.slice(0, 100))
          .not('calibration_id', 'is', null);
        const calIds = [...new Set((calSessions ?? []).map(s => s.calibration_id).filter(Boolean))];
        if (calIds.length > 0) {
          const { data: cals } = await client
            .from('calibrations')
            .select('id, confidence')
            .in('id', calIds);
          const calMap = new Map((cals ?? []).map(c => [c.id, c.confidence]));
          calibrationData = new Map();
          for (const s of calSessions ?? []) {
            const list = calibrationData.get(s.id) ?? [];
            const conf = calMap.get(s.calibration_id);
            if (conf != null) list.push({ confidence: conf });
            calibrationData.set(s.id, list);
          }
        }
      }

      const deviceIntelligenceList: DeviceIntelligence[] = deviceList.map(d => {
        const ua = d.user_agent ?? '';
        const { brand, model, marketingName } = parseDeviceBrandModel(ua);
        const devSessions = sessionsByDevice.get(d.id) ?? [];
        const completed = devSessions.filter(s => s.status === 'completed');
        const abandoned = devSessions.filter(s => s.status === 'abandoned');
        const failed = devSessions.filter(s => s.status === 'failed');
        const durations = devSessions.filter(s => s.finished_at && s.created_at).map(s => (new Date(s.finished_at!).getTime() - new Date(s.created_at!).getTime()) / 1000);
        const avgRts = devSessions.map(s => {
          const m = s.measurements?.corrected_rts as number[] | undefined;
          if (!m || m.length === 0) return null;
          return m.reduce((a, b) => a + b, 0) / m.length;
        }).filter((v): v is number => v !== null);
        const focusScores = devSessions.map(s => s.scientific_results?.focus_score as number | undefined).filter((v): v is number => v != null);
        const timestamps = devSessions.flatMap(s => [s.created_at ? new Date(s.created_at).getTime() : null, s.finished_at ? new Date(s.finished_at).getTime() : null]).filter((t): t is number => t !== null);

        const total = devSessions.length || 1;
        const calibrations = calibrationData.get(d.id) ?? [];
        const avgCalConf = calibrations.length > 0 ? calibrations.reduce((s, c) => s + c.confidence, 0) / calibrations.length : 0;
        const rtStdDev = avgRts.length > 1 ? Math.sqrt(avgRts.reduce((s, v) => s + (v - (avgRts.reduce((a, b) => a + b, 0) / avgRts.length)) ** 2, 0) / avgRts.length) : 0;
        const meanRt = avgRts.length > 0 ? avgRts.reduce((a, b) => a + b, 0) / avgRts.length : 1;
        const cv = meanRt > 0 ? rtStdDev / meanRt : 1;
        const consistency = Math.max(0, Math.min(100, (1 - cv) * 100));

        const completionRate = completed.length / total;
        const failureRate = failed.length / total;
        const abandonRate = abandoned.length / total;

        let ranking: DeviceHealthMetrics['ranking'] = 'average';
        const healthScore = (completionRate * 40) + ((1 - abandonRate) * 20) + (consistency / 100 * 20) + (avgCalConf * 20);
        if (healthScore >= 85) ranking = 'excellent';
        else if (healthScore >= 70) ranking = 'good';
        else if (healthScore >= 50) ranking = 'average';
        else if (healthScore >= 30) ranking = 'poor';
        else ranking = 'bad';

        return {
          id: d.id,
          browser: d.browser ?? '',
          browserVersion: d.browser_version ?? '',
          os: d.os ?? '',
          osVersion: d.os_version ?? '',
          platform: d.platform ?? '',
          brand,
          model,
          marketingName,
          language: d.language ?? null,
          userAgent: ua || null,
          collectedAt: d.collected_at ?? null,
          sessionsCount: devSessions.length,
          completedSessions: completed.length,
          abandonedSessions: abandoned.length,
          avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
          avgRt: avgRts.length > 0 ? avgRts.reduce((a, b) => a + b, 0) / avgRts.length : 0,
          avgFocusScore: focusScores.length > 0 ? focusScores.reduce((a, b) => a + b, 0) / focusScores.length : 0,
          firstSeen: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : '',
          lastSeen: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : '',
          health: {
            avgCalibrationConfidence: avgCalConf,
            reactionConsistency: consistency,
            completionRate,
            failureRate,
            abandonRate,
            ranking,
            avgFocusScore: focusScores.length > 0 ? focusScores.reduce((a, b) => a + b, 0) / focusScores.length : 0,
          },
        };
      });

      const osGroups = new Map<string, DeviceIntelligence[]>();
      for (const device of deviceIntelligenceList) {
        const os = device.os || 'Unknown';
        const list = osGroups.get(os) ?? [];
        list.push(device);
        osGroups.set(os, list);
      }

      return Array.from(osGroups.entries())
        .map(([os, devices]) => {
          const brandGroups = new Map<string, DeviceIntelligence[]>();
          for (const d of devices) {
            const brand = d.brand || 'Unknown';
            const list = brandGroups.get(brand) ?? [];
            list.push(d);
            brandGroups.set(brand, list);
          }
          return {
            os,
            count: devices.length,
            brands: Array.from(brandGroups.entries())
              .map(([brand, brandDevices]) => {
                const modelGroups = new Map<string, DeviceIntelligence[]>();
                for (const d of brandDevices) {
                  const model = d.model || 'Unknown';
                  const list = modelGroups.get(model) ?? [];
                  list.push(d);
                  modelGroups.set(model, list);
                }
                return {
                  brand,
                  count: brandDevices.length,
                  models: Array.from(modelGroups.entries())
                    .map(([model, modelDevices]) => ({
                      model,
                      count: modelDevices.length,
                      marketingName: modelDevices[0]?.marketingName ?? model,
                      devices: modelDevices,
                    }))
                    .sort((a, b) => b.count - a.count),
                };
              })
              .sort((a, b) => b.count - a.count),
          };
        })
        .sort((a, b) => b.count - a.count);
    },

    getLiveEvents(): readonly LiveEvent[] {
      return [...liveEvents];
    },

    addLiveEvent(event: LiveEvent): void {
      liveEvents.push(event);
      if (liveEvents.length > 1000) liveEvents.splice(0, liveEvents.length - 1000);
    },

    async getSystemHealth(): Promise<SystemHealth> {
      const startTime = Date.now();
      const { error } = await client.from('users').select('id', { count: 'exact', head: true });
      const dbLatency = Date.now() - startTime;

      return {
        supabaseStatus: error ? 'down' : 'healthy',
        realtimeStatus: 'connected',
        offlineQueueLength: 0,
        syncQueueLength: 0,
        dbLatencyMs: dbLatency,
        apiResponseTimeMs: dbLatency,
        errors24h: 0,
        warnings24h: 0,
        telemetryHealth: 'healthy',
        storageUsedMb: 0,
        buildVersion: '2.0.0',
        gitTag: 'v2.0-phase11',
      };
    },
  };
}

function computePercentiles(values: readonly number[]): { p50: number; p75: number; p90: number; p95: number; p99: number } {
  if (values.length === 0) return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p = (n: number): number => sorted[Math.max(0, Math.ceil(sorted.length * n / 100) - 1)] ?? 0;
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

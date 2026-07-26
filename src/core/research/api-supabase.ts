import type { ResearchFilters } from './filters';
import { getSupabaseClient } from '../supabase/client';
import { getDataService } from '../supabase/data-service';

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
  readonly campaigns: number;
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
  readonly registrationFunnel: { readonly stage: string; readonly count: number; readonly rate: number }[];
  readonly acquisitionSources: { readonly source: string; readonly count: number; readonly conversionRate: number }[];
  readonly referralSuccess: { readonly code: string; readonly scans: number; readonly conversions: number; readonly rate: number }[];
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

export interface CampaignAnalytics {
  readonly campaigns: { readonly id: string; readonly name: string; readonly is_active: boolean; readonly created_at: string }[];
  readonly referralPerformance: { readonly code: string; readonly scans: number; readonly conversions: number; readonly rate: number }[];
  readonly landingConversion: number;
  readonly registrationConversion: number;
  readonly sessionCompletionByCampaign: { readonly campaign: string; readonly rate: number }[];
  readonly avgRtByCampaign: { readonly campaign: string; readonly avgRt: number }[];
  readonly avgFocusByCampaign: { readonly campaign: string; readonly avgFocus: number }[];
  readonly campaignRanking: { readonly campaign: string; readonly score: number }[];
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
  readonly campaignSource: string | null;
}

export interface ResearchAPI {
  getOverview(filters?: ResearchFilters): Promise<OverviewStats>;
  getScientific(filters?: ResearchFilters): Promise<ScientificMetrics>;
  getUserAnalytics(filters?: ResearchFilters): Promise<UserAnalytics>;
  getSessionAnalytics(filters?: ResearchFilters): Promise<SessionAnalytics>;
  getSessionList(filters?: ResearchFilters): Promise<readonly SessionRow[]>;
  getDeviceAnalytics(filters?: ResearchFilters): Promise<DeviceAnalytics>;
  getSurveyAnalytics(filters?: ResearchFilters): Promise<SurveyAnalytics>;
  getCampaignAnalytics(filters?: ResearchFilters): Promise<CampaignAnalytics>;
  getLiveEvents(): readonly LiveEvent[];
  addLiveEvent(event: LiveEvent): void;
  getSystemHealth(): Promise<SystemHealth>;
}

export function createResearchAPI(): ResearchAPI {
  const liveEvents: LiveEvent[] = [];
  const client = getSupabaseClient();
  const dataService = getDataService(client);

  return {
    async getOverview(filters?: ResearchFilters): Promise<OverviewStats> {
      void filters;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [usersResult, sessionsResult, todayResult, weekResult, monthResult, qrStats] = await Promise.all([
        client.from('users').select('id, role', { count: 'exact' }),
        client.from('sessions').select('id, status, measurements, scientific_results, created_at, device_id', { count: 'exact' }),
        client.from('sessions').select('id', { count: 'exact' }).gte('created_at', todayStart),
        client.from('sessions').select('id', { count: 'exact' }).gte('created_at', weekStart),
        client.from('sessions').select('id', { count: 'exact' }).gte('created_at', monthStart),
        dataService.getQRStats(),
      ]);

      const users = usersResult.data ?? [];
      const sessions = sessionsResult.data ?? [];
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
        avgConsistency: focusScores.length > 0 ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length * 10) / 10 : 0,
        avgFatigue: (() => {
          const fatigueScores = completedSessions
            .map(s => (s.scientific_results as Record<string, unknown>)?.fatigue_score as number)
            .filter(score => typeof score === 'number' && !isNaN(score));
          return fatigueScores.length > 0 ? Math.round(fatigueScores.reduce((a, b) => a + b, 0) / fatigueScores.length * 10) / 10 : 0;
        })(),
        avgCalibrationConfidence: 0,
        countries: 0,
        cities: 0,
        campaigns: qrStats.totalCampaigns,
        devices: uniqueDevices,
        currentOnline: 0,
        peakToday: 0,
        retentionD1: 0,
        retentionD7: 0,
        retentionD30: 0,
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
      const { data: sessions } = await client.from('sessions').select('user_id, created_at');
      const { data: events } = await client.from('analytics_events').select('event_type, user_id, event_data, created_at');

      const userList = users ?? [];
      const sessionList = sessions ?? [];
      const eventList = events ?? [];

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

      const registrationEvents = eventList.filter(e => e.event_type === 'registration_completed');
      const registrationFunnel = [
        { stage: 'Visitors', count: userList.length, rate: 100 },
        { stage: 'Guest Users', count: guestUsers, rate: userList.length > 0 ? (guestUsers / userList.length) * 100 : 0 },
        { stage: 'Registrations', count: registrationEvents.length, rate: userList.length > 0 ? (registrationEvents.length / userList.length) * 100 : 0 },
        { stage: 'Active Users', count: registeredUsers, rate: userList.length > 0 ? (registeredUsers / userList.length) * 100 : 0 },
      ];

      const scanEvents = eventList.filter(e => e.event_type === 'qr_scanned');
      const campaignCounts = new Map<string, number>();
      scanEvents.forEach(e => {
        const campaign = (e.event_data as Record<string, unknown>)?.campaign as string ?? 'direct';
        campaignCounts.set(campaign, (campaignCounts.get(campaign) ?? 0) + 1);
      });

      const acquisitionSources = Array.from(campaignCounts.entries()).map(([source, count]) => ({
        source,
        count,
        conversionRate: count > 0 ? (registrationEvents.length / count) * 100 : 0,
      }));

      return {
        guestUsers,
        registeredUsers,
        conversions,
        newUsers: userList.length,
        returningUsers: 0,
        dailyActiveUsers,
        weeklyActiveUsers,
        monthlyActiveUsers,
        avgSessionsPerUser: Math.round(sessionsPerUser * 10) / 10,
        avgGamesPerUser: sessionsPerUser,
        registrationFunnel,
        acquisitionSources,
        referralSuccess: [],
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
        .select('id, user_id, device_id, plugin_id, status, measurements, scientific_results, metadata, campaign_id, created_at');

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
          ? client.from('users').select('id, display_name, role').in('id', userIds)
          : Promise.resolve({ data: [] }),
        deviceIds.length > 0
          ? client.from('devices').select('id, browser, os').in('id', deviceIds)
          : Promise.resolve({ data: [] }),
      ]);

      const usersMap = new Map((usersResult.data ?? []).map(u => [u.id, u]));
      const devicesMap = new Map((devicesResult.data ?? []).map(d => [d.id, d]));

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
        const meta = s.metadata as Record<string, unknown> | null;

        return {
          id: s.id,
          createdAt: s.created_at,
          userName: user?.display_name ?? (user?.role === 'guest' ? 'Guest' : 'User'),
          userType: user?.role === 'guest' ? 'Guest' as const : 'Registered' as const,
          pluginId: s.plugin_id ?? 'unknown',
          correctedRts,
          avgRt: Math.round(avg),
          bestRt: Math.round(best),
          grade: (results?.grade as string) ?? '-',
          focusScore: (results?.focus_score as number) ?? 0,
          consistencyRating: (results?.consistency_rating as string) ?? '-',
          deviceInfo: device ? `${device.browser} / ${device.os}` : '-',
        campaignSource: (s.campaign_id as string) ?? (meta?.campaign_source as string) ?? null,
        };
      });
    },

    async getDeviceAnalytics(_filters?: ResearchFilters): Promise<DeviceAnalytics> {
      const { data: devices } = await client.from('devices').select('*');
      const deviceList = devices ?? [];

      const osCounts = new Map<string, number>();
      const browserCounts = new Map<string, number>();
      const refreshRates = new Map<number, number>();
      const resolutions = new Map<string, number>();

      deviceList.forEach(d => {
        osCounts.set(d.os, (osCounts.get(d.os) ?? 0) + 1);
        browserCounts.set(d.browser, (browserCounts.get(d.browser) ?? 0) + 1);
        refreshRates.set(d.refresh_rate, (refreshRates.get(d.refresh_rate) ?? 0) + 1);
        const res = `${d.screen_width}x${d.screen_height}`;
        resolutions.set(res, (resolutions.get(res) ?? 0) + 1);
      });

      const total = deviceList.length || 1;

      return {
        osDistribution: Array.from(osCounts.entries()).map(([os, count]) => ({ os, count, percentage: (count / total) * 100 })),
        browserDistribution: Array.from(browserCounts.entries()).map(([browser, count]) => ({ browser, count, percentage: (count / total) * 100 })),
        refreshRateDistribution: Array.from(refreshRates.entries()).map(([rate, count]) => ({ rate, count })),
        cpuCoresDistribution: [],
        ramDistribution: [],
        inputTypeDistribution: [],
        resolutionDistribution: Array.from(resolutions.entries()).map(([resolution, count]) => ({ resolution, count })),
        calibrationByDevice: [],
        inputLagDistribution: [],
      };
    },

    async getSurveyAnalytics(_filters?: ResearchFilters): Promise<SurveyAnalytics> {
      const { data: surveys } = await client.from('surveys').select('*');
      const surveyList = surveys ?? [];

      const ageCounts = new Map<string, number>();
      const genderCounts = new Map<string, number>();
      const educationCounts = new Map<string, number>();

      surveyList.forEach(s => {
        if (s.age_range) ageCounts.set(s.age_range, (ageCounts.get(s.age_range) ?? 0) + 1);
        if (s.gender) genderCounts.set(s.gender, (genderCounts.get(s.gender) ?? 0) + 1);
        if (s.education) educationCounts.set(s.education, (educationCounts.get(s.education) ?? 0) + 1);
      });

      return {
        ageDistribution: Array.from(ageCounts.entries()).map(([range, count]) => ({ range, count })),
        genderDistribution: Array.from(genderCounts.entries()).map(([gender, count]) => ({ gender, count })),
        educationDistribution: Array.from(educationCounts.entries()).map(([level, count]) => ({ level, count })),
        countryDistribution: [],
        sleepDistribution: [],
        coffeeDistribution: [],
        exerciseDistribution: [],
        completionRate: surveyList.length > 0 ? 100 : 0,
        correlationMatrix: [],
      };
    },

    async getCampaignAnalytics(_filters?: ResearchFilters): Promise<CampaignAnalytics> {
      const dataServiceLocal = getDataService(client);
      const [campaignsResult, qrResult, sessionsResult] = await Promise.all([
        dataServiceLocal.getCampaigns({ limit: 100 }),
        dataServiceLocal.getQRCodes({ limit: 100 }),
        client.from('sessions').select('campaign_id, status').not('campaign_id', 'is', null),
      ]);

      const sessionList = sessionsResult.data ?? [];

      const campaigns = campaignsResult.data.map(c => {
        const cSessions = sessionList.filter(s => s.campaign_id === c.id);
        const cQrs = qrResult.data.filter(qr => qr.campaign_id === c.id);
        const totalScans = cQrs.reduce((sum, qr) => sum + qr.scan_count, 0);
        const totalRegs = cSessions.filter(s => s.status === 'completed').length;
        return {
          id: c.id ?? '',
          name: c.name,
          is_active: c.is_active,
          created_at: c.created_at ?? new Date().toISOString(),
          scans: totalScans,
          registrations: totalRegs,
        };
      });

      const referralPerformance = qrResult.data.map(qr => ({
        code: qr.code,
        scans: qr.scan_count,
        conversions: qr.registration_count,
        rate: qr.scan_count > 0 ? (qr.registration_count / qr.scan_count) * 100 : 0,
      }));

      const totalScans = campaigns.reduce((sum, c) => sum + c.scans, 0);
      const totalRegs = campaigns.reduce((sum, c) => sum + c.registrations, 0);

      return {
        campaigns: campaigns.map(c => ({ id: c.id, name: c.name, is_active: c.is_active, created_at: c.created_at })),
        referralPerformance,
        landingConversion: campaigns.length > 0 ? Math.round((qrResult.data.length / Math.max(campaigns.length, 1)) * 100) / 100 : 0,
        registrationConversion: totalScans > 0 ? Math.round((totalRegs / totalScans) * 100) / 100 : 0,
        sessionCompletionByCampaign: campaigns.map(c => ({
          campaign: c.name,
          rate: c.scans > 0 ? Math.round((c.registrations / c.scans) * 100) : 0,
        })),
        avgRtByCampaign: [],
        avgFocusByCampaign: [],
        campaignRanking: campaigns.map(c => ({
          campaign: c.name,
          score: c.scans + c.registrations * 10,
        })).sort((a, b) => b.score - a.score),
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

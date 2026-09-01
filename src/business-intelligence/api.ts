import { createResearchAPI } from '../core/research/api-supabase';
import { getSupabaseClient } from '../core/supabase/client';
import { parseDeviceBrandModel } from '../core/device/parser';
import { getCampaignQrMetricsResult } from '../research-console/pages/campaigns/campaign-service';
import type {
  CommandCenterData, TodaySummary, Opportunity, CustomerProfile,
  TimelineEntry, CustomerSession, DeviceInsight,
  DeviceModelInsight, CommerceFunnel, FunnelStage,
  AIInsight, Prediction, HotDevice, TreasureModeData, QrScanCount,
} from './types';
import type { BranchData } from './actions/types';
import { devError } from '../core/logging';
import { getRuntimeSetting, loadRuntimeSettings } from '../core/config/runtime-settings';

export interface BusinessAPI {
  getCommandCenter(): Promise<CommandCenterData>;
  getCustomerProfile(userId: string): Promise<CustomerProfile | null>;
  getCustomerList(): Promise<Opportunity[]>;
  getDeviceInsights(): Promise<DeviceInsight[]>;
  getCommerceFunnel(): Promise<CommerceFunnel>;
  getQrScanCount(): Promise<QrScanCount>;
  getTreasureMode(): Promise<TreasureModeData>;
  getAIInsights(): Promise<AIInsight[]>;
  getHotDevices(): Promise<HotDevice[]>;
  getPredictions(): Promise<Prediction[]>;
  getBranchData(): Promise<BranchData[]>;
}

export function createBusinessAPI(): BusinessAPI {
  const researchAPI = createResearchAPI();
  const client = getSupabaseClient();

  return {
    async getCommandCenter(): Promise<CommandCenterData> {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const [sessionsResult, usersResult] = await Promise.all([
        client.from('sessions').select('id, user_id, device_id, status, created_at, scientific_results').gte('created_at', todayStart),
        client.from('users').select('id, role, created_at'),
      ]);
      if (sessionsResult.error) devError({ code: sessionsResult.error.code, message: sessionsResult.error.message, details: sessionsResult.error.details, hint: sessionsResult.error.hint });
      if (usersResult.error) devError({ code: usersResult.error.code, message: usersResult.error.message, details: usersResult.error.details, hint: usersResult.error.hint });

      const sessions = sessionsResult.data ?? [];
      const trades: Array<{ id: string; user_id: string; device_id: string; created_at: string }> = [];
      const users = usersResult.data ?? [];

      const uniqueVisitors = new Set(sessions.map(s => s.user_id).filter(Boolean)).size;
      const uniquePlayers = new Set(sessions.map(s => s.user_id).filter(Boolean)).size;
      const tradeCount = trades.length;
      const whatsappCount = 0;
      const customers = users.filter(u => u.role !== 'guest').length - users.filter(u => u.role === 'guest').length + trades.length;

      const today: TodaySummary = {
        visitors: uniqueVisitors,
        players: uniquePlayers,
        tradeRequests: tradeCount,
        whatsappClicks: whatsappCount,
        customers: Math.max(0, customers),
        conversionRate: uniqueVisitors > 0 ? Math.round((tradeCount / uniqueVisitors) * 10000) / 100 : 0,
      };

      const deviceCounts = new Map<string, { brand: string; model: string; count: number }>();
      for (const t of trades) {
        if (t.device_id) {
          const { data: deviceRows } = await client.from('devices').select('user_agent').eq('id', t.device_id).limit(1);
          if (deviceRows && deviceRows.length > 0) {
            const ua = deviceRows[0]!.user_agent ?? '';
            const { brand, model } = parseDeviceBrandModel(ua);
            const key = `${brand}|${model}`;
            const existing = deviceCounts.get(key) ?? { brand, model, count: 0 };
            existing.count++;
            deviceCounts.set(key, existing);
          }
        }
      }
      const sortedDevices = Array.from(deviceCounts.values()).sort((a, b) => b.count - a.count);
      const topTradeInDevice = sortedDevices.length > 0 ? sortedDevices[0]! : null;

      const visitCounts = new Map<string, number>();
      for (const s of sessions) {
        if (s.user_id) {
          visitCounts.set(s.user_id, (visitCounts.get(s.user_id) ?? 0) + 1);
        }
      }

      const opportunities: Opportunity[] = [];
      const processed = new Set<string>();
      for (const [uid, count] of visitCounts) {
        if (count >= 2 && !processed.has(uid)) {
          processed.add(uid);
          const userSessions = sessions.filter(s => s.user_id === uid);
          const userTrades = trades.filter(t => t.user_id === uid);
          const userObj = users.find(u => u.id === uid);

          const bestScore = userSessions.length > 0
            ? Math.max(...userSessions.map(s => (s.scientific_results?.focus_score as number) ?? 0))
            : 0;

          const lastSession = userSessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          let deviceInfo = '';
          if (lastSession?.device_id) {
            const { data: dRows } = await client.from('devices').select('user_agent').eq('id', lastSession.device_id).limit(1);
            if (dRows && dRows.length > 0) {
              const { brand, model } = parseDeviceBrandModel(dRows[0]!.user_agent ?? '');
              deviceInfo = `${brand} ${model}`;
            }
          }

          opportunities.push({
            userId: uid,
            displayName: userObj?.role === 'guest' ? 'Guest' : 'Customer',
            visitCount: count,
            gameCount: userSessions.length,
            lastVisit: lastSession?.created_at ?? '',
            deviceInfo,
            tradeRequested: userTrades.length > 0,
            whatsappClicked: false,
            bestFocusScore: bestScore,
            campaignSource: null,
          });
        }
      }

      const hourlyData: { hour: number; visitors: number; players: number; trades: number }[] = [];
      for (let h = 0; h < 24; h++) {
        const hourSessions = sessions.filter(s => new Date(s.created_at).getHours() === h);
        const hourTrades = trades.filter(t => new Date(t.created_at).getHours() === h);
        hourlyData.push({
          hour: h,
          visitors: new Set(hourSessions.map(s => s.user_id).filter(Boolean)).size,
          players: hourSessions.length,
          trades: hourTrades.length,
        });
      }

      return {
        today,
        topTradeInDevice,
        bestCampaign: null,
        worstCampaign: null,
        opportunities: opportunities.sort((a, b) => b.visitCount - a.visitCount).slice(0, 50),
        hourlyDistribution: hourlyData,
      };
    },

    async getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
      const [userResult, sessionsResult] = await Promise.all([
        client.from('users').select('id, display_name, created_at, role').eq('id', userId).single(),
        client.from('sessions').select('id, user_id, device_id, status, created_at, focus_score, avg_rt, best_rt, grade, consistency_rating, campaign_id, metadata').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);

      if (!userResult.data) return null;

      const user = userResult.data;
      const sessions = sessionsResult.data ?? [];
      const trades: Array<{ id: string }> = [];

      const completedSessions = sessions.filter(s => s.status === 'completed');
      const focusScores = completedSessions.map(s => s.focus_score as number).filter(s => typeof s === 'number');
      const avgRts = completedSessions.map(s => s.avg_rt as number).filter(s => typeof s === 'number');

      const firstSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
      const lastSession = sessions.length > 0 ? sessions[0] : null;

      let deviceUa = '';
      if (lastSession?.device_id) {
        const { data: dRows } = await client.from('devices').select('user_agent, os, browser').eq('id', lastSession.device_id).limit(1);
        if (dRows && dRows.length > 0) {
          deviceUa = dRows[0]!.user_agent ?? '';
        }
      }
      const { brand, model } = parseDeviceBrandModel(deviceUa);

      const timeline: TimelineEntry[] = sessions.map(s => ({
        timestamp: s.created_at,
        eventType: 'session',
        description: s.status,
        metadata: s.metadata,
      }));

      const customerSessions: CustomerSession[] = sessions.map(s => ({
        id: s.id,
        createdAt: s.created_at,
        status: s.status ?? 'unknown',
        avgRt: Math.round(s.avg_rt ?? 0),
        bestRt: Math.round(s.best_rt ?? 0),
        focusScore: s.focus_score ?? 0,
        grade: s.grade ?? '-',
        consistencyRating: s.consistency_rating ?? '-',
        deviceInfo: '',
        campaignSource: s.campaign_id ?? null,
      }));

      const returnedAfterWeek = firstSession && lastSession
        ? (new Date(lastSession.created_at).getTime() - new Date(firstSession.created_at).getTime()) > 7 * 24 * 60 * 60 * 1000
        : false;

      return {
        userId: user.id,
        displayName: user.display_name ?? 'Visitor',
        role: user.role ?? 'guest',
        firstVisit: firstSession?.created_at ?? '',
        lastVisit: lastSession?.created_at ?? '',
        totalVisits: sessions.length,
        totalGames: completedSessions.length,
        bestFocusScore: focusScores.length > 0 ? Math.max(...focusScores) : 0,
        avgFocusScore: focusScores.length > 0 ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length * 10) / 10 : 0,
        worstFocusScore: focusScores.length > 0 ? Math.min(...focusScores) : 0,
        avgReactionTime: avgRts.length > 0 ? Math.round(avgRts.reduce((a, b) => a + b, 0) / avgRts.length) : 0,
        deviceInfo: deviceUa,
        deviceBrand: brand,
        deviceModel: model,
        os: deviceUa ? 'Detected' : '',
        browser: deviceUa ? 'Detected' : '',
        whatsappClickCount: 0,
        tradeOfferViewCount: 0,
        tradeRequested: trades.length > 0,
        returnedAfterWeek,
        lastCampaign: null,
        timeline,
        sessions: customerSessions,
      };
    },

    async getCustomerList(): Promise<Opportunity[]> {
      const cc = await this.getCommandCenter();
      return cc.opportunities;
    },

    async getDeviceInsights(): Promise<DeviceInsight[]> {
      const hierarchy = await researchAPI.getDeviceIntelligence();

      const tradeDeviceIds = new Set<string>();
      const whatsappUsers = new Set<string>();

      const insights: DeviceInsight[] = hierarchy.map(osGroup => ({
        os: osGroup.os,
        totalCount: osGroup.count,
        brands: osGroup.brands.map(brandGroup => ({
          brand: brandGroup.brand,
          count: brandGroup.count,
          models: brandGroup.models.map(modelGroup => {
            const modelDevices = modelGroup.devices;
            const modelTradeCount = modelDevices.filter(d => tradeDeviceIds.has(d.id)).length;
            const modelWhatsappCount = modelDevices.filter(d => whatsappUsers.has(d.id)).length;
            const focusScores = modelDevices.map(d => d.avgFocusScore).filter(s => s > 0);
            const rtValues = modelDevices.map(d => d.avgRt).filter(r => r > 0);
            const deviceCampaigns: string[] = [];
            const lastSeenDates = modelDevices.map(d => d.lastSeen).filter(Boolean);
            const lastSeen = lastSeenDates.sort().reverse()[0] ?? '';

            const insight: DeviceModelInsight = {
              model: modelGroup.model,
              marketingName: modelGroup.marketingName,
              count: modelGroup.count,
              specs: {
                ram: 'Unknown',
                cpuCores: null,
                refreshRate: null,
                resolution: 'Unknown',
                browser: modelDevices[0]?.browser ?? 'Unknown',
              },
              avgFocusScore: focusScores.length > 0
                ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length * 10) / 10
                : 0,
              avgReactionTime: rtValues.length > 0
                ? Math.round(rtValues.reduce((a, b) => a + b, 0) / rtValues.length)
                : 0,
              tradeRequests: modelTradeCount,
              whatsappClicks: modelWhatsappCount,
              campaigns: deviceCampaigns,
              lastSeen,
              weeklyTrend: [],
              tradeRate: modelGroup.count > 0 ? Math.round((modelTradeCount / modelGroup.count) * 100) : 0,
            };
            return insight;
          }),
        })),
      }));

      return insights;
    },

    async getCommerceFunnel(): Promise<CommerceFunnel> {
      const [usersResult, sessionsResult] = await Promise.all([
        client.from('users').select('id'),
        client.from('sessions').select('status'),
      ]);

      const userCount = usersResult.data?.length ?? 0;
      const sessionCount = sessionsResult.data?.length ?? 0;
      const completedSessionCount = (sessionsResult.data ?? []).filter(s => s.status === 'completed').length;
      const tradeCount = 0;

      const stages: FunnelStage[] = [
        { name: 'users', count: userCount },
        { name: 'sessions', count: sessionCount },
        { name: 'completed', count: completedSessionCount },
        { name: 'trades', count: tradeCount },
      ].map((stage, i, arr) => {
        const firstCount = arr[0]?.count ?? 0;
        const count = stage.count;
        const percentage = firstCount > 0 ? Math.round((count / firstCount) * 1000) / 10 : 0;
        const prevCount = i > 0 ? (arr[i - 1]?.count ?? count) : count;
        const dropFromPrevious = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
        return { name: stage.name, count, percentage, dropFromPrevious };
      });

      let criticalDropOff: { from: string; to: string; dropRate: number } | null = null;
      let maxDrop = 0;
      for (let i = 1; i < stages.length; i++) {
        const stage = stages[i];
        const prev = stages[i - 1];
        if (stage && prev && stage.dropFromPrevious > maxDrop) {
          maxDrop = stage.dropFromPrevious;
          criticalDropOff = {
            from: prev.name,
            to: stage.name,
            dropRate: stage.dropFromPrevious,
          };
        }
      }

      return {
        stages,
        totalDropOff: stages.length > 0 ? 100 - (stages[stages.length - 1]?.percentage ?? 0) : 0,
        criticalDropOff,
      };
    },

    async getQrScanCount(): Promise<QrScanCount> {
      const result = await getCampaignQrMetricsResult();
      if (!result.ok) return { available: false, scans: 0 };
      const scans = result.rows
        .filter((r) => r.event_type === 'scan')
        .reduce((sum, r) => sum + (typeof r.total === 'number' ? r.total : 0), 0);
      return { available: true, scans };
    },

    async getTreasureMode(): Promise<TreasureModeData> {
      const [cc, funnel, deviceInsights] = await Promise.all([
        this.getCommandCenter(),
        this.getCommerceFunnel(),
        this.getDeviceInsights(),
      ]);

      const problems: AIInsight[] = [];
      if (cc.today.conversionRate < 10) {
        problems.push({
          type: 'problem',
          title: 'Ù†Ø³Ø¨Ø© ØªØ­ÙˆÙŠÙ„ Ù…Ù†Ø®ÙØ¶Ø©',
          description: `Ø§Ù„ÙŠÙˆÙ… ÙÙ‚Ø· ${cc.today.conversionRate}% Ù…Ù† Ø§Ù„Ø²ÙˆØ§Ø± Ø·Ù„Ø¨ÙˆØ§ Ø§Ø³ØªØ¨Ø¯Ø§Ù„.`,
          severity: 'high',
          metric: cc.today.conversionRate,
          trend: 'down',
        });
      }

      const alerts: AIInsight[] = [];
      if (funnel.criticalDropOff && funnel.criticalDropOff.dropRate > 50) {
        alerts.push({
          type: 'alert',
          title: 'ØªØ³Ø±Ø¨ ÙƒØ¨ÙŠØ± ÙÙŠ Ø§Ù„Ù…Ø³Ø§Ø±',
          description: `${funnel.criticalDropOff.dropRate}% Ù…Ù† Ø§Ù„Ø²ÙˆØ§Ø± ÙŠØºØ§Ø¯Ø±ÙˆÙ† Ø¹Ù†Ø¯ ${funnel.criticalDropOff.to}.`,
          severity: 'high',
          metric: funnel.criticalDropOff.dropRate,
        });
      }

      const abandonedSessions = await client.from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if ((abandonedSessions.count ?? 0) > 3) {
        alerts.push({
          type: 'alert',
          title: 'Ø¬Ù„Ø³Ø§Øª Ù…ØªÙˆÙ‚ÙØ©',
          description: `ÙŠÙˆØ¬Ø¯ ${abandonedSessions.count} Ø¬Ù„Ø³Ø© ØªÙˆÙ‚ÙØª Ù‚Ø¨Ù„ Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ù„Ø¹Ø¨Ø© ÙÙŠ Ø¢Ø®Ø± 24 Ø³Ø§Ø¹Ø©.`,
          severity: 'medium',
          metric: abandonedSessions.count ?? undefined,
        });
      }

      const recommendations: AIInsight[] = cc.opportunities
        .filter(o => o.visitCount >= 3 && !o.tradeRequested)
        .slice(0, 5)
        .map(o => ({
          type: 'recommendation' as const,
          title: `Ø®ØµÙ… Ù…Ù‚ØªØ±Ø­ Ù„Ù€ ${o.displayName}`,
          description: `Ø²Ø§Ø± ${o.visitCount} Ù…Ø±Ø§Øª ÙˆÙ„Ù… ÙŠØ·Ù„Ø¨ Ø§Ø³ØªØ¨Ø¯Ø§Ù„. Ø§Ø¹Ø±Ø¶ Ø®ØµÙ… 5%.`,
          severity: 'medium' as const,
        }));

      if (cc.opportunities.filter(o => o.visitCount >= 3 && !o.tradeRequested).length > 5) {
        recommendations.push({
          type: 'recommendation',
          title: 'Ø­Ù…Ù„Ø© Ø¹ÙˆØ¯Ø© Ù„Ù„Ø²ÙˆØ§Ø±',
          description: `${cc.opportunities.filter(o => o.visitCount >= 3 && !o.tradeRequested).length} Ø²Ø§Ø¦Ø±Ù‹Ø§ Ø¹Ø§Ø¯ÙˆØ§ Ø£ÙƒØ«Ø± Ù…Ù† 3 Ù…Ø±Ø§Øª ÙˆÙ„Ù… ÙŠØ·Ù„Ø¨ÙˆØ§ Ø§Ø³ØªØ¨Ø¯Ø§Ù„.`,
          severity: 'high',
        });
      }

      const hotDevices: HotDevice[] = deviceInsights.flatMap(os =>
        os.brands.flatMap(b => b.models.map(m => ({
          brand: b.brand,
          model: m.model,
          count: m.count,
          trend: m.tradeRate > 30 ? 'up' as const : m.tradeRate > 10 ? 'stable' as const : 'down' as const,
          weeklyChange: m.tradeRate,
        })))
      ).sort((a, b) => b.count - a.count).slice(0, 10);

      return {
        opportunities: cc.opportunities,
        problems,
        alerts,
        recommendations,
        hotDevices,
        todaySummary: cc.today,
      };
    },

    async getAIInsights(): Promise<AIInsight[]> {
      const tm = await this.getTreasureMode();
      return [...tm.problems, ...tm.alerts, ...tm.recommendations];
    },

    async getHotDevices(): Promise<HotDevice[]> {
      const tm = await this.getTreasureMode();
      return tm.hotDevices;
    },

    async getPredictions(): Promise<Prediction[]> {
      loadRuntimeSettings(); // warm centralized settings cache (safe fallback otherwise)
      const cc = await this.getCommandCenter();
      return cc.opportunities.map(o => {
        const visitFactor = Math.min(o.visitCount / 10, 1);
        const gameFactor = Math.min(o.gameCount / 5, 1);
        const focusFactor = o.bestFocusScore > 70 ? 0.2 : 0.1;
        const whatsappFactor = o.whatsappClicked ? 0.3 : 0;
        const returnFactor = o.visitCount > 3 ? 1 - visitFactor : visitFactor;

        return {
          visitorId: o.userId,
          purchaseProbability: Math.round((visitFactor * 0.3 + gameFactor * 0.2 + focusFactor + whatsappFactor) * 100),
          whatsappProbability: Math.round((o.whatsappClicked ? 0.8 : visitFactor * 0.4) * 100),
          returnProbability: Math.round(returnFactor * 100),
          needsDiscount: o.visitCount >= getRuntimeSetting('rules.needs_discount_visit_count', 3) && !o.tradeRequested,
        };
      });
    },

    async getBranchData(): Promise<BranchData[]> {
      const branchKey = 'bi_branch_data';
      try {
        const stored = localStorage.getItem(branchKey);
        if (stored) return JSON.parse(stored) as BranchData[];
      } catch { /* Intentionally ignored. */ }
      return [];
    },
  };
}

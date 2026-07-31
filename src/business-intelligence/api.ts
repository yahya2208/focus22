import { createResearchAPI } from '../core/research/api-supabase';
import { getSupabaseClient } from '../core/supabase/client';
import { parseDeviceBrandModel } from '../core/device/parser';
import type {
  CommandCenterData, TodaySummary, Opportunity, CustomerProfile,
  TimelineEntry, CustomerSession, DeviceInsight,
  DeviceModelInsight, CampaignInsight, CommerceFunnel, FunnelStage,
  AIInsight, Prediction, HotDevice, TreasureModeData,
} from './types';
import type { BranchData } from './actions/types';

export interface BusinessAPI {
  getCommandCenter(): Promise<CommandCenterData>;
  getCustomerProfile(userId: string): Promise<CustomerProfile | null>;
  getCustomerList(): Promise<Opportunity[]>;
  getDeviceInsights(): Promise<DeviceInsight[]>;
  getCampaignInsights(): Promise<CampaignInsight[]>;
  getCommerceFunnel(): Promise<CommerceFunnel>;
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

      const [eventsResult, sessionsResult, tradeResult, whatsappResult, usersResult] = await Promise.all([
        client.from('analytics_events').select('event_type, user_id, event_data, created_at').gte('created_at', todayStart),
        client.from('sessions').select('id, user_id, device_id, status, campaign_id, created_at, measurements, scientific_results').gte('created_at', todayStart),
        client.from('trade_requests').select('id, user_id, device_id, created_at').gte('created_at', todayStart),
        client.from('analytics_events').select('user_id, created_at').eq('event_type', 'whatsapp_clicked').gte('created_at', todayStart),
        client.from('users').select('id, display_name, role, created_at'),
      ]);
      if (eventsResult.error) console.error({ code: eventsResult.error.code, message: eventsResult.error.message, details: eventsResult.error.details, hint: eventsResult.error.hint });
      if (sessionsResult.error) console.error({ code: sessionsResult.error.code, message: sessionsResult.error.message, details: sessionsResult.error.details, hint: sessionsResult.error.hint });
      if (tradeResult.error) console.error({ code: tradeResult.error.code, message: tradeResult.error.message, details: tradeResult.error.details, hint: tradeResult.error.hint });
      if (whatsappResult.error) console.error({ code: whatsappResult.error.code, message: whatsappResult.error.message, details: whatsappResult.error.details, hint: whatsappResult.error.hint });
      if (usersResult.error) console.error({ code: usersResult.error.code, message: usersResult.error.message, details: usersResult.error.details, hint: usersResult.error.hint });

      const events = eventsResult.data ?? [];
      const sessions = sessionsResult.data ?? [];
      const trades = tradeResult.data ?? [];
      const whatsappUsers = whatsappResult.data ?? [];
      const users = usersResult.data ?? [];

      const uniqueVisitors = new Set(events.map(e => e.user_id).filter(Boolean)).size;
      const uniquePlayers = new Set(sessions.map(s => s.user_id).filter(Boolean)).size;
      const tradeCount = trades.length;
      const whatsappCount = new Set(whatsappUsers.map(w => w.user_id).filter(Boolean)).size;
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

      const campaignScores = new Map<string, { name: string; score: number; scans: number; trades: number }>();
      for (const e of events) {
        if (e.event_type === 'qr_scanned') {
          const campaign = (e.event_data as Record<string, unknown>)?.campaign as string ?? (e.event_data as Record<string, unknown>)?.source as string ?? '';
          if (campaign) {
            const existing = campaignScores.get(campaign) ?? { name: campaign, score: 0, scans: 0, trades: 0 };
            existing.scans++;
            campaignScores.set(campaign, existing);
          }
        }
      }
      for (const t of trades) {
        const sessionMatch = sessions.find(s => s.user_id === t.user_id);
        if (sessionMatch?.campaign_id) {
          const existing = campaignScores.get(sessionMatch.campaign_id) ?? { name: sessionMatch.campaign_id, score: 0, scans: 0, trades: 0 };
          existing.trades++;
          campaignScores.set(sessionMatch.campaign_id, existing);
        }
      }
      for (const [_, c] of campaignScores) {
        c.score = c.scans + c.trades * 10;
      }
      const ranked = Array.from(campaignScores.values()).sort((a, b) => b.score - a.score);
      const bestCampaign = ranked.length > 0 ? { name: ranked[0]!.name, score: ranked[0]!.score } : null;
      const worstCampaign = ranked.length > 1 ? { name: ranked[ranked.length - 1]!.name, score: ranked[ranked.length - 1]!.score } : null;

      const visitCounts = new Map<string, number>();
      const returningUsers = new Set<string>();
      for (const e of events) {
        if (e.user_id) {
          const count = (visitCounts.get(e.user_id) ?? 0) + 1;
          visitCounts.set(e.user_id, count);
          if (count >= 3) returningUsers.add(e.user_id);
        }
      }

      const allEvents = await client.from('analytics_events').select('user_id, event_type').not('user_id', 'is', null);
      const allEventData = allEvents.data ?? [];
      const allVisitCounts = new Map<string, number>();
      for (const e of allEventData) {
        if (e.user_id) {
          allVisitCounts.set(e.user_id, (allVisitCounts.get(e.user_id) ?? 0) + 1);
        }
      }

      const opportunities: Opportunity[] = [];
      const processed = new Set<string>();
      for (const [uid, count] of allVisitCounts) {
        if (count >= 2 && !processed.has(uid)) {
          processed.add(uid);
          const userSessions = sessions.filter(s => s.user_id === uid);
          const userTrades = trades.filter(t => t.user_id === uid);
          const userWhatsapp = whatsappUsers.filter(w => w.user_id === uid);
          const userObj = users.find(u => u.id === uid);
          const userEvents = events.filter(e => e.user_id === uid);
          const lastEvent = userEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

          const bestScore = userSessions.length > 0
            ? Math.max(...userSessions.map(s => ((s as any).scientific_results?.focus_score as number) ?? 0))
            : 0;

          const campaignSources = [...new Set(userSessions.map(s => s.campaign_id).filter(Boolean))];

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
            displayName: userObj?.display_name ?? 'Visitor',
            visitCount: count,
            gameCount: userSessions.length,
            lastVisit: lastEvent?.created_at ?? '',
            deviceInfo,
            tradeRequested: userTrades.length > 0,
            whatsappClicked: userWhatsapp.length > 0,
            bestFocusScore: bestScore,
            campaignSource: campaignSources[0] ?? null,
          });
        }
      }

      const hourlyData: { hour: number; visitors: number; players: number; trades: number }[] = [];
      for (let h = 0; h < 24; h++) {
        const hourEvents = events.filter(e => new Date(e.created_at).getHours() === h);
        const hourPlayers = sessions.filter(s => new Date(s.created_at).getHours() === h);
        const hourTrades = trades.filter(t => new Date(t.created_at).getHours() === h);
        hourlyData.push({
          hour: h,
          visitors: new Set(hourEvents.map(e => e.user_id).filter(Boolean)).size,
          players: new Set(hourPlayers.map(s => s.user_id).filter(Boolean)).size,
          trades: hourTrades.length,
        });
      }

      return {
        today,
        topTradeInDevice,
        bestCampaign,
        worstCampaign,
        opportunities: opportunities.sort((a, b) => b.visitCount - a.visitCount).slice(0, 50),
        hourlyDistribution: hourlyData,
      };
    },

    async getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
      const [userResult, sessionsResult, eventsResult, tradesResult, whatsappResult] = await Promise.all([
        client.from('users').select('*').eq('id', userId).single(),
        client.from('sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        client.from('analytics_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        client.from('trade_requests').select('*').eq('user_id', userId),
        client.from('analytics_events').select('*').eq('user_id', userId).eq('event_type', 'whatsapp_clicked'),
      ]);

      if (!userResult.data) return null;

      const user = userResult.data;
      const sessions = (sessionsResult.data ?? []) as any[];
      const events = (eventsResult.data ?? []) as any[];
      const trades = (tradesResult.data ?? []) as any[];
      const whatsappEvents = (whatsappResult.data ?? []) as any[];

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

      const timeline: TimelineEntry[] = events.map(e => ({
        timestamp: e.created_at,
        eventType: e.event_type,
        description: e.event_type,
        metadata: e.event_data as Record<string, unknown>,
      })).reverse();

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

      const tradeOfferViewEvents = events.filter(e => e.event_type === 'trade_offer_viewed');
      const lastCampaign = lastSession?.campaign_id ?? null;

      return {
        userId: user.id,
        displayName: user.display_name ?? 'Visitor',
        role: user.role ?? 'guest',
        firstVisit: firstSession?.created_at ?? '',
        lastVisit: lastSession?.created_at ?? '',
        totalVisits: events.length,
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
        whatsappClickCount: whatsappEvents.length,
        tradeOfferViewCount: tradeOfferViewEvents.length,
        tradeRequested: trades.length > 0,
        returnedAfterWeek,
        lastCampaign: lastCampaign ?? null,
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

      const [tradeEvents, whatsappEvents] = await Promise.all([
        client.from('trade_requests').select('device_id'),
        client.from('analytics_events').select('event_data, user_id').eq('event_type', 'whatsapp_clicked'),
      ]);

      const tradeDeviceIds = new Set((tradeEvents.data ?? []).map(t => t.device_id).filter(Boolean));
      const whatsappUsers = new Set((whatsappEvents.data ?? []).map(w => w.user_id).filter(Boolean));

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
            const deviceCampaigns = [...new Set(modelDevices.flatMap(d => d.campaigns))];
            const lastSeenDates = modelDevices.map(d => d.lastSeen).filter(Boolean);
            const lastSeen = lastSeenDates.sort().reverse()[0] ?? '';

            const insight: DeviceModelInsight = {
              model: modelGroup.model,
              marketingName: modelGroup.marketingName,
              count: modelGroup.count,
              specs: {
                ram: modelDevices[0]?.memoryGb ? `${modelDevices[0].memoryGb}GB` : 'Unknown',
                cpuCores: modelDevices[0]?.cpuCores ?? null,
                refreshRate: modelDevices[0]?.refreshRate ?? null,
                resolution: modelDevices[0]?.screenWidth && modelDevices[0]?.screenHeight
                  ? `${modelDevices[0].screenWidth}x${modelDevices[0].screenHeight}`
                  : 'Unknown',
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

    async getCampaignInsights(): Promise<CampaignInsight[]> {
      const campaignAnalytics = await researchAPI.getCampaignAnalytics();
      const { data: allEvents } = await client.from('analytics_events').select('event_type, user_id, event_data, created_at');
      const events = allEvents ?? [];

      const insights: CampaignInsight[] = [];

      for (const c of campaignAnalytics.campaigns) {
        const campaignEvents = events.filter(e => {
          const data = e.event_data as Record<string, unknown> ?? {};
          return data.campaign === c.name || data.source === c.name || data.campaign_id === c.id;
        });
        const campaignUsers = [...new Set(campaignEvents.map(e => e.user_id).filter(Boolean))];
        const gameEvents = campaignEvents.filter(e => e.event_type === 'game_started' || e.event_type === 'game_completed');
        const tradeEvents = campaignEvents.filter(e => e.event_type === 'trade_requested');
        const whatsappEvents = campaignEvents.filter(e => e.event_type === 'whatsapp_clicked');
        const completedGames = gameEvents.filter(e => e.event_type === 'game_completed').length;
        const startedGames = gameEvents.filter(e => e.event_type === 'game_started').length;

        const sessionsResult = await client.from('sessions')
          .select('user_id, scientific_results')
          .eq('campaign_id', c.id)
          .not('scientific_results', 'is', null)
          .limit(100);
        const campaignSessions = sessionsResult.data ?? [];
        const focusScores = campaignSessions.map(s => ((s.scientific_results as Record<string, unknown> | null)?.focus_score as number)).filter(s => typeof s === 'number');
        const avgFocus = focusScores.length > 0
          ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length * 10) / 10
          : 0;

        const uniqueReturning = [...new Set(campaignEvents.map(e => e.user_id).filter(Boolean))];
        const returningVisitors = uniqueReturning.length;

        const completionRate = startedGames > 0 ? Math.round((completedGames / startedGames) * 100) : 0;
        const tradeCount = tradeEvents.length;
        const whatsappCount = new Set(whatsappEvents.map(e => e.user_id).filter(Boolean)).size;
        const conversionRate = campaignUsers.length > 0 ? Math.round((tradeCount / campaignUsers.length) * 100) : 0;

        let aiSummary = '';
        if (completionRate > 80) aiSummary = 'هذه الحملة تجذب زوارًا متفاعلين يكملون اللعبة بنسبة عالية.';
        else if (completionRate < 50) aiSummary = 'نسبة إكمال منخفضة — قد يحتاج عرض اللعبة إلى تحسين.';
        else aiSummary = 'أداء متوسط — يمكن تحسينه بتعديل عرض الحملة.';

        if (avgFocus > 70) aiSummary += ' اللاعبونCenter عالية التركيز.';
        else if (avgFocus < 40) aiSummary += ' مستوى التركيز منخفض — قد تكون اللعبة صعبة لهذه الفئة.';

        insights.push({
          id: c.id,
          name: c.name,
          isActive: c.is_active,
          roi: tradeCount > 0 ? Math.round((tradeCount / campaignUsers.length) * 100) : 0,
          visitors: campaignUsers.length,
          games: startedGames,
          completionRate,
          tradeRequests: tradeCount,
          whatsappClicks: whatsappCount,
          conversionRate,
          avgFocusScore: avgFocus,
          avgDeviceAge: 0,
          mostCommonPhones: [],
          returningVisitors,
          aiSummary,
        });
      }

      return insights.sort((a, b) => b.visitors - a.visitors);
    },

    async getCommerceFunnel(): Promise<CommerceFunnel> {
      const { data: allEvents } = await client.from('analytics_events').select('event_type, user_id, created_at').order('created_at', { ascending: false });
      const events = allEvents ?? [];

      const uniqueUsersByEvent = new Map<string, Set<string>>();
      const funnelStages = [
        'qr_scanned', 'landing_loaded', 'consent_granted', 'calibration_completed',
        'game_started', 'game_completed', 'results_viewed', 'register_cta_clicked',
        'phone_service_opened', 'trade_offer_viewed', 'trade_requested', 'whatsapp_clicked',
      ];

      for (const stage of funnelStages) {
        uniqueUsersByEvent.set(stage, new Set());
      }
      for (const e of events) {
        if (e.user_id && uniqueUsersByEvent.has(e.event_type)) {
          uniqueUsersByEvent.get(e.event_type)!.add(e.user_id);
        }
      }

      const firstStage = funnelStages[0];
      let firstCount = firstStage ? (uniqueUsersByEvent.get(firstStage)?.size ?? 1) : 1;
      const stages: FunnelStage[] = funnelStages.map((name, i) => {
        const count = uniqueUsersByEvent.get(name)?.size ?? 0;
        const percentage = firstCount > 0 ? Math.round((count / firstCount) * 1000) / 10 : 0;
        const prevStage = i > 0 ? funnelStages[i - 1] : undefined;
        const prevCount = prevStage ? (uniqueUsersByEvent.get(prevStage)?.size ?? 0) : count;
        const dropFromPrevious = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
        return { name, count, percentage, dropFromPrevious };
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

    async getTreasureMode(): Promise<TreasureModeData> {
      const [cc, funnel, campaignInsights, deviceInsights] = await Promise.all([
        this.getCommandCenter(),
        this.getCommerceFunnel(),
        this.getCampaignInsights(),
        this.getDeviceInsights(),
      ]);

      const problems: AIInsight[] = [];
      if (cc.today.conversionRate < 10) {
        problems.push({
          type: 'problem',
          title: 'نسبة تحويل منخفضة',
          description: `اليوم فقط ${cc.today.conversionRate}% من الزوار طلبوا استبدال.`,
          severity: 'high',
          metric: cc.today.conversionRate,
          trend: 'down',
        });
      }

      for (const c of campaignInsights) {
        if (c.conversionRate < 5 && c.visitors > 10) {
          problems.push({
            type: 'problem',
            title: `حملة ضعيفة: ${c.name}`,
            description: `نسبة تحويل ${c.conversionRate}% فقط من ${c.visitors} زائر.`,
            severity: 'medium',
            metric: c.conversionRate,
            trend: 'down',
          });
        }
      }

      const alerts: AIInsight[] = [];
      if (funnel.criticalDropOff && funnel.criticalDropOff.dropRate > 50) {
        alerts.push({
          type: 'alert',
          title: 'تسرب كبير في المسار',
          description: `${funnel.criticalDropOff.dropRate}% من الزوار يغادرون عند ${funnel.criticalDropOff.to}.`,
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
          title: 'جلسات متوقفة',
          description: `يوجد ${abandonedSessions.count} جلسة توقفت قبل نهاية اللعبة في آخر 24 ساعة.`,
          severity: 'medium',
          metric: abandonedSessions.count ?? undefined,
        });
      }

      const recommendations: AIInsight[] = cc.opportunities
        .filter(o => o.visitCount >= 3 && !o.tradeRequested)
        .slice(0, 5)
        .map(o => ({
          type: 'recommendation' as const,
          title: `خصم مقترح لـ ${o.displayName}`,
          description: `زار ${o.visitCount} مرات ولم يطلب استبدال. اعرض خصم 5%.`,
          severity: 'medium' as const,
        }));

      if (cc.opportunities.filter(o => o.visitCount >= 3 && !o.tradeRequested).length > 5) {
        recommendations.push({
          type: 'recommendation',
          title: 'حملة عودة للزوار',
          description: `${cc.opportunities.filter(o => o.visitCount >= 3 && !o.tradeRequested).length} زائرًا عادوا أكثر من 3 مرات ولم يطلبوا استبدال.`,
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
          needsDiscount: o.visitCount >= 3 && !o.tradeRequested,
        };
      });
    },

    async getBranchData(): Promise<BranchData[]> {
      const branchKey = 'bi_branch_data';
      try {
        const stored = localStorage.getItem(branchKey);
        if (stored) return JSON.parse(stored) as BranchData[];
      } catch {}
      return [];
    },
  };
}

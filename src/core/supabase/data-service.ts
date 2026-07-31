import { getSupabaseClient } from './client';
import type { SupabaseClient } from '@supabase/supabase-js';

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function generateShortCode(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => BASE62[b % 62]).join('');
}

// Types for analytics events
export interface AnalyticsEvent {
  id?: string;
  user_id?: string;
  session_id?: string;
  event_type: string;
  event_data: Record<string, unknown>;
  campaign_id?: string;
  device_id?: string;
  user_agent?: string;
  created_at?: string;
}

// Types for campaigns
export interface Campaign {
  id?: string;
  name: string;
  source?: string;
  location?: string;
  school?: string;
  company?: string;
  event?: string;
  language?: string;
  version?: string;
  is_active: boolean;
  location_type?: string;
  description?: string;
  country?: string;
  state_name?: string;
  city?: string;
  district?: string;
  venue?: string;
  goal?: string;
  budget?: number;
  budget_currency?: string;
  campaign_type?: string;
  material?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  logo_url?: string;
  notes?: string;
  short_code?: string;
  qr_config?: QRConfig;
  timeline?: CampaignTimelineEntry[];
  created_by?: string;
  last_edited_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface QRConfig {
  template?: string;
  foreground?: string;
  background?: string;
  rounded?: boolean;
  eyeRounded?: boolean;
  frame?: string;
  frameText?: string;
  logoOption?: 'default' | 'upload' | 'none';
  logoUrl?: string;
}

export interface CampaignTimelineEntry {
  action: string;
  timestamp: string;
  by?: string;
}

// Types for QR codes
export interface QRCode {
  id?: string;
  campaign_id?: string;
  code: string;
  referral_code?: string;
  url: string;
  scan_count: number;
  game_start_count: number;
  game_complete_count: number;
  registration_count: number;
  is_active: boolean;
  version?: number;
  created_at?: string;
  updated_at?: string;
}

// Types for sessions (matching existing schema)
export interface SessionData {
  id: string;
  user_id: string;
  device_id: string;
  calibration_id: string;
  campaign_id?: string;
  plugin_id: string;
  status: string;
  measurements?: Record<string, unknown>;
  scientific_results?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  finished_at?: string;
  version: string;
}

class DataService {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  // Analytics Events
  async trackEvent(event: Omit<AnalyticsEvent, 'id' | 'created_at'>): Promise<void> {
    const props = event.event_data as Record<string, unknown>;
    const campaignId = (props?.campaign_id as string) ?? event.campaign_id ?? undefined;
    await this.client
      .from('analytics_events')
      .insert({
        user_id: event.user_id,
        session_id: event.session_id,
        event_type: event.event_type,
        event_data: event.event_data,
        campaign_id: campaignId,
        device_id: event.device_id,
        user_agent: event.user_agent || navigator.userAgent,
        created_at: new Date().toISOString(),
      });
  }

  async getEvents(filters?: {
    event_type?: string;
    user_id?: string;
    session_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: AnalyticsEvent[]; count: number }> {
    let query = this.client
      .from('analytics_events')
      .select('*', { count: 'exact' });

    if (filters?.event_type) {
      query = query.eq('event_type', filters.event_type);
    }
    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters?.session_id) {
      query = query.eq('session_id', filters.session_id);
    }
    if (filters?.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { data: [], count: 0 };
    }

    return { data: data ?? [], count: count ?? 0 };
  }

  // Campaigns
  async createCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign | null> {
    const shortCode = generateShortCode();
    const { data, error } = await this.client
      .from('campaigns')
      .insert({
        name: campaign.name,
        source: campaign.source,
        location: campaign.location,
        school: campaign.school,
        company: campaign.company,
        event: campaign.event,
        language: campaign.language,
        version: campaign.version,
        is_active: campaign.is_active,
        location_type: campaign.location_type,
        description: campaign.description,
        country: campaign.country,
        state_name: campaign.state_name,
        city: campaign.city,
        district: campaign.district,
        venue: campaign.venue,
        goal: campaign.goal,
        budget: campaign.budget,
        budget_currency: campaign.budget_currency,
        campaign_type: campaign.campaign_type,
        material: campaign.material,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        status: campaign.status ?? 'active',
        logo_url: campaign.logo_url,
        notes: campaign.notes,
        short_code: shortCode,
        qr_config: campaign.qr_config,
        timeline: [{ action: 'created', timestamp: new Date().toISOString(), by: campaign.created_by }],
        created_by: campaign.created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  async getCampaigns(filters?: { is_active?: boolean; limit?: number; offset?: number }): Promise<{ data: Campaign[]; count: number }> {
    let query = this.client
      .from('campaigns')
      .select('*', { count: 'exact' });

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { data: [], count: 0 };
    }

    return { data: data ?? [], count: count ?? 0 };
  }

  async updateCampaign(id: string, updates: Partial<Campaign>): Promise<void> {
    await this.client
      .from('campaigns')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.client
      .from('campaigns')
      .update({ status: 'archived', is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  async restoreCampaign(id: string): Promise<void> {
    await this.client
      .from('campaigns')
      .update({ status: 'active', is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  async getCampaignByShortCode(code: string): Promise<Campaign | null> {
    const { data, error } = await this.client
      .from('campaigns')
      .select('*')
      .eq('short_code', code)
      .single();

    if (error || !data) return null;
    return data;
  }

  async addTimelineEntry(campaignId: string, action: string, by?: string): Promise<void> {
    const { data } = await this.client
      .from('campaigns')
      .select('timeline')
      .eq('id', campaignId)
      .single();

    const timeline = (data?.timeline ?? []) as CampaignTimelineEntry[];
    timeline.push({ action, timestamp: new Date().toISOString(), by });

    await this.client
      .from('campaigns')
      .update({ timeline, updated_at: new Date().toISOString() })
      .eq('id', campaignId);
  }

  async getCampaignEvents(campaignId: string, limit = 500): Promise<AnalyticsEvent[]> {
    const { data } = await this.client
      .from('analytics_events')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []) as AnalyticsEvent[];
  }

  // QR Codes
  async createQRCode(qrCode: Omit<QRCode, 'id' | 'created_at' | 'updated_at'>): Promise<QRCode | null> {
    const { data, error } = await this.client
      .from('qr_codes')
      .insert({
        campaign_id: qrCode.campaign_id,
        code: qrCode.code,
        referral_code: qrCode.referral_code,
        url: qrCode.url,
        scan_count: qrCode.scan_count,
        game_start_count: qrCode.game_start_count,
        game_complete_count: qrCode.game_complete_count,
        registration_count: qrCode.registration_count,
        is_active: qrCode.is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  async getQRCode(code: string): Promise<QRCode | null> {
    const { data, error } = await this.client
      .from('qr_codes')
      .select('*')
      .eq('code', code)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  async updateQRCodeStats(code: string, stats: {
    scan_count?: number;
    game_start_count?: number;
    game_complete_count?: number;
    registration_count?: number;
  }): Promise<void> {
    await this.client
      .from('qr_codes')
      .update({
        ...stats,
        updated_at: new Date().toISOString(),
      })
      .eq('code', code);
  }

  async getQRCodes(filters?: { campaign_id?: string; is_active?: boolean; limit?: number; offset?: number }): Promise<{ data: QRCode[]; count: number }> {
    let query = this.client
      .from('qr_codes')
      .select('*', { count: 'exact' });

    if (filters?.campaign_id) {
      query = query.eq('campaign_id', filters.campaign_id);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { data: [], count: 0 };
    }

    return { data: data ?? [], count: count ?? 0 };
  }

  // Sessions
  async saveSession(session: SessionData): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .upsert({
        id: session.id,
        user_id: session.user_id,
        device_id: session.device_id,
        calibration_id: session.calibration_id,
        campaign_id: session.campaign_id,
        plugin_id: session.plugin_id,
        status: session.status,
        measurements: session.measurements,
        scientific_results: session.scientific_results,
        metadata: session.metadata,
        created_at: session.created_at,
        updated_at: session.updated_at,
        finished_at: session.finished_at,
        version: session.version,
      });

    if (error) {
      throw error;
    }
  }

  async getSessions(filters?: { user_id?: string; status?: string; limit?: number; offset?: number }): Promise<{ data: SessionData[]; count: number }> {
    let query = this.client
      .from('sessions')
      .select('*', { count: 'exact' });

    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { data: [], count: 0 };
    }

    return { data: data ?? [], count: count ?? 0 };
  }

  // Aggregate queries for dashboards
  async getJourney(filters: {
    user_id?: string;
    session_id?: string;
    device_id?: string;
    limit?: number;
  }): Promise<AnalyticsEvent[]> {
    let query = this.client
      .from('analytics_events')
      .select('*');

    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters?.session_id) {
      query = query.eq('session_id', filters.session_id);
    }
    if (filters?.device_id) {
      query = query.eq('device_id', filters.device_id);
    }

    const { data } = await query
      .order('created_at', { ascending: true })
      .limit(filters?.limit ?? 200);

    return (data ?? []) as AnalyticsEvent[];
  }

  // Health checks for analytics integrity audit
  async getEventTypeCounts(): Promise<Record<string, number>> {
    const { data } = await this.client
      .from('analytics_events')
      .select('event_type');
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const et = row.event_type as string;
      counts[et] = (counts[et] ?? 0) + 1;
    }
    return counts;
  }

  async getOrphanEventCounts(): Promise<{ no_session: number; no_device: number; no_session_or_device: number }> {
    const [noSession, noDevice, noEither] = await Promise.all([
      this.client.from('analytics_events').select('id', { count: 'exact', head: true }).is('session_id', null),
      this.client.from('analytics_events').select('id', { count: 'exact', head: true }).is('device_id', null),
      this.client.from('analytics_events').select('id', { count: 'exact', head: true }).or('session_id.is.null,device_id.is.null'),
    ]);
    return {
      no_session: noSession.count ?? 0,
      no_device: noDevice.count ?? 0,
      no_session_or_device: noEither.count ?? 0,
    };
  }

  async getSessionEventSequences(limitSessions = 50): Promise<AnalyticsEvent[]> {
    const { data } = await this.client
      .from('analytics_events')
      .select('*')
      .not('session_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(limitSessions * 30);
    return (data ?? []) as AnalyticsEvent[];
  }

  async getEventVolumeStats(): Promise<{ average: number; max: number; min: number; suspicious: number }> {
    const { data } = await this.client
      .from('analytics_events')
      .select('session_id');
    const perSession: Record<string, number> = {};
    for (const row of data ?? []) {
      const sid = row.session_id as string | null;
      if (!sid) continue;
      perSession[sid] = (perSession[sid] ?? 0) + 1;
    }
    const counts = Object.values(perSession);
    if (counts.length === 0) return { average: 0, max: 0, min: 0, suspicious: 0 };
    return {
      average: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
      max: Math.max(...counts),
      min: Math.min(...counts),
      suspicious: counts.filter((c) => c <= 5).length,
    };
  }

  async getRecentSessions(limit = 30): Promise<{ session_id: string; events: AnalyticsEvent[] }[]> {
    const { data } = await this.client
      .from('analytics_events')
      .select('session_id, event_type, created_at, device_id')
      .not('session_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    const raw = (data ?? []) as Pick<AnalyticsEvent, 'session_id' | 'event_type' | 'created_at' | 'device_id'>[];
    const grouped: Record<string, AnalyticsEvent[]> = {};
    for (const row of raw) {
      const sid = row.session_id!;
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push(row as AnalyticsEvent);
    }
    for (const evs of Object.values(grouped)) {
      evs.sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());
    }
    const sorted = Object.entries(grouped)
      .sort(([, a], [, b]) => new Date(b[b.length - 1]!.created_at!).getTime() - new Date(a[a.length - 1]!.created_at!).getTime())
      .slice(0, limit)
      .map(([session_id, events]) => ({ session_id, events }));
    return sorted;
  }

  async getFunnelEvents(dateFrom?: string): Promise<AnalyticsEvent[]> {
    let query = this.client
      .from('analytics_events')
      .select('event_type, campaign_id, created_at, user_agent, device_id, session_id, event_data');
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    const { data } = await query
      .in('event_type', ['qr_scanned', 'landing_loaded', 'consent_granted', 'calibration_completed', 'game_started', 'game_completed', 'results_viewed', 'auth_registered', 'registration_completed', 'trade_requested', 'whatsapp_clicked', 'phone_service_opened', 'buy_flow_started', 'game_abandoned', 'error_occurred'])
      .order('created_at', { ascending: false })
      .limit(15000);
    return (data ?? []) as AnalyticsEvent[];
  }

  async getCalibrationEvents(limit = 1000): Promise<AnalyticsEvent[]> {
    const { data } = await this.client
      .from('analytics_events')
      .select('*')
      .in('event_type', ['calibration_started', 'calibration_completed'])
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as AnalyticsEvent[];
  }

  async getPhoneExchangeEvents(limit = 2000): Promise<AnalyticsEvent[]> {
    const { data } = await this.client
      .from('analytics_events')
      .select('*')
      .in('event_type', ['phone_service_opened', 'device_selected', 'trade_offer_viewed', 'trade_requested', 'buy_flow_started', 'sell_flow_started', 'exchange_flow_started', 'whatsapp_clicked'])
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as AnalyticsEvent[];
  }

  async getGameEvents(limit = 1000): Promise<AnalyticsEvent[]> {
    const { data } = await this.client
      .from('analytics_events')
      .select('*')
      .in('event_type', ['game_started', 'game_completed', 'round_started', 'lamp_clicked'])
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as AnalyticsEvent[];
  }

  async getEventStats(eventType?: string): Promise<{
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let baseQuery = this.client
      .from('analytics_events')
      .select('id', { count: 'exact', head: true });

    if (eventType) {
      baseQuery = baseQuery.eq('event_type', eventType);
    }

    const [totalResult, todayResult, weekResult, monthResult] = await Promise.all([
      baseQuery,
      baseQuery.gte('created_at', todayStart),
      baseQuery.gte('created_at', weekStart),
      baseQuery.gte('created_at', monthStart),
    ]);

    return {
      total: totalResult.count ?? 0,
      today: todayResult.count ?? 0,
      thisWeek: weekResult.count ?? 0,
      thisMonth: monthResult.count ?? 0,
    };
  }

  async getQRStats(): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalQRCodes: number;
    totalScans: number;
    totalGameStarts: number;
    totalGameCompletes: number;
    totalRegistrations: number;
  }> {
    const [campaignsResult, qrResult] = await Promise.all([
      this.client
        .from('campaigns')
        .select('id', { count: 'exact', head: true }),
      this.client
        .from('qr_codes')
        .select('scan_count, game_start_count, game_complete_count, registration_count'),
    ]);

    const activeCampaignsResult = await this.client
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const qrCodes = qrResult.data ?? [];
    const stats = qrCodes.reduce((acc, qr) => ({
      totalScans: acc.totalScans + (qr.scan_count || 0),
      totalGameStarts: acc.totalGameStarts + (qr.game_start_count || 0),
      totalGameCompletes: acc.totalGameCompletes + (qr.game_complete_count || 0),
      totalRegistrations: acc.totalRegistrations + (qr.registration_count || 0),
    }), {
      totalScans: 0,
      totalGameStarts: 0,
      totalGameCompletes: 0,
      totalRegistrations: 0,
    });

    return {
      totalCampaigns: campaignsResult.count ?? 0,
      activeCampaigns: activeCampaignsResult.count ?? 0,
      totalQRCodes: qrCodes.length,
      ...stats,
    };
  }
}

// Singleton instance
let dataServiceInstance: DataService | null = null;

export function getDataService(client?: SupabaseClient): DataService {
  if (!dataServiceInstance) {
    dataServiceInstance = new DataService(client);
  }
  return dataServiceInstance;
}

export function resetDataService(): void {
  dataServiceInstance = null;
}

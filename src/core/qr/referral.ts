import { getSupabaseClient } from '../supabase/client';

export interface ReferralProfile {
  readonly id: string;
  readonly userId: string;
  readonly referralCode: string;
  readonly createdAt: number;
  readonly totalScans: number;
  readonly totalConversions: number;
}

export interface ReferralStats {
  readonly code: string;
  readonly totalScans: number;
  readonly totalConversions: number;
  readonly conversionRate: number;
  readonly recentScans: readonly ReferralScan[];
}

export interface ReferralScan {
  readonly timestamp: number;
  readonly campaignId: string | null;
  readonly converted: boolean;
}

export interface ReferralEngine {
  createProfile(userId: string): Promise<ReferralProfile>;
  getProfile(userId: string): Promise<ReferralProfile | null>;
  getProfileByCode(code: string): Promise<ReferralProfile | null>;
  recordScan(userId: string, campaignId?: string): Promise<void>;
  recordConversion(userId: string): Promise<void>;
  getStats(userId: string): Promise<ReferralStats | null>;
  generateReferralUrl(userId: string, baseUrl: string): Promise<string>;
  generateReferralQrData(userId: string, baseUrl: string): Promise<string>;
  getAllProfiles(): Promise<readonly ReferralProfile[]>;
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createReferralEngine(): ReferralEngine {
  return {
    async createProfile(userId: string): Promise<ReferralProfile> {
      const client = getSupabaseClient();

      const { data: existing } = await client
        .from('users')
        .select('id, referral_code, created_at')
        .eq('id', userId)
        .single();

      if (existing?.referral_code) {
        return {
          id: existing.id,
          userId: existing.id,
          referralCode: existing.referral_code,
          createdAt: new Date(existing.created_at).getTime(),
          totalScans: 0,
          totalConversions: 0,
        };
      }

      let code = generateReferralCode();
      let attempts = 0;
      while (attempts < 10) {
        const { data: existingCode } = await client
          .from('users')
          .select('id')
          .eq('referral_code', code)
          .single();

        if (!existingCode) break;
        code = generateReferralCode();
        attempts++;
      }

      const { error } = await client
        .from('users')
        .update({ referral_code: code })
        .eq('id', userId);

      if (error) throw new Error(`Failed to create referral profile: ${error.message}`);

      return {
        id: userId,
        userId,
        referralCode: code,
        createdAt: Date.now(),
        totalScans: 0,
        totalConversions: 0,
      };
    },

    async getProfile(userId: string): Promise<ReferralProfile | null> {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('users')
        .select('id, referral_code, created_at')
        .eq('id', userId)
        .single();

      if (error || !data?.referral_code) return null;

      return {
        id: data.id,
        userId: data.id,
        referralCode: data.referral_code,
        createdAt: new Date(data.created_at).getTime(),
        totalScans: 0,
        totalConversions: 0,
      };
    },

    async getProfileByCode(code: string): Promise<ReferralProfile | null> {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('users')
        .select('id, referral_code, created_at')
        .eq('referral_code', code)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        userId: data.id,
        referralCode: data.referral_code,
        createdAt: new Date(data.created_at).getTime(),
        totalScans: 0,
        totalConversions: 0,
      };
    },

    async recordScan(userId: string, campaignId?: string): Promise<void> {
      const client = getSupabaseClient();
      await client.from('analytics_events').insert({
        event_type: 'referral_scan',
        user_id: userId,
        event_data: { referral_code: userId, campaign_id: campaignId ?? null },
        created_at: new Date().toISOString(),
      });
    },

    async recordConversion(userId: string): Promise<void> {
      const client = getSupabaseClient();
      await client.from('analytics_events').insert({
        event_type: 'referral_conversion',
        user_id: userId,
        event_data: { referral_code: userId },
        created_at: new Date().toISOString(),
      });
    },

    async getStats(userId: string): Promise<ReferralStats | null> {
      const client = getSupabaseClient();
      const profile = await this.getProfile(userId);
      if (!profile) return null;

      const { data: events } = await client
        .from('analytics_events')
        .select('event_type, created_at, event_data')
        .eq('user_id', userId)
        .in('event_type', ['referral_scan', 'referral_conversion']);

      const eventList = events ?? [];
      const scans = eventList.filter(e => e.event_type === 'referral_scan');
      const conversions = eventList.filter(e => e.event_type === 'referral_conversion');

      return {
        code: profile.referralCode,
        totalScans: scans.length,
        totalConversions: conversions.length,
        conversionRate: scans.length > 0 ? conversions.length / scans.length : 0,
        recentScans: scans.slice(-50).map(e => ({
          timestamp: new Date(e.created_at).getTime(),
          campaignId: (e.event_data as Record<string, unknown>)?.campaign_id as string ?? null,
          converted: false,
        })),
      };
    },

    async generateReferralUrl(userId: string, baseUrl: string): Promise<string> {
      const profile = await this.getProfile(userId);
      if (!profile) throw new Error(`No referral profile for user ${userId}`);
      const url = new URL(baseUrl);
      url.searchParams.set('ref', profile.referralCode);
      return url.toString();
    },

    async generateReferralQrData(userId: string, baseUrl: string): Promise<string> {
      return this.generateReferralUrl(userId, baseUrl);
    },

    async getAllProfiles(): Promise<readonly ReferralProfile[]> {
      const client = getSupabaseClient();
      const { data } = await client
        .from('users')
        .select('id, referral_code, created_at')
        .not('referral_code', 'is', null);

      return (data ?? []).map(row => ({
        id: row.id,
        userId: row.id,
        referralCode: row.referral_code,
        createdAt: new Date(row.created_at).getTime(),
        totalScans: 0,
        totalConversions: 0,
      }));
    },
  };
}

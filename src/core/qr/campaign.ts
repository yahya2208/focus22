import { getSupabaseClient } from '../supabase/client';

export interface CampaignParams {
  readonly campaign: string | null;
  readonly location: string | null;
  readonly school: string | null;
  readonly company: string | null;
  readonly event: string | null;
  readonly version: string | null;
  readonly language: string | null;
  readonly source: string | null;
  readonly referrer: string | null;
}

const CAMPAIGN_KEYS: (keyof CampaignParams)[] = [
  'campaign', 'location', 'school', 'company', 'event', 'version', 'language', 'source', 'referrer',
];

export function parseCampaignParams(url: string): CampaignParams {
  let search: URLSearchParams;
  try {
    const parsed = new URL(url);
    search = parsed.searchParams;
  } catch {
    search = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
  }

  const params: Record<string, string | null> = {};
  for (const key of CAMPAIGN_KEYS) {
    params[key] = search.get(key) ?? null;
  }
  return params as unknown as CampaignParams;
}

export function parseCampaignFromQueryString(queryString: string): CampaignParams {
  const search = new URLSearchParams(queryString.startsWith('?') ? queryString.slice(1) : queryString);
  const params: Record<string, string | null> = {};
  for (const key of CAMPAIGN_KEYS) {
    params[key] = search.get(key) ?? null;
  }
  return params as unknown as CampaignParams;
}

export function serializeCampaignParams(params: CampaignParams): string {
  const search = new URLSearchParams();
  for (const key of CAMPAIGN_KEYS) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  return search.toString();
}

export function hasCampaign(params: CampaignParams): boolean {
  if (params.campaign === null || params.campaign.length === 0) return false;
  const cleaned = params.campaign.replace(/-/g, '').trim();
  return cleaned.length > 0;
}

export interface CampaignRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly baseUrl: string;
  readonly params: CampaignParams;
  readonly scanCount: number;
  readonly conversionCount: number;
  readonly active: boolean;
}

export interface CampaignStore {
  create(name: string, baseUrl: string, params?: Partial<CampaignParams>): Promise<CampaignRecord>;
  get(id: string): Promise<CampaignRecord | null>;
  getAll(): Promise<readonly CampaignRecord[]>;
  recordScan(id: string): Promise<void>;
  recordConversion(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
  getStats(id: string): Promise<CampaignStats | null>;
}

export interface CampaignStats {
  readonly id: string;
  readonly scanCount: number;
  readonly conversionCount: number;
  readonly conversionRate: number;
}

export function createCampaignStore(): CampaignStore {
  return {
    async create(name: string, baseUrl: string, params: Partial<CampaignParams> = {}): Promise<CampaignRecord> {
      const client = getSupabaseClient();
      const campaignParams: CampaignParams = {
        campaign: params.campaign ?? name.toLowerCase().replace(/\s+/g, '-'),
        location: params.location ?? null,
        school: params.school ?? null,
        company: params.company ?? null,
        event: params.event ?? null,
        version: params.version ?? null,
        language: params.language ?? null,
        source: params.source ?? null,
        referrer: params.referrer ?? null,
      };

      const { data, error } = await client
        .from('campaigns')
        .insert({
          name,
          source: campaignParams.source,
          location: campaignParams.location,
          school: campaignParams.school,
          company: campaignParams.company,
          event: campaignParams.event,
          language: campaignParams.language,
          version: campaignParams.version,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create campaign: ${error.message}`);

      return {
        id: data.id,
        name: data.name,
        createdAt: new Date(data.created_at).getTime(),
        baseUrl,
        params: campaignParams,
        scanCount: 0,
        conversionCount: 0,
        active: true,
      };
    },

    async get(id: string): Promise<CampaignRecord | null> {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        name: data.name,
        createdAt: new Date(data.created_at).getTime(),
        baseUrl: '',
        params: {
          campaign: data.name,
          location: data.location,
          school: data.school,
          company: data.company,
          event: data.event,
          version: data.version,
          language: data.language,
          source: data.source,
          referrer: null,
        },
        scanCount: 0,
        conversionCount: 0,
        active: data.is_active,
      };
    },

    async getAll(): Promise<readonly CampaignRecord[]> {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: new Date(row.created_at).getTime(),
        baseUrl: '',
        params: {
          campaign: row.name,
          location: row.location,
          school: row.school,
          company: row.company,
          event: row.event,
          version: row.version,
          language: row.language,
          source: row.source,
          referrer: null,
        },
        scanCount: 0,
        conversionCount: 0,
        active: row.is_active,
      }));
    },

    async recordScan(id: string): Promise<void> {
      const client = getSupabaseClient();
      await client.rpc('increment_qr_counter', { p_campaign_id: id, p_column: 'scan_count' });
    },

    async recordConversion(id: string): Promise<void> {
      const client = getSupabaseClient();
      await client.rpc('increment_qr_counter', { p_campaign_id: id, p_column: 'registration_count' });
    },

    async deactivate(id: string): Promise<void> {
      const client = getSupabaseClient();
      await client
        .from('campaigns')
        .update({ is_active: false })
        .eq('id', id);
    },

    async getStats(id: string): Promise<CampaignStats | null> {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('qr_codes')
        .select('scan_count, registration_count')
        .eq('campaign_id', id);

      if (error || !data || data.length === 0) return null;

      const totalScans = data.reduce((sum, row) => sum + (row.scan_count || 0), 0);
      const totalConversions = data.reduce((sum, row) => sum + (row.registration_count || 0), 0);

      return {
        id,
        scanCount: totalScans,
        conversionCount: totalConversions,
        conversionRate: totalScans > 0 ? totalConversions / totalScans : 0,
      };
    },
  };
}

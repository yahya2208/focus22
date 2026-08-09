import { getSupabaseClient } from '../../../core/supabase/client';

// Admin-only campaign data access (Research Console). This module is the ONLY
// writer/reader of the campaigns table outside the public lookup RPC. It never
// touches analytics_events / qr_codes / placements / placement_history and
// never builds attribution URLs. RLS policy "Admins manage campaigns" (DB role)
// enforces access server-side; the UI is additionally gated by the campaigns
// resource in ROLE_PERMISSIONS (admin/super_admin only).

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

export interface Campaign {
  id?: string;
  name: string;
  goal?: string;
  campaign_type?: string;
  country?: string;
  state_name?: string;
  city?: string;
  district?: string;
  venue?: string;
  description?: string;
  notes?: string;
  budget?: number;
  budget_currency?: string;
  material?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  is_active: boolean;
  logo_url?: string;
  short_code?: string;
  qr_config?: QRConfig;
  timeline?: CampaignTimelineEntry[];
  created_by?: string;
  last_edited_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignFilters {
  is_active?: boolean;
  status?: string;
  limit?: number;
  offset?: number;
}

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateShortCode(length = 6): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => BASE62[b % 62]).join('');
}

// QR deep-link contract: plain `${origin}${basePath}c/<short_code>` — NO query
// params (no campaign/source/ref/placement attribution).
export function buildCampaignQrUrl(origin: string, basePath: string, shortCode: string): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${origin}${base}c/${shortCode}`;
}

export async function listCampaigns(
  filters: CampaignFilters = {},
): Promise<{ data: Campaign[]; count: number }> {
  let query = getSupabaseClient().from('campaigns').select('*', { count: 'exact' });
  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
  if (filters.status) query = query.eq('status', filters.status);
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { data: [], count: 0 };
  return { data: (data ?? []) as Campaign[], count: count ?? 0 };
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data, error } = await getSupabaseClient()
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Campaign;
}

// ---- Anonymous QR measurement (dashboard read, role-gated server-side) -----

export type QrFunnelEventType = 'scan' | 'game_start' | 'game_complete' | 'registration';

export interface CampaignQrMetricsRow {
  campaign_id: string;
  event_type: QrFunnelEventType;
  total: number;
  first_at?: string | null;
  last_at?: string | null;
}

/**
 * Reads the per-campaign QR funnel aggregates through the guarded RPC
 * `get_campaign_qr_metrics` (is_research_role enforced server-side). Aggregates
 * only — never raw rows, never nonces. Returns [] on any error.
 */
export async function getCampaignQrMetrics(): Promise<CampaignQrMetricsRow[]> {
  const { data, error } = await getSupabaseClient().rpc('get_campaign_qr_metrics', {});
  if (error) return [];
  return (data ?? []) as CampaignQrMetricsRow[];
}

export interface CampaignQrRates {
  startRate: number | null;
  completionRate: number | null;
  registrationRate: number | null;
}

/**
 * Zero-denominator-safe funnel rates. Any null denominator yields null
 * (rendered as "—"), never NaN/Infinity.
 */
export function computeCampaignQrRates(
  scans: number,
  starts: number,
  completions: number,
  registrations: number,
): CampaignQrRates {
  return {
    startRate: scans > 0 ? starts / scans : null,
    completionRate: starts > 0 ? completions / starts : null,
    registrationRate: completions > 0 ? registrations / completions : null,
  };
}

export type NewCampaign = Omit<Campaign, 'id' | 'short_code' | 'created_at' | 'updated_at'>;

export async function createCampaign(input: NewCampaign): Promise<Campaign | null> {
  const shortCode = generateShortCode();
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseClient()
    .from('campaigns')
    .insert({
      name: input.name,
      goal: input.goal,
      campaign_type: input.campaign_type,
      country: input.country,
      state_name: input.state_name,
      city: input.city,
      district: input.district,
      venue: input.venue,
      description: input.description,
      notes: input.notes,
      budget: input.budget,
      budget_currency: input.budget_currency,
      material: input.material,
      start_date: input.start_date,
      end_date: input.end_date,
      status: input.status ?? 'active',
      is_active: input.is_active ?? true,
      logo_url: input.logo_url,
      short_code: shortCode,
      qr_config: input.qr_config,
      timeline: [{ action: 'created', timestamp: now, by: input.created_by }],
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
    })
    .select()
    .maybeSingle();
  if (error) return null;
  return data as Campaign;
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<void> {
  await getSupabaseClient()
    .from('campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function deleteCampaign(id: string): Promise<void> {
  await getSupabaseClient()
    .from('campaigns')
    .update({ status: 'archived', is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function restoreCampaign(id: string): Promise<void> {
  await getSupabaseClient()
    .from('campaigns')
    .update({ status: 'active', is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function addTimelineEntry(campaignId: string, action: string, by?: string): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { data } = await client
      .from('campaigns')
      .select('timeline')
      .eq('id', campaignId)
      .maybeSingle();
    const timeline = ((data?.timeline as CampaignTimelineEntry[] | undefined) ?? []);
    timeline.push({ action, timestamp: new Date().toISOString(), by });
    await client
      .from('campaigns')
      .update({ timeline, updated_at: new Date().toISOString() })
      .eq('id', campaignId);
  } catch {
    // Timeline is best-effort; CRUD must not fail if the column is unavailable.
  }
}

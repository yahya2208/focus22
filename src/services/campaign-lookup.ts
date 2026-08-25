import { getSupabaseClient } from '../core/supabase/client';

export interface CampaignEntry {
  readonly id: string;
  readonly shortCode: string;
  readonly name: string;
  readonly challengeId: string | null;
}

const SHORT_CODE_PATTERN = /\/c\/([a-zA-Z0-9]{6})(?:\/)?$/;
const SHORT_CODE_FORMAT = /^[a-zA-Z0-9]{6}$/;

export function extractCampaignShortCode(pathname: string): string | null {
  const match = SHORT_CODE_PATTERN.exec(pathname);
  return match ? match[1]! : null;
}

export function extractCampaignShortCodeFromQuery(search: string): string | null {
  if (!search.startsWith('?/')) return null;
  return extractCampaignShortCode(search.slice(1));
}

export function extractCampaignShortCodeFromLocation(pathname: string, search: string): string | null {
  return extractCampaignShortCode(pathname) ?? extractCampaignShortCodeFromQuery(search);
}

export async function lookupCampaign(shortCode: string): Promise<CampaignEntry | null> {
  if (!SHORT_CODE_FORMAT.test(shortCode)) return null;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .rpc('lookup_campaign_by_short_code', { p_code: shortCode })
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    const row = data as { id: string; short_code: string; name: string; is_active: boolean; challenge_id: string | null };
    if (row.is_active !== true) return null;
    return { id: row.id, shortCode: row.short_code, name: row.name, challengeId: row.challenge_id ?? null };
  } catch {
    return null;
  }
}

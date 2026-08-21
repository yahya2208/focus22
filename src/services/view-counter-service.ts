import { getSupabaseClient } from '../core/supabase/client';
import { getVisitorHash } from './intent-tracking';

export interface ViewCountResult {
  total_views: number;
  unique_views: number;
  last_viewed: string | null;
}

export interface RecordViewResult {
  ok: boolean;
  total: number;
  unique: number;
  is_unique: boolean;
  error?: string;
}

/**
 * Record a phone view event via the server-side RPC.
 *
 * Identity model:
 *   - Authenticated users: auth.uid() (server-side, not sent by client)
 *   - Guest/anonymous: visitor_hash from focus_vid_v1
 *
 * The server validates, rate-limits, deduplicates, inserts the event,
 * and upserts the counter — all atomically.
 *
 * Fire-and-forget: call without await. Never throws.
 */
export async function recordPhoneView(
  deviceId: string,
  eventType: 'card_view' | 'detail_view' = 'card_view',
): Promise<void> {
  try {
    const visitorHash = getVisitorHash();
    const { error } = await getSupabaseClient().rpc('record_phone_view', {
      p_device_id: deviceId,
      p_visitor_hash: visitorHash,
      p_event_type: eventType,
    });
    if (error) throw error;
  } catch {
    // Fire-and-forget — view counting failure never blocks the UI
  }
}

/**
 * Batch-fetch aggregated view counts for multiple phone devices.
 * Returns a map of deviceId → { total_views, unique_views, last_viewed }.
 *
 * Safe to call on every page load. The RPC is STABLE and lightweight.
 */
export async function getPhoneViewCounts(
  deviceIds: string[],
): Promise<Record<string, ViewCountResult>> {
  if (deviceIds.length === 0) return {};
  try {
    const { data, error } = await getSupabaseClient().rpc('get_phone_view_counts', {
      p_device_ids: deviceIds,
    });
    if (error) throw error;
    return (data as Record<string, ViewCountResult>) ?? {};
  } catch {
    return {};
  }
}

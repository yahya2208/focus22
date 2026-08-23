/**
 * Phone Search Analytics — fire-and-forget service (Phase 1).
 *
 * Collects showroom search intent and search → phone selection relationships.
 * All writes are fire-and-forget; analytics failure can never block searching
 * or navigation (same contract as view-counter-service and intent-tracking).
 *
 * Identity model:
 *   - Authenticated users: auth.uid() (server-side, not sent by client)
 *   - Guests: visitor_hash from focus_vid_v1 (non-PII, same as view counter)
 *
 * Data model:
 *   - One search_event = the query + displayed result set
 *   - One search_selection = a phone selected from that result set
 *   - Explicit link: selection.search_event_id → search_event.id
 *
 * Privacy:
 *   - No IP addresses, no browser fingerprints, no PII
 *   - Query text sanitized and capped at 200 chars server-side
 *   - Rate limited: 60 searches/hour/identity
 *   - Dedup: same query from same identity within 10s is collapsed
 */

import { getSupabaseClient } from '../core/supabase/client';
import { getVisitorHash } from './intent-tracking';

export type SearchContext = 'showroom' | 'catalog';

export interface SearchResult {
  searchEventId: number;
  deduped: boolean;
}

/**
 * Records a meaningful search event (after debounce).
 * Fire-and-forget: call without await, never throws.
 *
 * @param queryText - The user's search string (trimmed, capped at 200 chars server-side)
 * @param resultsCount - How many results were displayed when the search was recorded
 * @param context - Where the search occurred
 * @returns The search_event_id for linking subsequent selections
 */
export async function recordPhoneSearch(
  queryText: string,
  resultsCount: number,
  context: SearchContext = 'showroom',
): Promise<SearchResult | null> {
  try {
    const visitorHash = getVisitorHash();
    const { data, error } = await getSupabaseClient().rpc('record_phone_search', {
      p_query_text: queryText,
      p_results_count: resultsCount,
      p_visitor_hash: visitorHash,
      p_context: context,
    });
    if (error || !data) throw error ?? new Error('NO_DATA');
    const result = data as { ok: boolean; search_event_id?: number; deduped?: boolean; error?: string };
    if (result?.error) {
      if (import.meta.env.DEV) console.warn('[phone-search] record_phone_search rejected:', result.error);
      return null;
    }
    return {
      searchEventId: result?.search_event_id ?? 0,
      deduped: result?.deduped ?? false,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[phone-search] recordPhoneSearch failed:', err);
    return null;
  }
}

/**
 * Records a phone selection linked to its originating search event.
 * Fire-and-forget: call without await, never throws.
 *
 * @param searchEventId - The ID returned by recordPhoneSearch
 * @param deviceId - The inventory_items.id of the selected phone
 * @param context - Where the selection occurred
 */
export async function recordSearchSelection(
  searchEventId: number,
  deviceId: string,
  context: SearchContext = 'showroom',
): Promise<void> {
  try {
    const { error } = await getSupabaseClient().rpc('record_search_selection', {
      p_search_event_id: searchEventId,
      p_device_id: deviceId,
      p_context: context,
    });
    if (error) throw error;
  } catch (err) {
    // Fire-and-forget — selection recording failure never blocks navigation.
    // DEV surfacing only: production failures stay silent but are no longer
    // invisible while debugging locally.
    if (import.meta.env.DEV) console.warn('[phone-search] recordSearchSelection failed:', err);
  }
}

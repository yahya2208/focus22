import { useCallback, useEffect, useRef } from 'react';
import {
  recordPhoneSearch,
  recordSearchSelection,
  type SearchContext,
} from '../services/phone-search-service';

/**
 * Shared search-analytics wiring for any phone search surface.
 *
 * Encapsulates the Phase 1 contract:
 *   - Meaningful searches only: < 2 chars resets state and is never recorded
 *   - Debounced 400ms — intermediate typing states are not recorded
 *   - Same query is never re-recorded (server dedups within 10s as backstop)
 *   - The returned search_event_id is retained for selection linking
 *   - All writes fire-and-forget; analytics failure can never break UX
 *
 * Usage: call recordSearch from an effect that depends on the query (and
 * result count) so the pending timer always reflects the latest values.
 */
/**
 * Cross-mount retention of the last successfully recorded search per context.
 *
 * The showroom screen remounts on every navigation while the module-singleton
 * UI state preserves the typed query — without this cache the remount re-fired
 * record_phone_search, the server deduped the repeat and returned NO
 * search_event_id, and selection linking went dead (phone_search_selections
 * stayed empty). Keyed by normalized query (lower(trim)) to mirror the
 * server-side dedup normalization.
 */
const lastSearchByContext = new Map<SearchContext, { queryKey: string; id: number }>();

/** Test seam — clears cross-mount retention between isolated test cases. */
export function resetSearchAnalyticsRetention(): void {
  lastSearchByContext.clear();
}

const normalizeQuery = (q: string): string => q.trim().toLowerCase();

export function useSearchAnalytics(context: SearchContext) {
  const activeSearchEventIdRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecordedQueryRef = useRef<string>('');

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  const reset = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    activeSearchEventIdRef.current = null;
    lastRecordedQueryRef.current = '';
    lastSearchByContext.delete(context);
  }, [context]);

  const recordSearch = useCallback((query: string, resultsCount: number) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const q = query.trim();
    if (q.length < 2) {
      activeSearchEventIdRef.current = null;
      lastRecordedQueryRef.current = '';
      return;
    }
    if (q === lastRecordedQueryRef.current) return;

    // Already recorded this exact search (possibly before a navigation
    // remount) — restore its id and never re-fire the RPC for it.
    const queryKey = normalizeQuery(q);
    const cached = lastSearchByContext.get(context);
    if (cached && cached.queryKey === queryKey) {
      activeSearchEventIdRef.current = cached.id;
      lastRecordedQueryRef.current = q;
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void recordPhoneSearch(q, resultsCount, context)
        .then((result) => {
          if (!result) return;
          if (result.searchEventId) {
            activeSearchEventIdRef.current = result.searchEventId;
            lastRecordedQueryRef.current = q;
            lastSearchByContext.set(context, { queryKey, id: result.searchEventId });
          } else if (result.deduped) {
            // Server collapsed this into an earlier identical search whose id
            // was not returned. Mark recorded to stop retry loops and relink
            // from the cache; without a cache match, disable linking rather
            // than mis-attribute the selection to a wrong search event.
            lastRecordedQueryRef.current = q;
            const cachedEntry = lastSearchByContext.get(context);
            activeSearchEventIdRef.current =
              cachedEntry && cachedEntry.queryKey === queryKey ? cachedEntry.id : null;
          }
        })
        .catch(() => { /* fire-and-forget: analytics failure never breaks search */ });
    }, 400);
  }, [context]);

  const linkSelection = useCallback((deviceId: string) => {
    const searchEventId = activeSearchEventIdRef.current;
    if (searchEventId) {
      void recordSearchSelection(searchEventId, deviceId, context)
        .catch(() => { /* fire-and-forget: analytics failure never blocks navigation */ });
    }
  }, [context]);

  return { recordSearch, linkSelection, reset };
}

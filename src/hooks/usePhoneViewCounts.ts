import { useCallback, useEffect, useState } from 'react';
import { getPhoneViewCounts, type ViewCountResult } from '../services/view-counter-service';

/**
 * Batch-fetches server-side view counts for a list of phone devices.
 * Returns a map of deviceId → ViewCountResult.
 *
 * The RPC is STABLE and lightweight — safe to call on every render
 * with a stable device list.
 *
 * Returns a `refetch` callback to re-fetch after a new view is recorded,
 * since the RPC is STABLE and may cache within a single transaction.
 */
export function usePhoneViewCounts(
  deviceIds: readonly string[],
): { counts: Record<string, ViewCountResult>; refetch: () => void } {
  const [counts, setCounts] = useState<Record<string, ViewCountResult>>({});
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (deviceIds.length === 0) {
      setCounts({});
      return;
    }

    let cancelled = false;

    getPhoneViewCounts([...deviceIds]).then((result) => {
      if (!cancelled) setCounts(result);
    });

    return () => { cancelled = true; };
  }, [deviceIds.join(','), fetchKey]);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return { counts, refetch };
}

import { useEffect, useState } from 'react';
import { loadRuntimeSettings, getRuntimeSetting } from '../core/config/runtime-settings';

const VIEW_COUNTS_KEY = 'showroom_view_counts';
const MAX_ENTRIES = () => getRuntimeSetting('cache.max_entries', 500);

const countedThisSession = new Set<string>();

function loadCounts(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEW_COUNTS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Increments once per session (session set dedupe) and persists per recordId
 * under `showroom_view_counts` (v5.1 §6). The counter is kept off the inventory
 * record so the stock payload stays clean.
 */
export function useViewCounter(recordId: string | undefined | null): { count: number } {
  const [count, setCount] = useState(0);

  useEffect(() => {
    loadRuntimeSettings();
    if (!recordId) return;
    const counts = loadCounts();
    if (!countedThisSession.has(recordId)) {
      countedThisSession.add(recordId);
      counts[recordId] = (counts[recordId] ?? 0) + 1;
      const keys = Object.keys(counts);
      const cap = MAX_ENTRIES();
      if (keys.length > cap) {
        for (const key of keys.slice(0, keys.length - cap)) delete counts[key];
      }
      try {
        localStorage.setItem(VIEW_COUNTS_KEY, JSON.stringify(counts));
      } catch {
        /* storage full / unavailable — counter stays in-session */
      }
    }
    setCount(counts[recordId] ?? 0);
  }, [recordId]);

  return { count };
}

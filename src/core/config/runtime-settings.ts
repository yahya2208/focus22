import { getSettings, resolveSetting, SETTING_DEFAULTS } from '../../business-intelligence/settings-api';

/**
 * Runtime accessor for centralized business settings (Phase 7).
 *
 * The DB (`app_settings` via the SECURITY DEFINER RPCs) is the source of truth.
 * This module loads the full set ONCE (on first use / explicit init), caches it
 * in memory, and exposes typed getters. Every getter falls back to the SAFE,
 * current hardcoded default when:
 *   - the RPC fails (offline / transport), or
 *   - the key is missing, or
 *   - the value is out of the registered bounds.
 *
 * It NEVER throws and NEVER depends on user data (no `focus_*` / `bi_*`) and is
 * NOT a source of truth — it is purely a fallback-friendly read layer.
 */

let cached: Readonly<Record<string, number>> | null = null;
let loadPromise: Promise<Readonly<Record<string, number>>> | null = null;

/** Convert a (possibly null) SettingsResult into a flat number map (fallbacks applied). */
function toFlat(result: Awaited<ReturnType<typeof getSettings>>): Readonly<Record<string, number>> {
  const flat: Record<string, number> = {};
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    flat[key] = resolveSetting(result ? result.settings ?? undefined : undefined, key);
  }
  return Object.freeze(flat);
}

/**
 * Load settings once (idempotent, cached). Returns a flat map of validated
 * numbers with safe fallbacks. Safe to call repeatedly; never rejects.
 */
export function loadRuntimeSettings(): Promise<Readonly<Record<string, number>>> {
  if (cached) return Promise.resolve(cached);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const result = await getSettings();
      cached = toFlat(result ?? null);
    } catch {
      // Never let a settings failure break the app.
      cached = toFlat(null);
    } finally {
      loadPromise = null;
    }
    return cached!;
  })();
  return loadPromise;
}

/** Force a refresh from the DB (resets the cache). Used by admin after save. */
export async function refreshRuntimeSettings(): Promise<Readonly<Record<string, number>>> {
  cached = null;
  return loadRuntimeSettings();
}

/** Clear the in-memory cache without fetching (test/introspection only). */
export function clearRuntimeSettingsCache(): void {
  cached = null;
  loadPromise = null;
}

/** Synchronous default-only accessor (before/without a fetch). Always safe. */
export function runtimeSettingDefault(key: string): number {
  return SETTING_DEFAULTS[key] ?? 0;
}

/** Get a single setting, applying the in-memory value or the safe default. */
export function getRuntimeSetting(key: string, fallback?: number): number {
  const base = fallback ?? SETTING_DEFAULTS[key] ?? 0;
  if (!cached) return base;
  const v = cached[key];
  if (v === undefined) return base;
  return v;
}

import {
  getSettings,
  resolveSetting,
  resolveSettingString,
  resolveSettingList,
  SETTING_DEFAULTS,
  SETTING_REGISTRY,
  isNumericSetting,
  type SettingEntry,
} from '../../business-intelligence/settings-api';

/**
 * Runtime accessor for centralized business settings (Phase 7, extended in
 * Admin Control Center Pass 1).
 *
 * The DB (`app_settings` via the SECURITY DEFINER RPCs) is the source of truth.
 * This module loads the full set ONCE (on first use / explicit init), caches it
 * in memory, and exposes typed getters. Every getter falls back to the SAFE,
 * current hardcoded default when:
 *   - the RPC fails (offline / transport), or
 *   - the key is missing, or
 *   - the value is out of the registered bounds / off the allow-list.
 *
 * It NEVER throws and NEVER depends on user data (no `focus_*` / `bi_*`) and is
 * NOT a source of truth — it is purely a fallback-friendly read layer.
 */

export type RuntimeSettingValue = number | string | string[];

let cached: Readonly<Record<string, RuntimeSettingValue>> | null = null;
let loadPromise: Promise<Readonly<Record<string, RuntimeSettingValue>>> | null = null;

/** Convert a (possibly null) SettingsResult into a flat map (fallbacks applied). */
function toFlat(result: Awaited<ReturnType<typeof getSettings>>): Readonly<Record<string, RuntimeSettingValue>> {
  const flat: Record<string, RuntimeSettingValue> = {};
  const raw = result?.settings ?? undefined;
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    const meta = SETTING_REGISTRY.find((s) => s.key === key);
    if (!meta) continue;
    if (isNumericSetting(meta)) {
      flat[key] = resolveSetting(raw as Readonly<Record<string, SettingEntry>> | undefined, key);
    } else if (meta.type === 'text') {
      flat[key] = resolveSettingString(raw as Readonly<Record<string, SettingEntry>> | undefined, key);
    } else {
      flat[key] = resolveSettingList(raw as Readonly<Record<string, SettingEntry>> | undefined, key);
    }
  }
  return Object.freeze(flat);
}

/**
 * Load settings once (idempotent, cached). Returns a flat map of validated
 * values with safe fallbacks. Safe to call repeatedly; never rejects.
 */
export function loadRuntimeSettings(): Promise<Readonly<Record<string, RuntimeSettingValue>>> {
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
export async function refreshRuntimeSettings(): Promise<Readonly<Record<string, RuntimeSettingValue>>> {
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
  const d = SETTING_DEFAULTS[key];
  return typeof d === 'number' ? d : 0;
}

/** Get a NUMERIC setting, applying the in-memory value or the safe default. */
export function getRuntimeSetting(key: string, fallback?: number): number {
  const base = fallback ?? SETTING_DEFAULTS[key] ?? 0;
  if (typeof base !== 'number') return 0;
  if (!cached) return base as number;
  const v = cached[key];
  if (v === undefined || typeof v !== 'number') return base as number;
  return v;
}

/** Get a TEXT setting, applying the in-memory value or the safe default. */
export function getRuntimeSettingString(key: string, fallback?: string): string {
  const base = fallback ?? (typeof SETTING_DEFAULTS[key] === 'string' ? (SETTING_DEFAULTS[key] as string) : '');
  if (typeof base !== 'string') return '';
  if (!cached) return base;
  const v = cached[key];
  if (v === undefined || typeof v !== 'string') return base;
  return v;
}

/** Get an ENUM (string[]) setting, applying the in-memory value or the default. */
export function getRuntimeSettingList(key: string, fallback?: readonly string[]): string[] {
  const meta = SETTING_REGISTRY.find((s) => s.key === key);
  const base = fallback
    ? [...fallback]
    : meta && Array.isArray(meta.defaultValue)
      ? [...meta.defaultValue]
      : [];
  if (!cached) return base;
  const v = cached[key];
  if (v === undefined || !Array.isArray(v)) return base;
  return [...v];
}

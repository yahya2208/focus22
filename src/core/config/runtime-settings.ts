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
import { getSupabaseClient } from '../supabase/client';

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
 * Session gate for all `get_settings` traffic (Gate B home auth-gating).
 * Returns true when an authenticated session exists. Defensive by design:
 * clients without an auth surface (unit-test fakes) resolve legacy-true so
 * existing offline tests keep their behavior; production clients always
 * expose `auth.getSession`. A thrown error also resolves true — the gate is
 * 401-hygiene, never authorization (the server still enforces).
 */
export async function hasClientSession(): Promise<boolean> {
  try {
    const client = getSupabaseClient() as unknown as {
      auth?: { getSession?: () => Promise<{ data?: { session?: unknown } }> };
    };
    const getSession = client.auth?.getSession;
    if (typeof getSession !== 'function') return true;
    const { data } = await getSession.call(client.auth);
    return !!data?.session;
  } catch {
    return true;
  }
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
      // Gate B: never emit the authenticated-only `get_settings` RPC without
      // a session. Logged-out callers get safe defaults WITHOUT caching, so a
      // later authenticated load still fetches the real snapshot.
      if (!(await hasClientSession())) {
        return toFlat(null);
      }
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

/**
 * Force a refresh from the DB (admin after a successful save/reset).
 *
 * Failure semantics (Pass-2): on a failed/denied refresh the PREVIOUS snapshot
 * is KEPT — a mid-session refresh must never degrade a customized runtime state
 * into bare defaults. Only the very first load (no snapshot yet) may fall back
 * to safe defaults when the DB is unreachable.
 */
export async function refreshRuntimeSettings(): Promise<Readonly<Record<string, RuntimeSettingValue>>> {
  const prev = cached;
  try {
    const result = await getSettings();
    if (result === null || result.error) {
      if (prev) return prev;
      cached = toFlat(null);
      return cached!;
    }
    cached = toFlat(result);
    return cached;
  } catch {
    if (prev) return prev;
    cached = toFlat(null);
    return cached!;
  }
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

// ── 00064 integration accessors ───────────────────────────────────────────────
// Thin typed reads for the five Pass-2 settings. Fallbacks equal the exact
// pre-integration hardcoded values, so with no DB override behavior is
// byte-identical to before centralization.

/** Admin catalog list page size (fallback: 50, the old PAGE_SIZE constant). */
export function adminCatalogPageSize(): number {
  return getRuntimeSetting('catalog.admin_page_size', 50);
}

/** Catalog search result limit (fallback: 20, the old searchCatalog default). */
export function catalogSearchResultLimit(): number {
  return getRuntimeSetting('catalog.search_result_limit', 20);
}

/** Max images per inventory item (fallback: 6, the old uploader limit). */
export function inventoryMaxImages(): number {
  return getRuntimeSetting('inventory.max_images', 6);
}

let authRefreshAttached = false;

/**
 * Auth-transition refresh for the settings cache (Gate B). Warms the cache on
 * sign-in (clearing any logged-out defaults first) and drops back to
 * uncached defaults on sign-out. Attaches once; safe to call repeatedly.
 */
export function attachRuntimeSettingsAuthRefresh(): void {
  if (authRefreshAttached) return;
  authRefreshAttached = true;
  try {
    const client = getSupabaseClient() as unknown as {
      auth?: { onAuthStateChange?: (cb: (event: string, session: unknown) => void) => void };
    };
    const subscribe = client.auth?.onAuthStateChange;
    if (typeof subscribe !== 'function') return;
    subscribe.call(client.auth, (_event, session) => {
      if (session) {
        clearRuntimeSettingsCache();
        void loadRuntimeSettings();
      } else {
        clearRuntimeSettingsCache();
      }
    });
  } catch {
    // ignore — warm path below still applies
  }
}

import { getSupabaseClient } from '../core/supabase/client';
import { devError } from '../core/logging';

/**
 * Admin Settings Control Center API (Phase 7).
 *
 * Single client entry point for centralized, safe business settings. Every
 * read/write is routed through the SECURITY DEFINER RPCs `get_settings` /
 * `set_setting` — the ONLY access to `app_settings`. The RPCs authorize the
 * caller server-side (read: admin/super_admin/researcher; write: admin/
 * super_admin) and return only the CLOSED registered set. This module never
 * reads raw rows, never holds audit fields, and never introspects unregistered
 * keys.
 *
 * Error contract (mirrors telemetry-api / get_phone_intelligence precedent):
 *   - RPC transport error          -> null (caller shows "RPC failure")
 *   - `{error:'UNAUTHORIZED'}`     -> caller may not read (permission denied)
 *   - `{error:'FORBIDDEN'}`        -> caller may read but not write
 *   - `{error:'INVALID_KEY'}`      -> key is not in the closed registry
 *   - `{error:'INVALID_TYPE'}`     -> value is not a number
 *   - `{error:'INVALID_VALUE'}`    -> value is not a finite number
 *   - `{error:'OUT_OF_RANGE'}`     -> value outside server-side bounds
 * A successful read returns `error: null` + `settings`.
 */

/** The closed registry of centralizable settings (mirrors the DB registry). */
export interface SettingMeta {
  readonly key: string;
  readonly category: 'game' | 'offers' | 'inventory' | 'rules' | 'cache';
  readonly type: 'integer' | 'percent';
  readonly label: string;
  readonly description: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
}

export const SETTING_REGISTRY: readonly SettingMeta[] = [
  { key: 'game.rounds', category: 'game', type: 'integer', label: 'Total rounds', description: 'Rounds per game', defaultValue: 7, min: 1, max: 50 },
  { key: 'game.min_delay_ms', category: 'game', type: 'integer', label: 'Min delay (ms)', description: 'Min lamp delay', defaultValue: 750, min: 100, max: 10000 },
  { key: 'game.max_delay_ms', category: 'game', type: 'integer', label: 'Max delay (ms)', description: 'Max lamp delay', defaultValue: 2890, min: 200, max: 20000 },
  { key: 'game.min_position_distance_pct', category: 'game', type: 'percent', label: 'Min position distance (%)', description: 'Min distance between lamps', defaultValue: 25, min: 0, max: 100 },
  { key: 'offers.default_discount_percent', category: 'offers', type: 'percent', label: 'Default discount (%)', description: 'Default offer discount', defaultValue: 5, min: 0, max: 100 },
  { key: 'offers.default_max_usage', category: 'offers', type: 'integer', label: 'Default max usage', description: 'Default offer max redemptions', defaultValue: 50, min: 1, max: 1000000 },
  { key: 'offers.return_discount_percent', category: 'offers', type: 'percent', label: 'Return-visitor discount (%)', description: 'Promo for returning visitors', defaultValue: 5, min: 0, max: 100 },
  { key: 'offers.whatsapp_discount_percent', category: 'offers', type: 'percent', label: 'WhatsApp discount (%)', description: 'Promo after WhatsApp contact', defaultValue: 8, min: 0, max: 100 },
  { key: 'offers.whatsapp_max_usage', category: 'offers', type: 'integer', label: 'WhatsApp max usage', description: 'WhatsApp promo cap', defaultValue: 30, min: 1, max: 1000000 },
  { key: 'inventory.overstock_multiplier', category: 'inventory', type: 'integer', label: 'Overstock multiplier', description: 'minThreshold x over-stock band', defaultValue: 3, min: 1, max: 20 },
  { key: 'rules.inventory_low_threshold', category: 'rules', type: 'integer', label: 'Low inventory threshold', description: 'Rule template: low stock alert', defaultValue: 5, min: 1, max: 1000000 },
  { key: 'rules.device_visitors_threshold', category: 'rules', type: 'integer', label: 'Device visitors threshold', description: 'Rule template: many device visitors', defaultValue: 30, min: 1, max: 1000000 },
  { key: 'rules.trade_conversion_threshold', category: 'rules', type: 'integer', label: 'Low conversion threshold', description: 'Rule template: low trade conversion', defaultValue: 10, min: 1, max: 100 },
  { key: 'rules.visitor_count_threshold', category: 'rules', type: 'integer', label: 'VIP visitor threshold', description: 'Rule template: VIP visitor', defaultValue: 90, min: 1, max: 1000000 },
  { key: 'rules.default_threshold', category: 'rules', type: 'integer', label: 'Default rule threshold', description: 'Default automation threshold', defaultValue: 3, min: 1, max: 1000000 },
  { key: 'rules.needs_discount_visit_count', category: 'rules', type: 'integer', label: 'Needs-discount visits', description: 'Visit count to flag needsDiscount', defaultValue: 3, min: 1, max: 1000000 },
  { key: 'cache.max_entries', category: 'cache', type: 'integer', label: 'Max cache entries', description: 'Per-device view-counter cap', defaultValue: 500, min: 1, max: 100000 },
];

export const SETTING_DEFAULTS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(SETTING_REGISTRY.map((s) => [s.key, s.defaultValue])) as Record<string, number>,
);

export type SettingsError = 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_KEY' | 'INVALID_TYPE' | 'INVALID_VALUE' | 'OUT_OF_RANGE';

export interface SettingEntry {
  readonly value: number | string;
  readonly category: string;
  readonly type: string;
}

export interface SettingsResult {
  readonly error: SettingsError | null;
  readonly settings: Readonly<Record<string, SettingEntry>> | null;
}

export interface SetSettingResult {
  readonly error: SettingsError | null;
  readonly saved: { key: string; value: number; category: string; type: string } | null;
}

/** Read the centralized settings. Returns `null` on transport/RPC failure
 *  (distinct from a permission error surfacing as `{error:...}`). */
export async function getSettings(): Promise<SettingsResult | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_settings');
  if (error) {
    devError('[settings] get_settings RPC failed', error);
    return null;
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return data as SettingsResult;
  }
  if (data && typeof data === 'object') {
    return data as SettingsResult;
  }
  devError('[settings] unexpected get_settings response');
  return null;
}

/** Update one validated setting. Returns `null` on transport/RPC failure. */
export async function setSetting(key: string, value: number): Promise<SetSettingResult | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('set_setting', { p_key: key, p_value: value });
  if (error) {
    devError('[settings] set_setting RPC failed', error);
    return null;
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return data as SetSettingResult;
  }
  if (data && typeof data === 'object') {
    return data as SetSettingResult;
  }
  devError('[settings] unexpected set_setting response');
  return null;
}

/** True when getSettings returned a permission (read) denial. */
export function isSettingsUnauthorized(r: SettingsResult | null): boolean {
  return r !== null && r.error === 'UNAUTHORIZED';
}

/** True when a write was denied (reader-but-not-writer or unauthorized). */
export function isSettingsWriteDenied(r: SetSettingResult | null): boolean {
  return r !== null && (r.error === 'FORBIDDEN' || r.error === 'UNAUTHORIZED');
}

/**
 * Resolve a single setting value with safe fallback to its hardcoded default.
 * - If a DB value is available and within bounds -> use it.
 * - If no DB value / fetch unavailable -> use the default.
 * Never throws and never returns an out-of-range number (defense in depth).
 */
export function resolveSetting(settings: Readonly<Record<string, SettingEntry>> | undefined, key: string): number {
  const meta = SETTING_REGISTRY.find((s) => s.key === key);
  const fallback = meta ? meta.defaultValue : 0;
  if (!settings) return fallback;
  const entry = settings[key];
  if (!entry) return fallback;
  const v = Number(entry.value);
  if (!Number.isFinite(v)) return fallback;
  if (meta && (v < meta.min || v > meta.max)) return fallback;
  return v;
}

/** Convenience: server-side range bounds for the admin UI validation hint. */
export function settingMeta(key: string): SettingMeta | undefined {
  return SETTING_REGISTRY.find((s) => s.key === key);
}

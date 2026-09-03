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

/**
 * Setting value type.
 *   - `integer` / `percent`: numeric scalar, validated against numeric min/max.
 *   - `text`: a string scalar, validated against a `pattern` / length, stored as
 *     a JSON string (e.g. the business WhatsApp line).
 *   - `enum`: an array of strings (JSON array of strings), validated against
 *     the closed `options` allow-list (e.g. allowed campaign currencies).
 */
export type SettingType = 'integer' | 'percent' | 'text' | 'enum';

/** The closed registry of centralizable settings (mirrors the DB registry). */
export interface SettingMeta {
  readonly key: string;
  readonly category:
    | 'game'
    | 'offers'
    | 'inventory'
    | 'rules'
    | 'cache'
    | 'telemetry'
    | 'general'
    | 'marketplace'
    | 'ads'
    | 'experience';
  readonly type: SettingType;
  readonly label: string;
  readonly description: string;
  /** Numeric defaults for integer/percent; string/[] for text/enum. */
  readonly defaultValue: number | string;
  /** Numeric bounds — present for integer/percent only. */
  readonly min?: number;
  readonly max?: number;
  /** Closed allow-list — present for enum only. */
  readonly options?: readonly string[];
  /** Regex pattern — present for text only (validated server-side too). */
  readonly pattern?: string;
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
  // Telemetry operational knobs (Phase 4.2). These bound request volume and
  // in-memory buffering only — they NEVER touch privacy, event shape, names,
  // or the record_telemetry_event RPC. Server-side bounds mirror 00060.
  { key: 'telemetry.max_batch', category: 'telemetry', type: 'integer', label: 'Flush batch size', description: 'Max events per telemetry batch', defaultValue: 10, min: 1, max: 50 },
  { key: 'telemetry.flush_ms', category: 'telemetry', type: 'integer', label: 'Flush interval (ms)', description: 'Telemetry flush timer (ms)', defaultValue: 5000, min: 250, max: 60000 },
  { key: 'telemetry.max_buffer', category: 'telemetry', type: 'integer', label: 'Max buffer size', description: 'In-memory telemetry buffer cap', defaultValue: 50, min: 1, max: 1000 },

  // ── Admin Control Center Pass 1 (00063) — operational, non-scientific A-class ──
  // General
  {
    key: 'commerce.currencies', category: 'general', type: 'enum', label: 'Currencies',
    description: 'Allow-listed campaign currencies', defaultValue: ['USD', 'DA', 'SAR', 'EUR', 'TRY'] as unknown as string,
    options: ['USD', 'DA', 'SAR', 'EUR', 'TRY'],
  },
  // Marketplace / WhatsApp
  {
    key: 'comm.whatsapp_phone', category: 'marketplace', type: 'text', label: 'WhatsApp line',
    description: 'Business WhatsApp number (E.164, + then 8–15 digits)', defaultValue: '+213556254007',
    pattern: '^\\+[0-9]{8,15}$',
  },
  { key: 'comm.whatsapp_guard_timeout_ms', category: 'marketplace', type: 'integer', label: 'WhatsApp guard (ms)', description: 'Same-tab exit guard window', defaultValue: 1500, min: 200, max: 30000 },
  { key: 'comm.whatsapp_min_digits', category: 'marketplace', type: 'integer', label: 'WhatsApp min digits', description: 'Min digits for a valid number', defaultValue: 8, min: 6, max: 15 },
  { key: 'comm.whatsapp_max_digits', category: 'marketplace', type: 'integer', label: 'WhatsApp max digits', description: 'Max digits for a valid number', defaultValue: 15, min: 8, max: 15 },
  { key: 'comm.whatsapp_message_max_length', category: 'marketplace', type: 'integer', label: 'WhatsApp message max length', description: 'Preset message cap (chars)', defaultValue: 1000, min: 100, max: 10000 },
  { key: 'comm.double_exit_window_ms', category: 'marketplace', type: 'integer', label: 'Double-exit window (ms)', description: 'Back-press window to exit', defaultValue: 3000, min: 500, max: 30000 },
  { key: 'marketplace.listing_page_limit', category: 'marketplace', type: 'integer', label: 'Listing page size', description: 'Public showroom pagination', defaultValue: 48, min: 1, max: 500 },
  { key: 'marketplace.similar_phones_limit', category: 'marketplace', type: 'integer', label: 'Similar phones', description: 'Similar-phones carousel cap', defaultValue: 8, min: 1, max: 50 },
  // Ads
  { key: 'ads.carousel_autoplay_ms', category: 'ads', type: 'integer', label: 'Ad autoplay (ms)', description: 'Ad carousel slide interval', defaultValue: 2000, min: 500, max: 30000 },
  { key: 'ads.carousel_swipe_threshold_px', category: 'ads', type: 'integer', label: 'Ad swipe threshold (px)', description: 'Min swipe distance', defaultValue: 50, min: 10, max: 200 },
  // Experience
  { key: 'experience.results_auto_advance_ms', category: 'experience', type: 'integer', label: 'Results auto-advance (ms)', description: 'Results→showroom auto-advance', defaultValue: 3000, min: 500, max: 60000 },
  { key: 'experience.gallery_autoplay_ms', category: 'experience', type: 'integer', label: 'Gallery autoplay (ms)', description: 'Product gallery autoplay interval', defaultValue: 3000, min: 500, max: 60000 },
];

export const SETTING_DEFAULTS: Readonly<Record<string, number | string>> = Object.freeze(
  Object.fromEntries(
    SETTING_REGISTRY.map((s) => [s.key, Array.isArray(s.defaultValue) ? s.defaultValue.join(',') : s.defaultValue]),
  ) as Record<string, number | string>,
);

/** A setting is numeric when its value type is integer/percent. */
export function isNumericSetting(s: SettingMeta): boolean {
  return s.type === 'integer' || s.type === 'percent';
}

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
  readonly saved: { key: string; value: number | string; category: string; type: string } | null;
}

/** Additive error kind for string/enum validation (mirrors 00063). */
export type SettingsErrorExtended = SettingsError | 'INVALID_ALLOWED' | 'INVALID_PATTERN';

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
export async function setSetting(key: string, value: number | string | readonly string[]): Promise<SetSettingResult | null> {
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
 * Resolve a single NUMERIC setting value with safe fallback to its hardcoded
 * default. Meant for integer/percent settings. If the DB value is present and
 * within bounds -> use it; otherwise fall back to the default. Never throws
 * and never returns an out-of-range number (defense in depth).
 */
export function resolveSetting(settings: Readonly<Record<string, SettingEntry>> | undefined, key: string): number {
  const meta = SETTING_REGISTRY.find((s) => s.key === key);
  const fallback = meta && typeof meta.defaultValue === 'number' ? meta.defaultValue : 0;
  if (!settings || !meta || !isNumericSetting(meta)) return fallback;
  const entry = settings[key];
  if (!entry) return fallback;
  const v = Number(entry.value);
  if (!Number.isFinite(v)) return fallback;
  if (meta.min !== undefined && (v < meta.min || v > meta.max!)) return fallback;
  return v;
}

/**
 * Resolve a TEXT setting (string scalar) with safe fallback. Validates against
 * the registered pattern when present. Never throws.
 */
export function resolveSettingString(settings: Readonly<Record<string, SettingEntry>> | undefined, key: string): string {
  const meta = SETTING_REGISTRY.find((s) => s.key === key);
  const fallback = meta && typeof meta.defaultValue === 'string' ? meta.defaultValue : '';
  if (!settings || !meta || meta.type !== 'text') return fallback;
  const entry = settings[key];
  if (!entry) return fallback;
  const v = String(entry.value).trim();
  if (v === '') return fallback;
  if (meta.pattern && !new RegExp(meta.pattern).test(v)) return fallback;
  return v;
}

/**
 * Resolve an ENUM setting (array of strings) with safe fallback. Any element
 * outside the closed allow-list is rejected and the default applied. Never
 * throws.
 */
export function resolveSettingList(settings: Readonly<Record<string, SettingEntry>> | undefined, key: string): string[] {
  const meta = SETTING_REGISTRY.find((s) => s.key === key);
  const fallback = meta && Array.isArray(meta.defaultValue) ? [...meta.defaultValue] : [];
  if (!settings || !meta || meta.type !== 'enum') return fallback;
  const entry = settings[key];
  if (!entry) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(entry.value));
  } catch {
    return fallback;
  }
  if (!Array.isArray(parsed)) return fallback;
  const allowed = meta.options ?? [];
  const clean = parsed.filter((x): x is string => typeof x === 'string' && allowed.includes(x));
  if (clean.length === 0) return fallback;
  return [...new Set(clean)];
}

/** Convenience: server-side range bounds for the admin UI validation hint. */
export function settingMeta(key: string): SettingMeta | undefined {
  return SETTING_REGISTRY.find((s) => s.key === key);
}

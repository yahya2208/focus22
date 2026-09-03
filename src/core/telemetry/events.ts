/**
 * FOCUS Telemetry — closed event registry (Phase T1).
 *
 * Every `TelemetryEventName` maps to a closed schema: a domain and an
 * ALLOWLIST of property keys (closed). `satisfies Record<…>` is the
 * compile-time guard that adding an event name in `types.ts` WITHOUT a schema
 * here is a type error, and adding a property key that is not in the allowlist
 * is rejected by `privacy.ts` at runtime before it ever reaches the wire.
 *
 * Forbidden keys (PII/free-text) are centrally denied in `privacy.ts`, NOT
 * repeated here; the allowlist here is the positive source of truth for what a
 * given event may carry.
 */
import type { TelemetryDomain, TelemetryEventName } from './types';

export interface TelemetryEventSchema {
  readonly domain: TelemetryDomain;
  /** Closed set of permitted property keys ('' = no properties allowed). */
  readonly properties: readonly string[];
  /** 1 = first released schema version; bumped only on breaking shape change. */
  readonly version: number;
}

const EVENTS = {
  // ——— app / lifecycle ———
  app_open: { domain: 'app', properties: [], version: 1 },
  app_ready: { domain: 'app', properties: [], version: 1 },
  app_background: { domain: 'app', properties: [], version: 1 },
  app_foreground: { domain: 'app', properties: [], version: 1 },
  app_update_detected: { domain: 'app', properties: ['from', 'to'], version: 1 },
  app_error: { domain: 'system', properties: ['error_code', 'count'], version: 1 },
  // ——— navigation ———
  screen_view: { domain: 'navigation', properties: ['from', 'is_initial'], version: 1 },
  navigation_back: { domain: 'navigation', properties: ['to'], version: 1 },
  navigation_exit: { domain: 'navigation', properties: [], version: 1 },
  deep_link_open: { domain: 'navigation', properties: ['mode', 'has_code'], version: 1 },
  // ——— categories ———
  category_view: { domain: 'category', properties: [], version: 1 },
  subcategory_view: { domain: 'category', properties: [], version: 1 },
  category_product_list_view: { domain: 'category', properties: ['count'], version: 1 },
  category_product_click: { domain: 'category', properties: ['position'], version: 1 },
  category_search: { domain: 'category', properties: ['has_result'], version: 1 },
  category_filter: { domain: 'category', properties: ['filter', 'active'], version: 1 },
  category_sort: { domain: 'category', properties: ['sort', 'direction'], version: 1 },
  // ——— products / showroom ———
  product_impression: { domain: 'product', properties: ['position'], version: 1 },
  product_view: { domain: 'product', properties: [], version: 1 },
  product_image_view: { domain: 'product', properties: ['index'], version: 1 },
  product_variant_select: { domain: 'product', properties: ['variant'], version: 1 },
  product_details_expand: { domain: 'product', properties: ['section'], version: 1 },
  product_share: { domain: 'product', properties: ['method'], version: 1 },
  product_favorite: { domain: 'product', properties: ['active'], version: 1 },
  product_contact: { domain: 'product', properties: ['method'], version: 1 },
  product_back: { domain: 'product', properties: [], version: 1 },
  // ——— listings ———
  listing_create_start: { domain: 'listing', properties: ['step'], version: 1 },
  listing_create_submit: { domain: 'listing', properties: [], version: 1 },
  listing_create_success: { domain: 'listing', properties: [], version: 1 },
  listing_create_failed: { domain: 'listing', properties: ['error_code'], version: 1 },
  listing_view_detail: { domain: 'listing', properties: [], version: 1 },
  listing_share: { domain: 'listing', properties: ['method'], version: 1 },
  listing_contact: { domain: 'listing', properties: ['method'], version: 1 },
  listing_add_to_cart: { domain: 'listing', properties: ['qty'], version: 1 },
  listing_edit_start: { domain: 'listing', properties: [], version: 1 },
  listing_edit_success: { domain: 'listing', properties: [], version: 1 },
  listing_delete: { domain: 'listing', properties: [], version: 1 },
  listing_publish: { domain: 'listing', properties: [], version: 1 },
  // ——— cart ———
  cart_add: { domain: 'cart', properties: ['qty'], version: 1 },
  cart_remove: { domain: 'cart', properties: [], version: 1 },
  cart_quantity_change: { domain: 'cart', properties: ['qty'], version: 1 },
  cart_clear: { domain: 'cart', properties: ['count'], version: 1 },
  cart_view: { domain: 'cart', properties: ['count'], version: 1 },
  // ——— request / whatsapp ———
  request_start: { domain: 'request', properties: [], version: 1 },
  request_submit: { domain: 'request', properties: [], version: 1 },
  request_success: { domain: 'request', properties: [], version: 1 },
  request_failed: { domain: 'request', properties: ['error_code'], version: 1 },
  whatsapp_open: { domain: 'request', properties: ['method'], version: 1 },
  // ——— ads ———
  ad_impression: { domain: 'ad', properties: ['position'], version: 1 },
  ad_click: { domain: 'ad', properties: ['position'], version: 1 },
  ad_contact: { domain: 'ad', properties: ['method'], version: 1 },
  // ——— games ———
  game_intro_view: { domain: 'game', properties: ['game'], version: 1 },
  game_start: { domain: 'game', properties: ['game', 'size'], version: 1 },
  game_exit: { domain: 'game', properties: ['game'], version: 1 },
  game_pause: { domain: 'game', properties: ['game'], version: 1 },
  game_resume: { domain: 'game', properties: ['game'], version: 1 },
  game_complete: { domain: 'game', properties: ['game', 'outcome'], version: 1 },
  game_round_complete: { domain: 'game', properties: ['game', 'round_index', 'hit'], version: 1 },
  game_result_view: { domain: 'game', properties: ['game'], version: 1 },
  game_abandon: { domain: 'game', properties: ['game', 'turns'], version: 1 },
  // ——— tic-tac-toe multiplayer ———
  ttt_lobby_view: { domain: 'ttt', properties: [], version: 1 },
  ttt_game_create: { domain: 'ttt', properties: ['mode', 'size'], version: 1 },
  ttt_invite_generate: { domain: 'ttt', properties: [], version: 1 },
  ttt_invite_share: { domain: 'ttt', properties: ['method'], version: 1 },
  ttt_invite_open: { domain: 'ttt', properties: [], version: 1 },
  ttt_join_attempt: { domain: 'ttt', properties: [], version: 1 },
  ttt_join_success: { domain: 'ttt', properties: ['side'], version: 1 },
  ttt_join_failed: { domain: 'ttt', properties: ['error_code'], version: 1 },
  ttt_game_ready: { domain: 'ttt', properties: ['side'], version: 1 },
  ttt_move_submit: { domain: 'ttt', properties: ['index'], version: 1 },
  ttt_move_accepted: { domain: 'ttt', properties: ['index'], version: 1 },
  ttt_move_rejected: { domain: 'ttt', properties: ['index', 'error_code'], version: 1 },
  ttt_game_win: { domain: 'ttt', properties: ['side', 'turns'], version: 1 },
  ttt_game_draw: { domain: 'ttt', properties: ['turns'], version: 1 },
  ttt_game_exit: { domain: 'ttt', properties: [], version: 1 },
  ttt_game_abandon: { domain: 'ttt', properties: ['turns'], version: 1 },
  // ——— auth ———
  auth_login_success: { domain: 'auth', properties: [], version: 1 },
  auth_login_failed: { domain: 'auth', properties: ['error_code'], version: 1 },
  auth_register_success: { domain: 'auth', properties: [], version: 1 },
  auth_register_failed: { domain: 'auth', properties: ['error_code'], version: 1 },
  auth_guest_gate_seen: { domain: 'auth', properties: [], version: 1 },
  auth_guest_upgrade_cta: { domain: 'auth', properties: [], version: 1 },
  // ——— system / errors ———
  rpc_error: { domain: 'system', properties: ['rpc', 'error_code'], version: 1 },
  network_error: { domain: 'system', properties: ['error_code'], version: 1 },
  validation_error: { domain: 'system', properties: ['error_code'], version: 1 },
  ui_error: { domain: 'system', properties: ['error_code'], version: 1 },
  unhandled_error: { domain: 'system', properties: ['error_code', 'count'], version: 1 },
  permission_denied: { domain: 'system', properties: ['error_code'], version: 1 },
} satisfies Record<TelemetryEventName, TelemetryEventSchema>;

export type TelemetryEventSchemaMap = typeof EVENTS;

export const TELEMETRY_EVENT_SCHEMAS: TelemetryEventSchemaMap = EVENTS;

export function getEventSchema(name: TelemetryEventName): TelemetryEventSchema {
  const schema = EVENTS[name];
  if (!schema) throw new Error(`[telemetry] unknown event: ${name}`);
  return schema;
}

export function isTelemetryEventName(value: string): value is TelemetryEventName {
  return Object.prototype.hasOwnProperty.call(EVENTS, value);
}

/** Domain-of-event lookup used by the server for audit/segmentation. */
export function domainOf(name: TelemetryEventName): TelemetryDomain {
  return EVENTS[name].domain;
}
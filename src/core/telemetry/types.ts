/**
 * FOCUS Telemetry — core types (Phase T1, contract approved 2026-08-31).
 *
 * The contract is CLOSED: `TelemetryEventName` is a fixed literal union backed
 * by a registry in `events.ts`, property allowlists are per-event and closed,
 * and the client never talks to `telemetry_events` directly (RPC only).
 *
 * Privacy contract (enforced by `privacy.ts` + server in 00057):
 *   - Only allowlisted property keys may ever reach the wire.
 *   - Free-form user text, PII and sensitive keys are FORBIDDEN.
 *   - `entity_id` is TEXT by design: DB uuids AND future CatalogId slugs.
 */

export const TELEMETRY_DOMAINS = [
  'app',
  'navigation',
  'category',
  'product',
  'listing',
  'cart',
  'request',
  'ad',
  'game',
  'ttt',
  'auth',
  'system',
] as const;

export type TelemetryDomain = (typeof TELEMETRY_DOMAINS)[number];

export const TELEMETRY_ENTITY_TYPES = [
  'catalog_product',
  'category',
  'subcategory',
  'product',
  'listing',
  'ad',
  'game',
  'challenge',
  'user',
  'session',
] as const;

export type TelemetryEntityType = (typeof TELEMETRY_ENTITY_TYPES)[number];

/**
 * Canonical event names (snake_case, `noun_action`). The registry in
 * `events.ts` maps each name to a closed schema — adding an event here
 * FORCES a schema entry via `satisfies Record<TelemetryEventName, …>`.
 */
export type TelemetryEventName =
  // app / lifecycle
  | 'app_open'
  | 'app_ready'
  | 'app_background'
  | 'app_foreground'
  | 'app_update_detected'
  | 'app_error'
  // navigation
  | 'screen_view'
  | 'navigation_back'
  | 'navigation_exit'
  | 'deep_link_open'
  // categories
  | 'category_view'
  | 'subcategory_view'
  | 'category_product_list_view'
  | 'category_product_click'
  | 'category_search'
  | 'category_filter'
  | 'category_sort'
  // products / showroom
  | 'product_impression'
  | 'product_view'
  | 'product_image_view'
  | 'product_variant_select'
  | 'product_details_expand'
  | 'product_share'
  | 'product_favorite'
  | 'product_contact'
  | 'product_back'
  // listings
  | 'listing_create_start'
  | 'listing_create_submit'
  | 'listing_create_success'
  | 'listing_create_failed'
  | 'listing_view_detail'
  | 'listing_share'
  | 'listing_contact'
  | 'listing_add_to_cart'
  | 'listing_edit_start'
  | 'listing_edit_success'
  | 'listing_delete'
  | 'listing_publish'
  // cart
  | 'cart_add'
  | 'cart_remove'
  | 'cart_quantity_change'
  | 'cart_clear'
  | 'cart_view'
  // request / whatsapp
  | 'request_start'
  | 'request_submit'
  | 'request_success'
  | 'request_failed'
  | 'whatsapp_open'
  // ads
  | 'ad_impression'
  | 'ad_click'
  | 'ad_contact'
  // games
  | 'game_intro_view'
  | 'game_start'
  | 'game_round_complete'
  | 'game_exit'
  | 'game_pause'
  | 'game_resume'
  | 'game_complete'
  | 'game_result_view'
  | 'game_abandon'
  // auth
  | 'auth_login_success'
  | 'auth_login_failed'
  | 'auth_register_success'
  | 'auth_register_failed'
  | 'auth_guest_gate_seen'
  | 'auth_guest_upgrade_cta'
  // tic-tac-toe multiplayer
  | 'ttt_lobby_view'
  | 'ttt_game_create'
  | 'ttt_invite_generate'
  | 'ttt_invite_share'
  | 'ttt_invite_open'
  | 'ttt_join_attempt'
  | 'ttt_join_success'
  | 'ttt_join_failed'
  | 'ttt_game_ready'
  | 'ttt_move_submit'
  | 'ttt_move_accepted'
  | 'ttt_move_rejected'
  | 'ttt_game_win'
  | 'ttt_game_draw'
  | 'ttt_game_exit'
  | 'ttt_game_abandon'
  // system / errors
  | 'rpc_error'
  | 'network_error'
  | 'validation_error'
  | 'ui_error'
  | 'unhandled_error'
  | 'permission_denied';

/**
 * Property values are deliberately restricted: enums, ids, counters and
 * booleans only. No free-form user text may ever be a property value.
 */
export type TelemetryPropertyValue = string | number | boolean | null;

export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

export interface TelemetryContext {
  /** Short non-PII device fingerprint (FNV-1a 8-hex), OPTIONAL and rare. */
  readonly fpHash?: string;
}

/**
 * What a caller hands to `track()`. `entityId` is TEXT (uuid or CatalogId
 * slug). `screen` is the canonical ScreenName string (nullable).
 */
export interface TelemetryEventInput {
  readonly event: TelemetryEventName;
  readonly entityType?: TelemetryEntityType | null;
  readonly entityId?: string | null;
  readonly screen?: string | null;
  readonly properties?: TelemetryProperties | null;
  readonly dedupeKey?: string | null;
  readonly context?: TelemetryContext | null;
}

/** The fully-resolved row that reaches the wire (server-shaped). */
export interface TelemetryWireRow {
  readonly event_id: string;
  readonly event_name: string;
  readonly event_version: number;
  readonly domain: string;
  readonly occurred_at: string;
  readonly session_id: string;
  readonly anonymous_id: string | null;
  readonly user_id: string | null;
  readonly screen: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly properties: TelemetryProperties;
  readonly context: TelemetryContext | null;
  readonly dedupe_key: string | null;
}

export const TELEMETRY_RPC_NAME = 'record_telemetry_event' as const;

export const TELEMETRY_MAX_BATCH = 10 as const;
export const TELEMETRY_FLUSH_MS = 5000 as const;
export const TELEMETRY_MAX_BUFFER = 50 as const;
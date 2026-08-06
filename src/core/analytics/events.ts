export interface EventSchema {
  [key: string]: Record<string, unknown>;
}

export const EventTypes = {
  // App lifecycle
  APP_OPENED: 'app_opened',

  // Navigation
  SCREEN_VIEW: 'screen_view',
  NAVIGATION_PUSH: 'navigation_push',
  NAVIGATION_REPLACE: 'navigation_replace',
  NAVIGATION_POP: 'navigation_pop',
  BACK_PRESSED: 'back_pressed',
  BACK_BLOCKED: 'back_blocked',

  // Landing
  LANDING_LOADED: 'landing_loaded',
  CAMPAIGN_DETECTED: 'campaign_detected',
  GAME_INTRO_SHOWN: 'game_intro_shown',

  // Consent / Rules
  CONSENT_GRANTED: 'consent_granted',
  CONSENT_WITHDRAWN: 'consent_withdrawn',
  REGISTER_CTA_CLICKED: 'register_cta_clicked',

  // Calibration
  CALIBRATION_STARTED: 'calibration_started',
  CALIBRATION_COMPLETED: 'calibration_completed',

  // Game rounds
  ROUND_STARTED: 'round_started',
  LAMP_APPEARED: 'lamp_appeared',
  LAMP_CLICKED: 'lamp_clicked',
  MISS_CLICK: 'miss_click',

  // Game lifecycle
  GAME_STARTED: 'game_started',
  GAME_COMPLETED: 'game_completed',
  GAME_ABANDONED: 'game_abandoned',
  GAME_PAUSED: 'game_paused',
  GAME_RESUMED: 'game_resumed',

  // Results / Post-game
  RESULTS_VIEWED: 'results_viewed',
  SHARE_CLICKED: 'share_clicked',

  // Exit classification (Phase 3A): intentional exits (WhatsApp/tel/mailto/share)
  // are tracked as exits; internal navigation no longer uses location.*.
  EXIT_ATTEMPT: 'exit_attempt',
  EXIT_CONFIRMED: 'exit_confirmed',

  // Auth
  AUTH_GUEST_CREATED: 'auth_guest_created',
  AUTH_REGISTERED: 'auth_registered',
  AUTH_CONVERTED: 'auth_converted',
  LOGIN: 'login',
  REGISTRATION_PROMPT: 'registration_prompt',
  REGISTRATION_COMPLETED: 'registration_completed',
  GUEST_CONVERTED: 'guest_converted',

  // QR / Campaign
  QR_SCANNED: 'qr_scanned',
  QR_GENERATED: 'qr_generated',
  QR_GAME_COMPLETED: 'qr_game_completed',
  CAMPAIGN_OPENED: 'campaign_opened',
  REFERRAL_CLICKED: 'referral_clicked',

  // Phone Services / Commerce
  PHONE_SERVICE_OPENED: 'phone_service_opened',
  DEVICE_SELECTED: 'device_selected',
  TRADE_OFFER_VIEWED: 'trade_offer_viewed',
  TRADE_REQUESTED: 'trade_requested',
  WHATSAPP_CLICKED: 'whatsapp_clicked',
  BUY_FLOW_STARTED: 'buy_flow_started',
  SELL_FLOW_STARTED: 'sell_flow_started',
  EXCHANGE_FLOW_STARTED: 'exchange_flow_started',

  // Session
  SESSION_SAVED: 'session_saved',
  SESSION_SYNCED: 'session_synced',

  // Settings / Errors
  SETTINGS_CHANGED: 'settings_changed',
  ERROR_OCCURRED: 'error_occurred',

  // Repair OS
  REPAIR_REQUESTED: 'repair_requested',
  QUOTE_SENT: 'quote_sent',
  QUOTE_APPROVED: 'quote_approved',
  COURIER_ASSIGNED: 'courier_assigned',
  COURIER_COLLECTED: 'courier_collected',
  STORE_RECEIVED: 'store_received',
  INSPECTION_STARTED: 'inspection_started',
  REPAIR_STARTED: 'repair_started',
  WAITING_PARTS: 'waiting_parts',
  QUALITY_CHECK: 'quality_check',
  REPAIR_COMPLETED: 'repair_completed',
  REPAIR_FAILED: 'repair_failed',
  CUSTOMER_RECEIVED: 'customer_received',
  COURIER_TRIP_STARTED: 'courier_trip_started',
  COURIER_ARRIVED: 'courier_arrived',
  COURIER_HEADING_STORE: 'courier_heading_store',
  COURIER_RETURNING: 'courier_returning',
  COURIER_RETURNED: 'courier_returned',
} as const;

export type AnalyticsEventType = (typeof EventTypes)[keyof typeof EventTypes];
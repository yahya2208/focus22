export { CALIBRATION, INPUT_LAG, REACTION, CONSISTENCY, FATIGUE, SCORING, PLATFORM, VERSION, VALIDATION_STATUS } from './scientific/constants';

export { createDefaultCalibrationProfile, type CalibrationProfile, type CalibrationResult } from './calibration';

export { correctReactionTime, type MeasurementResult, type GameEvent, type StimulusEvent, type InputEvent, type RoundCompleteEvent, type SessionCompleteEvent } from './measurement';

export { processReactions, type ReactionResult } from './engine/reaction';

export { analyzeConsistency, type ConsistencyResult } from './engine/consistency';

export { detectFatigue, type FatigueResult } from './engine/fatigue';

export { calculateFocusScore, type ScoringInput, type ScoringResult } from './engine/scoring';

export type { SessionRepository, SessionFilter, SessionSort, SessionPage } from './repository';
/**
 * ── FUTURE INFRASTRUCTURE — NOT YET WIRED INTO PRODUCTION FLOWS ──────────
 * AUDIT 2026-08-01:
 *   createMemorySessionRepository    (in-memory, used by tests only today)
 *   createLocalStorageSessionRepository (focus_sessions_v2 localStorage key)
 *
 *   These two factories implement the SESSION REPOSITORY PATTERN with full
 *   filter / sort / pagination support. The code path is 100% test-covered
 *   (see __tests__/session-repository.test.ts) and fully typed. However it
 *   is intentionally DISCONNECTED from the live app:
 *
 *     Current production session history still uses core/history/index.ts
 *     which reads/writes the OLD localStorage key "focus_sessions".
 *
 *   Wiring Plan (pending Product/Architecture sign-off):
 *     1. Write a ONE-TIME migrator: iterate focus_sessions → focus_sessions_v2.
 *     2. Wire HistoryScreen and any session consumers to the new repository.
 *     3. Deprecate core/history (legacy key) with a 3-month sunset window.
 *
 *   DO NOT delete these exports. They are preserved to avoid throwing away
 *   already-implemented repository infrastructure on the day the feature
 *   flag "Unified Reports" is activated.
 * ────────────────────────────────────────────────────────────────────────────
 */
export { createMemorySessionRepository, createLocalStorageSessionRepository } from './repository';

export { getSettings, updateSettings, subscribeSettings, type AppSettings } from './config/settings';

export {
  createSession, transitionSession, updateSessionMeasurements,
  canTransition, isSessionComplete, getSessionDuration, createSessionId,
  type Session, type SessionStatus, type SessionDraft,
  type SessionMeasurements, type SessionScientificResults, type SessionMetadata,
} from './session';

export {
  collectDeviceProfile, resetDeviceProfile, createDeviceProfileForTest,
  type DeviceProfile,
} from './device';

export {
  createEventPublisher, getGlobalEventPublisher, resetGlobalEventPublisher,
  type EventPublisher, type DomainEvent, type EventType, type EventHandler,
} from './events';

export {
  getDefaultPolicy, isCalibrationValid, createCacheEntry,
  createInMemoryCalibrationCache,
  type CalibrationCacheEntry, type CalibrationPolicy, type CalibrationCache,
} from './calibration-cache';

export {
  createHistoryService,
  type HistoryService, type HistoryStats, type TrendPoint, type TrendPeriod, type HistorySearchResult,
} from './history';

export {
  initSupabase, getSupabaseClient, resetSupabaseClient, createSupabaseClientForTest,
  type SupabaseConfig,
} from './supabase/client';

export {
  createAuthService,
  type AuthService, type AuthState, type AuthUser, type AuthStatus, type AuthStateChangeHandler,
} from './auth';

export {
  createOfflineQueue, resolveConflict, calculateRetryDelay, shouldRetry, createSyncManager,
  type QueueItem, type QueueStatus, type OfflineQueue, type ConflictResolution,
  type SyncResult, type RetryConfig, type SyncStatus, type SyncManager,
} from './offline';

export {
  createSupabaseSessionRepository,
} from './supabase/session-repository';

export {
  createTelemetryService, getGlobalTelemetry, resetGlobalTelemetry,
  type TelemetryService, type TelemetryEvent, type TelemetryEventType, type TelemetryConfig,
} from './telemetry';

export {
  generateQR, generateQRSvg, generateQRDataUrl, buildQrUrl, buildFocusQrUrl,
  type QRGenerateOptions, type QRResult,
} from './qr/generate';

export {
  parseCampaignParams, parseCampaignFromQueryString, serializeCampaignParams,
  hasCampaign, createCampaignStore,
  type CampaignParams, type CampaignRecord, type CampaignStore, type CampaignStats,
} from './qr/campaign';

export {
  buildShareUrl, createShareHandler, SHARE_PLATFORMS,
  type SharePlatform, type SharePayload, type ShareResult, type ShareConfig,
} from './qr/share';

export {
  parseDeepLink, parseDeepLinkFromCurrentUrl, buildDeepLink, createLandingSession,
  type DeepLink, type LandingSession,
} from './qr/deeplink';

export {
  createReferralEngine,
  type ReferralProfile, type ReferralStats, type ReferralScan, type ReferralEngine,
} from './qr/referral';

export {
  createConsentService, CURRENT_CONSENT_VERSION,
  type ConsentRecord, type ConsentService, type ConsentVersion,
} from './qr/consent';

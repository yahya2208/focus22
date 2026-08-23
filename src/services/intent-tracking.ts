/**
 * M2 — fire-and-forget counter hook (Marketplace Mediator model §11, §17–§20).
 *
 * Owner-approved 2026-08-09 (audit N4/N5/N6 → phase M2). The sender is ENABLED:
 * each event dispatches to the guarded RPC `record_campaign_intent` (SQL in
 * supabase/m2-campaign-intents/01-campaign-intents-apply.sql). Until the owner
 * applies that SQL the RPC is absent and the error is silently swallowed — the
 * contract is fire-and-forget and can never prevent or delay opening WhatsApp.
 *
 * Production contract (enforced by this module and every call site):
 *   - callers invoke `recordIntent` WITHOUT awaiting;
 *   - `recordIntent` never throws (internal try/catch) and always returns void;
 *   - a tracking failure can never block or delay WhatsApp.
 *
 * Identity (non-PII, P7-compliant):
 *   - `visitor_hash` is a crypto-random 32-hex id, persisted in localStorage
 *     under key `focus_vid_v1`. On first visit a fresh ID is generated and
 *     stored. On subsequent visits the stored ID is reused, providing
 *     cross-session persistence for dedup (view counter, campaign intents).
 *   - Clearing browser site data resets the identity (user-controlled).
 *   - Incognito/private browsing creates a fresh ID per session (by design).
 *   - The server validates `^[a-f0-9]{16,64}$`; the value is non-PII.
 *   - device identity = the phone's short `device` id (already non-PII);
 *   - ad identity = `placement`; campaign = `campaign_id` (admin-bound, never
 *     from the QR system).
 */

import { getSupabaseClient } from '../core/supabase/client';

export type IntentKind = 'view' | 'click' | 'whatsapp_intent' | 'whatsapp_handoff_started';

export type IntentCtaType = 'buy' | 'exchange' | 'inquiry' | 'ad_click';

export interface IntentEvent {
  kind: IntentKind;
  /** Required for click ('ad_click'), whatsapp_intent, and whatsapp_handoff_started ('inquiry'); always null for view. */
  ctaType?: IntentCtaType;
  placement?: string;
  deviceId?: string;
  campaignId?: string;
}

let intentSenderEnabled = true;

/**
 * Test seam: allows tests to silence the network path.
 */
export function setIntentSenderEnabled(enabled: boolean): void {
  intentSenderEnabled = enabled;
}

let visitorHash: string | null = null;

const VISITOR_ID_KEY = 'focus_vid_v1';
const VALID_HEX_RE = /^[a-f0-9]{16,64}$/;

function generateVisitorHash(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '00000000000000000000000000000000';
  }
}

function loadStoredVisitorHash(): string | null {
  try {
    const v = localStorage.getItem(VISITOR_ID_KEY);
    return v && VALID_HEX_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function persistVisitorHash(id: string): void {
  try {
    localStorage.setItem(VISITOR_ID_KEY, id);
  } catch {
    // storage unavailable — degrade to per-page-load identity
  }
}

/**
 * Non-PII, crypto-random visitor identity. Persisted in localStorage
 * under `focus_vid_v1` for cross-session dedup. Cleared when the user
 * clears site data. The server validates `^[a-f0-9]{16,64}$`.
 */
export function getVisitorHash(): string {
  if (!visitorHash) {
    visitorHash = loadStoredVisitorHash() ?? generateVisitorHash();
    persistVisitorHash(visitorHash);
  }
  return visitorHash;
}

/**
 * Resets the persisted visitor identity. Next call to getVisitorHash()
 * generates a fresh ID. Useful for privacy controls or tests.
 */
export function resetVisitorId(): void {
  try {
    localStorage.removeItem(VISITOR_ID_KEY);
  } catch {
    // ignore
  }
  visitorHash = null;
}

/**
 * Records a visitor intent as fire-and-forget. Never awaited, never throws,
 * always returns void. A rejected RPC can never block the WhatsApp handoff.
 */
export function recordIntent(event: IntentEvent): void {
  if (!intentSenderEnabled) return;
  try {
    void sendIntent(event).catch(() => {});
  } catch {
    // fire-and-forget — WhatsApp continues regardless
  }
}

async function sendIntent(event: IntentEvent): Promise<void> {
  const { error } = await getSupabaseClient().rpc('record_campaign_intent', {
    p_kind: event.kind,
    p_visitor_hash: getVisitorHash(),
    p_cta_type: event.ctaType ?? null,
    p_campaign_id: event.campaignId ?? null,
    p_ad_placement: event.placement ?? null,
    p_device_id: event.deviceId ?? null,
  });
  if (error) throw error;
}

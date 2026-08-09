/**
 * Anonymous Campaign QR Measurement — fire-and-forget funnel sender.
 *
 * Owner-approved execution 2026-08-09 (Anonymous QR Measurement directive).
 * Measures the anonymous campaign funnel: scan -> game_start -> game_complete
 * -> registration, writing NOTHING client-side. All writes go through two
 * guarded server-side RPCs; the table campaign_qr_events lives on the DB side
 * (owner-applied SQL in supabase/qr-measurement/).
 *
 * Production contract (enforced here and at every call site):
 *   - callers invoke `recordScan` / `recordFunnel` WITHOUT awaiting;
 *   - both never throw and always return void;
 *   - a failure can never block the QR route, the game, or registration.
 *
 * Anonymous, P7-compliant:
 *   - the nonce is a crypto-random 128-bit base64url value held in memory ONLY
 *     (never persisted, never sent anywhere but the RPC);
 *   - no user/device identity, no storage/cookie APIs, no table access;
 *   - funnel events are only emitted for a campaign that was actually scanned
 *     in this page load (no invented attribution for organic visitors).
 */

import { getSupabaseClient } from '../core/supabase/client';

export type QrFunnelEventType = 'game_start' | 'game_complete' | 'registration';

const ALLOWED_EVENT_TYPES: readonly QrFunnelEventType[] = ['game_start', 'game_complete', 'registration'];

let senderEnabled = true;

interface ActiveScan {
  campaignId: string;
  nonce: string;
}

let activeScan: ActiveScan | null = null;
let pendingReady: Promise<string | null> | null = null;
let pendingNonce: string | null = null;

/**
 * Test seam: allows tests to silence the network path.
 */
export function setQrMeasurementSenderEnabled(enabled: boolean): void {
  senderEnabled = enabled;
}

/**
 * Test seam: resets the in-memory funnel state between tests.
 */
export function resetQrMeasurementForTests(): void {
  activeScan = null;
  pendingReady = null;
  pendingNonce = null;
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isFunnelEventType(value: string): value is QrFunnelEventType {
  return (ALLOWED_EVENT_TYPES as readonly string[]).includes(value);
}

async function sendScan(shortCode: string, nonce: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient().rpc('record_campaign_qr_scan', {
    p_short_code: shortCode,
    p_nonce: nonce,
  });
  if (error) return null;
  return ((data as { campaign_id?: string } | null)?.campaign_id ?? null);
}

async function sendFunnel(campaignId: string, nonce: string, eventType: QrFunnelEventType): Promise<void> {
  const { error } = await getSupabaseClient().rpc('record_campaign_funnel', {
    p_campaign_id: campaignId,
    p_nonce: nonce,
    p_event_type: eventType,
  });
  if (error) throw error;
}

/**
 * Records a QR scan as fire-and-forget. Generates the in-memory nonce for this
 * funnel and stores the resolved campaign on success. Never awaited, never
 * throws, always returns void.
 */
export function recordScan(shortCode: string): void {
  if (!senderEnabled) return;
  try {
    const nonce = generateNonce();
    pendingNonce = nonce;
    pendingReady = sendScan(shortCode, nonce)
      .then((campaignId) => {
        if (campaignId) activeScan = { campaignId, nonce };
        return campaignId;
      })
      .catch(() => null);
  } catch {
    // fire-and-forget
  }
}

/**
 * The campaign id of the current QR-originated funnel, or null when no scan has
 * resolved (e.g. an organic visit). Call sites pass this (or an empty string)
 * into `recordFunnel` so organic play never becomes a campaign funnel event.
 */
export function getActiveCampaignId(): string | null {
  return activeScan?.campaignId ?? null;
}

/**
 * Records a funnel event (game_start / game_complete / registration) as
 * fire-and-forget. Only a campaign that was actually scanned in this page load
 * can produce funnel events. Never awaited, never throws, always returns void.
 */
export function recordFunnel(campaignId: string, eventType: QrFunnelEventType): void {
  if (!senderEnabled) return;
  if (!isFunnelEventType(eventType)) return;
  if (!campaignId) return;
  try {
    void resolveScanFor(campaignId)
      .then((scan) => {
        if (!scan) return;
        return sendFunnel(scan.campaignId, scan.nonce, eventType).catch(() => {});
      })
      .catch(() => {});
  } catch {
    // fire-and-forget
  }
}

async function resolveScanFor(campaignId: string): Promise<ActiveScan | null> {
  if (activeScan) return activeScan.campaignId === campaignId ? activeScan : null;
  const pending = pendingReady;
  const nonce = pendingNonce;
  if (!pending || !nonce) return null;
  const resolvedCampaign = await pending;
  if (resolvedCampaign !== campaignId) return null;
  return { campaignId, nonce };
}

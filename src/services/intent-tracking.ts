/**
 * M1 — fire-and-forget intent tracking seam (Marketplace Mediator model).
 *
 * M2 counter infrastructure (dedicated server table + guarded RPC) is NOT
 * approved yet, so the sender is DISABLED in M1 and there is no Supabase/RPC
 * call here. This module exists to enforce the production contract (§11):
 *   - callers invoke `recordIntent` WITHOUT awaiting;
 *   - `recordIntent` never throws (internal try/catch) and always returns void;
 *   - a tracking failure can never prevent or delay opening WhatsApp.
 *
 * Call sites MUST wrap `recordIntent` in a try/catch as a defensive second
 * layer, so even a future regression in this module can never block WhatsApp.
 */

export type IntentCtaType = 'buy' | 'exchange' | 'installment' | 'inquiry' | 'ad_click';

export interface IntentEvent {
  kind: 'ad_click' | 'whatsapp_intent';
  ctaType: IntentCtaType;
  placement?: string;
  deviceId?: string;
  campaignId?: string;
}

let intentSenderEnabled = false;

/**
 * Test seam: enables the (future) M2 sender. M1 leaves it disabled.
 */
export function setIntentSenderEnabled(enabled: boolean): void {
  intentSenderEnabled = enabled;
}

/**
 * Records a visitor intent as fire-and-forget. Never awaited, never throws.
 * When M2 ships, this dispatches to the guarded counter RPC; the return is
 * deliberately not used so a rejected RPC can never block the WhatsApp handoff.
 */
export function recordIntent(event: IntentEvent): void {
  if (!intentSenderEnabled) return;
  try {
    void sendIntent(event).catch(() => {});
  } catch {
    // fire-and-forget — WhatsApp continues regardless
  }
}

async function sendIntent(_event: IntentEvent): Promise<void> {
  // Reserved for M2: guarded RPC into the new counters table. No DB in M1.
  return;
}

/**
 * WhatsApp destination adapter (PHASE 2 STEP 5).
 *
 * A `destination_type='whatsapp'` ad opens a WhatsApp chat to the campaign
 * number from the Phase-1 destination payload (`destination.whatsapp.number`)
 * with an optional preset message (`destination.whatsapp.message`).
 *
 * STRICT SEPARATION (approved contract): the payload is read ONLY from
 * `destination.whatsapp` — never from the legacy `ads.link` / `ads.device_id`.
 * That legacy exception belongs to the phone adapter alone.
 *
 * Contract:
 *   - `number` is REQUIRED. Normalized via `formatPhone()` (whatsapp-service):
 *     a valid number is 8–15 digits after normalization (E.164 bound).
 *     Anything else ⇒ `isValid=false` ⇒ NON-INTERACTIVE (never-dead-target).
 *   - `message` is OPTIONAL (any string, trimmed; capped at 1000 chars to
 *     bound the wa.me URL length).
 *   - `openDetails` / `callToAction` are the SAME surface (the chat) — the
 *     whole banner converts to WhatsApp, mirroring the external adapter's
 *     symmetric target semantics. Both record `ad_click` then
 *     `whatsapp_handoff_started` (fire-and-forget, placement-only, no device)
 *     and open the chat through the injected opener.
 *
 * The adapter executes NO side effects at creation time; the chat opener and
 * navigation are injected functions invoked only from within the operations.
 */

import type { AdImage, AdPlacement } from '../ads-service';
import { formatPhone } from '../whatsapp-service';
import { recordIntent } from '../intent-tracking';

export interface WhatsAppDestinationAdapter {
  readonly type: 'whatsapp';
  /** The formatted number (formatPhone output). '' when invalid. */
  readonly number: string;
  /** The trimmed preset message ('' when absent). */
  readonly message: string;
  /**
   * True only when the number is valid. The never-dead-target gate:
   * false → all four operations are no-ops.
   */
  readonly isValid: boolean;
  canOpenDetails(image?: AdImage): boolean;
  openDetails(image?: AdImage): void;
  canCallToAction(image?: AdImage): boolean;
  callToAction(image?: AdImage): void;
}

export interface WhatsAppDestinationAdapterDeps {
  placement: AdPlacement;
  /** The raw number from destination.whatsapp.number ('' = absent/invalid). */
  number: string;
  /** The raw message from destination.whatsapp.message ('' = absent). */
  message: string;
  /** Opens a WhatsApp chat to the formatted number (popup + fallback). */
  openChat: (phone: string, message: string) => void;
}

export const WHATSAPP_NUMBER_MIN_DIGITS = 8;
export const WHATSAPP_NUMBER_MAX_DIGITS = 15;
export const WHATSAPP_MESSAGE_MAX_LENGTH = 1000;

/**
 * A valid WhatsApp destination number: after formatPhone() normalization the
 * result is 8–15 digits (E.164 bound). Rejects empty/whitespace, non-numeric
 * payloads and out-of-range numbers.
 */
export function isValidWhatsAppNumber(value: string): boolean {
  const digits = formatPhone(value);
  return digits.length >= WHATSAPP_NUMBER_MIN_DIGITS && digits.length <= WHATSAPP_NUMBER_MAX_DIGITS && /^\d+$/.test(digits);
}

export function createWhatsAppDestinationAdapter(deps: WhatsAppDestinationAdapterDeps): WhatsAppDestinationAdapter {
  const number = deps.number.trim();
  const isValid = isValidWhatsAppNumber(number);
  const formattedNumber = isValid ? formatPhone(number) : '';
  const message = deps.message.trim().slice(0, WHATSAPP_MESSAGE_MAX_LENGTH);
  const { placement, openChat } = deps;

  const canOpenDetails = (_image?: AdImage): boolean => isValid;
  const canCallToAction = (_image?: AdImage): boolean => isValid;

  const openChatWithTracking = (_image?: AdImage): void => {
    if (!isValid) return;
    try {
      recordIntent({ kind: 'click', ctaType: 'ad_click', placement });
    } catch {
      // fire-and-forget: tracking must never block the handoff
    }
    try {
      recordIntent({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement });
    } catch {
      // fire-and-forget: tracking must never block the handoff
    }
    openChat(formattedNumber, message);
  };

  return {
    type: 'whatsapp',
    number: formattedNumber,
    message,
    isValid,
    canOpenDetails,
    openDetails: openChatWithTracking,
    canCallToAction,
    callToAction: openChatWithTracking,
  };
}

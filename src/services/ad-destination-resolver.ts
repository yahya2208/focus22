/**
 * Generic ads destination resolver (PHASE 2 STEP 5).
 *
 * `resolveDestination(ad)` picks the destination adapter for an ad config.
 *
 * Active paths:
 *   AdConfig → resolveDestination(ad) → PhoneDestinationAdapter     (legacy)
 *   AdConfig → resolveDestination(ad) → ExternalDestinationAdapter  (Step 4)
 *   AdConfig → resolveDestination(ad) → WhatsAppDestinationAdapter  (Step 5)
 *   AdConfig → resolveDestination(ad) → InternalDestinationAdapter  (Step 6)
 *
 * - `destination_type` missing/undefined is treated as `'phone'`.
 * - `destination = {}` with the existing phone ads keeps using the legacy
 *   `link`/`device_id` deep link — no re-save required.
 * - STRICT SEPARATION (approved): an external/whatsapp/internal ad reads its
 *   payload ONLY from `destination.external` / `destination.whatsapp` /
 *   `destination.internal` — never from the legacy `link`/`device_id`. The
 *   phone adapter is the ONLY intentional legacy-compatibility exception.
 *
 * The resolver performs NO side effects: it only selects/builds the adapter.
 * Navigation and WhatsApp are injected via `deps` and invoked only from within
 * the adapter's four operations.
 */

import type { AdConfig, AdPlacement } from './ads-service';
import { createPhoneDestinationAdapter, type PhoneDestinationAdapter } from './ad-adapters/phone';
import { createExternalDestinationAdapter, type ExternalDestinationAdapter } from './ad-adapters/external';
import { createWhatsAppDestinationAdapter, type WhatsAppDestinationAdapter } from './ad-adapters/whatsapp';
import { createInternalDestinationAdapter, type InternalDestinationAdapter } from './ad-adapters/internal';
import type { ScreenName } from '../store/navigation';

export type ResolvedDestination =
  | PhoneDestinationAdapter
  | ExternalDestinationAdapter
  | WhatsAppDestinationAdapter
  | InternalDestinationAdapter;

export interface DestinationResolverDeps {
  placement: AdPlacement;
  /** Navigates to the device details page (phone-details). */
  navigateToDetails: (deviceId: string) => void;
  /** Sends the WhatsApp handoff message. */
  whatsappSend: (message: string, context: { action: 'inquiry'; deviceId: string }) => void;
  /** Opens the external URL in a new tab (noopener, noreferrer). */
  openInNewTab: (url: string) => void;
  /** Opens a WhatsApp chat to the formatted number (popup + fallback). */
  openChat: (phone: string, message: string) => void;
  /** In-app navigation to an internal screen with route params. */
  navigateTo: (screen: ScreenName, params?: Record<string, string>) => void;
}

/** Reads the external URL from the Phase-1 destination payload (external.url). */
function readExternalUrl(ad: AdConfig): string {
  const dest = (ad.destination ?? {}) as { external?: { url?: unknown } };
  const url = dest.external?.url;
  return typeof url === 'string' ? url : '';
}

/**
 * Reads the WhatsApp payload from the Phase-1 destination payload
 * (whatsapp.number / whatsapp.message). Strict: non-string values are treated
 * as absent (no coercion) so a malformed payload is never a valid target.
 */
function readWhatsAppPayload(ad: AdConfig): { number: string; message: string } {
  const dest = (ad.destination ?? {}) as { whatsapp?: { number?: unknown; message?: unknown } };
  const wa = dest.whatsapp;
  return {
    number: wa && typeof wa.number === 'string' ? wa.number : '',
    message: wa && typeof wa.message === 'string' ? wa.message : '',
  };
}

/**
 * Reads the internal payload from the Phase-1 destination payload
 * (internal.screen / internal.params). Strict: a non-string screen becomes ''
 * and params pass through untouched (undefined when absent) so the adapter
 * validates shape/values itself — no coercion, no expansion.
 */
function readInternalPayload(ad: AdConfig): { screen: string; params: unknown } {
  const dest = (ad.destination ?? {}) as { internal?: { screen?: unknown; params?: unknown } };
  const internal = dest.internal;
  return {
    screen: internal && typeof internal.screen === 'string' ? internal.screen : '',
    params: internal && typeof internal === 'object' && 'params' in internal ? internal.params : undefined,
  };
}

export function resolveDestination(ad: AdConfig, deps: DestinationResolverDeps): ResolvedDestination {
  const type = ad.destinationType ?? 'phone';
  switch (type) {
    case 'external':
      return createExternalDestinationAdapter({
        url: readExternalUrl(ad),
        openInNewTab: deps.openInNewTab,
      });
    case 'whatsapp': {
      const payload = readWhatsAppPayload(ad);
      return createWhatsAppDestinationAdapter({
        placement: deps.placement,
        number: payload.number,
        message: payload.message,
        openChat: deps.openChat,
      });
    }
    case 'internal': {
      const payload = readInternalPayload(ad);
      return createInternalDestinationAdapter({
        placement: deps.placement,
        screen: payload.screen,
        params: payload.params,
        navigateTo: deps.navigateTo,
      });
    }
    case 'phone':
    default:
      // destination_type missing/undefined → 'phone' (legacy behavior).
      return createPhoneDestinationAdapter({
        placement: deps.placement,
        link: ad.link,
        images: ad.images,
        imageUrl: ad.image,
        navigateToDetails: deps.navigateToDetails,
        whatsappSend: deps.whatsappSend,
      });
  }
}

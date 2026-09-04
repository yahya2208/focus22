/**
 * Internal destination adapter (PHASE 2 STEP 6).
 *
 * A `destination_type='internal'` ad navigates to an INTERNAL app screen
 * (`destination.internal.screen`) with optional route params
 * (`destination.internal.params`) — in-app navigation only (never WhatsApp,
 * never a new tab, never an external URL).
 *
 * STRICT SEPARATION (approved contract): the payload is read ONLY from
 * `destination.internal` — never from the legacy `ads.link` / `ads.device_id`.
 * That legacy exception belongs to the phone adapter alone.
 *
 * Contract:
 *   - `screen` is REQUIRED and must be in the FIXED allowlist below
 *     (phone-details / showroom / phone-services / repair-home). The allowlist
 *     is NOT auto-expanded to the full ScreenName set.
 *   - `params` is OPTIONAL. When present it must be a PLAIN object whose values
 *     are strings ONLY — no coercion, no arrays, no nested objects. Any other
 *     shape ⇒ `isValid=false` ⇒ NON-INTERACTIVE (never-dead-target).
 *   - `phone-details` REQUIRES `params.device` AND that device must resolve in
 *     the current inventory (resolveAdDevice). A missing/stale device is
 *     NON-INTERACTIVE — no fallback to `ad.link` / `ad.deviceId`.
 *   - `openDetails` / `callToAction` route to the SAME internal target (the
 *     whole banner converts), mirroring the external/whatsapp symmetric target
 *     semantics. Both record `ad_click` (fire-and-forget, placement-only;
 *     `deviceId` is passed ONLY when the target is phone-details) then navigate.
 *
 * The adapter executes NO side effects at creation time; navigation is an
 * injected function invoked only from within the operations.
 */

import type { AdImage, AdPlacement } from '../ads-service';
import { buildAdPhoneLink } from '../ads-service';
import { resolveAdDevice } from '../ad-device-resolver';
import { recordIntent } from '../intent-tracking';
import { track } from '../../core/telemetry';
import type { ScreenName } from '../../store/navigation';

/**
 * The FIXED allowlist of internal screens an ad may target. Deliberately a
 * literal, NOT derived from ALL_SCREEN_NAMES: it must not auto-expand when the
 * ScreenName set grows (an ad can only ever navigate to these four screens).
 */
export const INTERNAL_AD_ALLOWLIST = ['phone-details', 'showroom', 'phone-services', 'repair-home'] as const;

export type InternalScreen = (typeof INTERNAL_AD_ALLOWLIST)[number];

export interface InternalDestinationAdapter {
  readonly type: 'internal';
  /** The validated allowlisted screen. null when not allowlisted. */
  readonly screen: InternalScreen | null;
  /** The validated string-only params ({} when absent). */
  readonly params: Record<string, string>;
  /**
   * True only when the screen is allowlisted, params are plain-string-only, and
   * (for phone-details) the device resolves. The never-dead-target gate:
   * false → all four operations are no-ops.
   */
  readonly isValid: boolean;
  canOpenDetails(image?: AdImage): boolean;
  openDetails(image?: AdImage): void;
  canCallToAction(image?: AdImage): boolean;
  callToAction(image?: AdImage): void;
}

export interface InternalDestinationAdapterDeps {
  placement: AdPlacement;
  /** The raw screen from destination.internal.screen ('' = absent/invalid). */
  screen: string;
  /**
   * The raw params from destination.internal.params (undefined = absent).
   * Validated at creation: must be a plain object of strings or the adapter is
   * non-interactive (no coercion, no expansion).
   */
  params: unknown;
  /** In-app navigation to an allowlisted screen with string params. */
  navigateTo: (screen: ScreenName, params?: Record<string, string>) => void;
}

/**
 * A plain object whose values are ALL strings. Rejects arrays, null, non-object
 * values and nested objects — no coercion is ever applied.
 */
function isPlainStringParams(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

export function createInternalDestinationAdapter(deps: InternalDestinationAdapterDeps): InternalDestinationAdapter {
  const rawScreen = deps.screen.trim();
  const screen = (INTERNAL_AD_ALLOWLIST as readonly string[]).includes(rawScreen) ? (rawScreen as InternalScreen) : null;

  const params = deps.params === undefined ? {} : isPlainStringParams(deps.params) ? deps.params : null;
  const paramsValid = params !== null;

  // phone-details REQUIRES params.device to resolve in the current inventory —
  // same resolvability contract as the phone adapter, never a dead target.
  let deviceId: string | null = null;
  if (screen === 'phone-details' && paramsValid) {
    const device = (params as Record<string, string>).device?.trim() ?? '';
    if (device) {
      const resolved = resolveAdDevice(buildAdPhoneLink(device));
      if (resolved) deviceId = resolved.id;
    }
  }

  const isValid = screen !== null && paramsValid && (screen !== 'phone-details' || deviceId !== null);
  const { placement, navigateTo } = deps;

  const canOpenDetails = (_image?: AdImage): boolean => isValid;
  const canCallToAction = (_image?: AdImage): boolean => isValid;

  // Both operations route to the SAME internal target — the whole banner
  // converts to in-app navigation (mirroring the external/whatsapp adapters).
  const navigateWithTracking = (_image?: AdImage): void => {
    if (!isValid || screen === null || params === null) return;
    void track({ event: 'ad_click', entityType: 'ad', properties: { position: placement } });
    try {
      recordIntent({
        kind: 'click',
        ctaType: 'ad_click',
        placement,
        deviceId: screen === 'phone-details' && deviceId !== null ? deviceId : undefined,
      });
    } catch {
      // fire-and-forget: tracking must never block navigation
    }
    navigateTo(screen, params);
  };

  return {
    type: 'internal',
    screen,
    params: isValid && params !== null ? params : {},
    isValid,
    canOpenDetails,
    openDetails: navigateWithTracking,
    canCallToAction,
    callToAction: navigateWithTracking,
  };
}

/**
 * Phone destination adapter (PHASE 2 STEP 2).
 *
 * Behavior-preserving extraction of the phone-specific interaction logic that
 * previously lived inside AdContactBanner. This is a near-verbatim move, NOT a
 * redesign: same inputs → same device resolution → same navigation → same
 * WhatsApp handoff → same tracking → same non-interactive fallback.
 *
 * Contract (the eventual destination surface):
 *   canOpenDetails / openDetails   — the MAIN IMAGE surface (details page, never
 *                                    WhatsApp).
 *   canCallToAction / callToAction — the CTA surface (corner button / slide
 *                                    action → WhatsApp handoff, never a new
 *                                    tab, never an image viewer).
 *
 * A phone-format link whose device is NOT resolvable in the current inventory
 * is non-interactive (never a dead target, never a handoff attempt).
 *
 * The adapter executes NO side effects at creation time; navigation and
 * WhatsApp are injected functions invoked only from within the four
 * operations (keeps the adapter render-safe and deterministic).
 */

import type { AdImage, AdPlacement } from '../ads-service';
import { buildAdPhoneLink } from '../ads-service';
import { resolveAdDevice, extractAdDeviceId } from '../ad-device-resolver';
import { recordIntent } from '../intent-tracking';
import { track } from '../../core/telemetry';
import { buildAdClickMessage } from '../whatsapp-service';
import type { InventoryRecord } from '../inventory-service';

export interface PhoneDestinationAdapter {
  readonly type: 'phone';
  /** The ad-level device id (''-free: null when the link is not a phone link). */
  readonly deviceId: string | null;
  /** 00021 — gallery slides carry their own device ids (carousel interaction). */
  readonly hasSlideDevices: boolean;
  /** Resolvable phone link → interactive banner. */
  readonly isContact: boolean;
  /** Phone-format link with a device NOT in the current inventory → non-interactive. */
  readonly isUnresolvedPhoneLink: boolean;
  /**
   * Details availability for a slide (or the ad-level device when no slide is
   * given). Gated by the same resolvability contract as the CTA — never a dead
   * target.
   */
  canOpenDetails(image?: AdImage): boolean;
  /** Opens the device details page (phone-details). Never the WhatsApp handoff. */
  openDetails(image?: AdImage): void;
  /**
   * CTA availability. True only when the slide (or ad-level) device resolves in
   * the current inventory.
   */
  canCallToAction(image?: AdImage): boolean;
  /**
   * CTA: records `ad_click` + `whatsapp_handoff_started` (fire-and-forget) and
   * sends the ad-click message. When `image` is omitted the ad-level device and
   * the ad cover URL are used (single-frame corner CTA).
   */
  callToAction(image?: AdImage): void;
}

export interface PhoneDestinationAdapterDeps {
  placement: AdPlacement;
  /** The ad's `link` (legacy phone deep link #/phone-details?device=<id>). */
  link: string;
  /** The ad's gallery (per-slide deviceId drives the carousel interaction). */
  images: AdImage[];
  /** The ad-level cover URL — imageUrl fallback for the single-frame CTA. */
  imageUrl: string;
  /** Navigates to the device details page. */
  navigateToDetails: (deviceId: string) => void;
  /** Sends the WhatsApp handoff message. */
  whatsappSend: (message: string, context: { action: 'inquiry'; deviceId: string }) => void;
}

export function createPhoneDestinationAdapter(deps: PhoneDestinationAdapterDeps): PhoneDestinationAdapter {
  const { placement, link, images, imageUrl, navigateToDetails, whatsappSend } = deps;

  const device: InventoryRecord | null = link ? resolveAdDevice(link) : null;
  const deviceId = device?.id ?? null;
  const hasPhoneLink = Boolean(link && extractAdDeviceId(link) !== null);

  // 00021 — per-slide devices: when the gallery slides carry their own device
  // the interaction moves INTO the carousel (each slide drives its own handoff)
  // instead of the single whole-banner target / AdSpot anchor below. The
  // ad-level device (the phone the whole ad links to) is the fallback so a
  // phone-linked ad stays interactive even when a slide carries no device_id.
  const hasSlideDevices = Boolean(images.length > 1 && images.some((img) => img.deviceId));

  const isContact = hasPhoneLink && Boolean(device);
  const isUnresolvedPhoneLink = hasPhoneLink && !device;

  const resolveSlideDevice = (slideDeviceId: string): InventoryRecord | null =>
    resolveAdDevice(buildAdPhoneLink(slideDeviceId));

  // The device that drives a slide's interactions: the slide's own device_id
  // when present, else the ad-level device. No slide given → the ad-level device.
  const slideDeviceId = (image?: AdImage): string | null => image?.deviceId || device?.id || null;

  const canOpenDetails = (image?: AdImage): boolean => {
    // Same resolvability contract as the CTA: never a dead target.
    const id = slideDeviceId(image);
    return Boolean(id && resolveSlideDevice(id));
  };

  // FOCUS-AD-DETAILS — the main image is a details surface (never the WhatsApp
  // handoff). The CTA stays as the corner button handled by callToAction.
  const openDetails = (image?: AdImage): void => {
    const id = slideDeviceId(image);
    if (!id) return;
    void track({ event: 'ad_click', entityType: 'ad', properties: { position: placement } });
    navigateToDetails(id);
  };

  const canCallToAction = (image?: AdImage): boolean => {
    const id = slideDeviceId(image);
    return Boolean(id && resolveSlideDevice(id));
  };

  const callToAction = (image?: AdImage): void => {
    const id = slideDeviceId(image);
    if (!id) return;
    const dev = resolveSlideDevice(id);
    if (!dev) return;
    void track({ event: 'ad_click', entityType: 'ad', properties: { position: placement } });
    try {
      recordIntent({ kind: 'click', ctaType: 'ad_click', placement, deviceId: dev.id });
    } catch {
      // fire-and-forget: tracking must never block the handoff
    }
    try {
      recordIntent({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement, deviceId: dev.id });
    } catch {
      // fire-and-forget: tracking must never block the handoff
    }
    whatsappSend(buildAdClickMessage(dev, { placement, imageUrl: image ? image.url : imageUrl }), {
      action: 'inquiry',
      deviceId: dev.id,
    });
  };

  return {
    type: 'phone',
    deviceId,
    hasSlideDevices,
    isContact,
    isUnresolvedPhoneLink,
    canOpenDetails,
    openDetails,
    canCallToAction,
    callToAction,
  };
}

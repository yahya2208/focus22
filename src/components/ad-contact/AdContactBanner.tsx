import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureAdsLoaded,
  getAd,
  subscribeAds,
  buildAdPhoneLink,
  type AdImage,
  type AdPlacement,
} from '../../services/ads-service';
import { AdSpot } from '../ads/AdSpot';
import { AdBanner, type AdBannerStatus } from '../ads/AdBanner';
import { resolveAdDevice, extractAdDeviceId } from '../../services/ad-device-resolver';
import { recordIntent } from '../../services/intent-tracking';
import { buildAdClickMessage } from '../../services/whatsapp-service';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { useNavigate } from '../../store/navigation';
import type { InventoryRecord } from '../../services/inventory-service';

interface AdContactBannerProps {
  placement: AdPlacement;
}

interface ResolvedAd {
  image: string;
  link: string;
  alt: string;
  images: AdImage[];
}

function resolve(placement: AdPlacement): ResolvedAd | null {
  const ad = getAd(placement);
  if (!ad || !ad.enabled || !ad.image) return null;
  return { image: ad.image, link: ad.link, alt: ad.alt, images: ad.images };
}

/**
 * Ad Contact Banner — device-linked ads (Marketplace Mediator model §10, §17):
 * When the configured ad links to a phone (`#/phone-details?device=<id>`), the
 * MAIN IMAGE is a details surface: tapping it opens that device's details page
 * (FOCUS-AD-DETAILS) — it NEVER starts a WhatsApp handoff. The WhatsApp handoff
 * lives exclusively on a small corner "تواصل" button. The corner click records
 * `ad_click` then `whatsapp_handoff_started` (fire-and-forget), builds the
 * ad-click message with the ad's image URL and placement, and sends via
 * `useWhatsApp().send`. It NEVER opens a new tab, and never opens an image
 * viewer/zoom. Any other ad link keeps its normal anchor behaviour.
 *
 * M2 — View counting (§17): a view is recorded when the banner stays inside
 * the viewport at ≥ 0.6 visibility for ≥ 1 s (IntersectionObserver). NOT
 * counted: hidden render, preload, DOM creation, off-screen mount. Click and
 * view tracking are fire-and-forget and can never block the handoff.
 *
 * BATCH 4A fallback: a phone-format link whose device is NOT resolvable in
 * the current inventory renders as a NON-INTERACTIVE banner (never a dead
 * <a>, never a handoff attempt). The repair placement is never part of this
 * path — repair requests originate only from the repair flow.
 */
export const AdContactBanner = memo(function AdContactBanner({ placement }: AdContactBannerProps) {
  const [ad, setAd] = useState<ResolvedAd | null>(() => resolve(placement));
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const whatsapp = useWhatsApp();
  const navigate = useNavigate();

  const device: InventoryRecord | null = ad?.link ? resolveAdDevice(ad.link) : null;
  const deviceId = device?.id;
  const hasPhoneLink = Boolean(ad?.link && extractAdDeviceId(ad.link) !== null);

  // 00021 — per-slide devices: when the gallery slides carry their own device
  // the interaction moves INTO the carousel (each slide drives its own handoff)
  // instead of the single whole-banner target / AdSpot anchor below. The
  // ad-level device (the phone the whole ad links to) is the fallback so a
  // phone-linked ad stays interactive even when a slide carries no device_id.
  const hasSlideDevices = Boolean(ad && ad.images.length > 1 && ad.images.some((img) => img.deviceId));

  const resolveSlideDevice = (slideDeviceId: string): InventoryRecord | null =>
    resolveAdDevice(buildAdPhoneLink(slideDeviceId));

  // FOCUS-AD-DETAILS — the device that drives a slide's interactions:
  // the slide's own device_id when present, else the ad-level device.
  const slideDeviceId = (image: AdImage): string | null => image.deviceId || device?.id || null;

  const activateSlide = useCallback(
    (image: AdImage) => {
      const id = slideDeviceId(image);
      if (!id) return;
      const dev = resolveSlideDevice(id);
      if (!dev) return;
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
      whatsapp.send(buildAdClickMessage(dev, { placement, imageUrl: image.url }), {
        action: 'inquiry',
        deviceId: dev.id,
      });
    },
    [placement, whatsapp, device],
  );

  const canSlideAction = useCallback(
    (image: AdImage) => {
      // Same resolvability contract as the ad-level target: never a dead click.
      const id = slideDeviceId(image);
      return Boolean(id && resolveSlideDevice(id));
    },
    [device],
  );

  // FOCUS-AD-DETAILS — tapping the carousel's main image opens the device's
  // details page (never the WhatsApp handoff). The CTA stays as the corner
  // button handled by activateSlide above.
  const openSlideDetails = useCallback(
    (image: AdImage) => {
      const id = slideDeviceId(image);
      if (!id) return;
      navigate.push('phone-details', { device: id });
    },
    [navigate, device],
  );

  // FOCUS-AD-DETAILS — every actionable slide of a phone-linked ad is a valid
  // details surface (slide device_id or ad-level device), gated by the same
  // resolvability contract as the CTA: never a dead target. The carousel gates
  // its full-frame overlay on this predicate, so it can never become a
  // WhatsApp surface.
  const canSlideDetails = useCallback(
    (image: AdImage) => {
      const id = slideDeviceId(image);
      return Boolean(id && resolveSlideDevice(id));
    },
    [device],
  );

  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      setAd(resolve(placement));
      setFailed(false);
    };
    ensureAdsLoaded().then(update).catch(() => {});
    const unsubscribe = subscribeAds(update);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [placement]);

  const handleStateChange = useCallback((status: AdBannerStatus) => {
    if (status === 'failed') setFailed(true);
  }, []);

  useEffect(() => {
    if (!ad || viewedRef.current) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const node = containerRef.current;
    if (!node) return;

    let visible = false;
    let timer: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            if (visible) continue;
            visible = true;
            timer = window.setTimeout(() => {
              if (viewedRef.current) return;
              viewedRef.current = true;
              observer.disconnect();
              try {
                recordIntent({ kind: 'view', placement, deviceId });
              } catch {
                // fire-and-forget: tracking must never block anything
              }
            }, 1000);
          } else {
            visible = false;
            if (timer !== undefined) {
              window.clearTimeout(timer);
              timer = undefined;
            }
          }
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ad, placement, deviceId]);

  if (!ad || failed) return null;

  // A phone-linked ad is a single-target click: the banner is rendered
  // non-interactively (no focusable anchor underneath) and the overlay button
  // is the ONLY focusable/actionable target. Clicking navigates to the phone's
  // details page carrying `deviceId` — never to WhatsApp directly, never to an
  // image viewer. Non-phone ads keep their normal AdSpot anchor behaviour.
  //
  // BATCH 4A fallback: a phone-format link whose device is NOT resolvable in
  // the current inventory renders as a NON-INTERACTIVE banner (never a dead
  // <a>, never a navigation attempt). Resolvable → interactive overlay button.
  const isContact = hasPhoneLink && Boolean(device);
  const isUnresolvedPhoneLink = hasPhoneLink && !device;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {hasSlideDevices || isContact || isUnresolvedPhoneLink ? (
        <div role="banner" aria-label={ad.alt || placement}>
          <AdBanner
            image={ad.image}
            images={ad.images}
            alt={ad.alt || placement}
            onStateChange={handleStateChange}
            onSlideAction={activateSlide}
            canSlideAction={canSlideAction}
            onSlideDetails={openSlideDetails}
            canSlideDetails={canSlideDetails}
          />
        </div>
      ) : (
        <AdSpot placement={placement} />
      )}
      {/* FOCUS-AD-DETAILS — single-frame phone-linked ads (no carousel) get the
          two surfaces here: the full-frame overlay opens the device's details
          page, the small corner button is the ONLY WhatsApp surface. Multi-frame
          ads let the carousel own the interaction, so NO full-frame overlay ever
          covers the slides/thumbnails. The main image NEVER converts directly. */}
      {ad.images.length <= 1 && isContact ? (
        <>
          <button
            type="button"
            data-testid="ad-contact-details"
            aria-label={`${ad.alt || placement} — عرض التفاصيل`}
            onClick={() => navigate.push('phone-details', { device: device!.id })}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              zIndex: 1,
            }}
          />
          <button
            type="button"
            data-testid="ad-contact-cta"
            aria-label={`${ad.alt || placement} — فتح المحادثة`}
            onClick={() => {
              try {
                recordIntent({ kind: 'click', ctaType: 'ad_click', placement, deviceId: device!.id });
              } catch {
                // fire-and-forget: tracking must never block the handoff
              }
              try {
                recordIntent({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement, deviceId: device!.id });
              } catch {
                // fire-and-forget: tracking must never block the handoff
              }
              whatsapp.send(buildAdClickMessage(device!, { placement, imageUrl: ad.image }), {
                action: 'inquiry',
                deviceId: device!.id,
              });
            }}
            style={{
              position: 'absolute',
              insetInlineEnd: '0.6rem',
              bottom: '0.6rem',
              zIndex: 3,
              padding: '0.45rem 0.85rem',
              borderRadius: '999px',
              border: 'none',
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            تواصل
          </button>
        </>
      ) : null}
    </div>
  );
});

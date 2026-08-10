import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ensureAdsLoaded, getAd, subscribeAds, type AdPlacement } from '../../services/ads-service';
import { AdSpot } from '../ads/AdSpot';
import { AdBanner, type AdBannerStatus } from '../ads/AdBanner';
import { resolveAdDevice, extractAdDeviceId } from '../../services/ad-device-resolver';
import { recordIntent } from '../../services/intent-tracking';
import { useAppDispatch } from '../../store/navigation';
import type { InventoryRecord } from '../../services/inventory-service';

interface AdContactBannerProps {
  placement: AdPlacement;
}

interface ResolvedAd {
  image: string;
  link: string;
  alt: string;
}

function resolve(placement: AdPlacement): ResolvedAd | null {
  const ad = getAd(placement);
  if (!ad || !ad.enabled || !ad.image) return null;
  return { image: ad.image, link: ad.link, alt: ad.alt };
}

/**
 * Ad Contact Banner — device-linked ads (Marketplace Mediator model §10, §17):
 * When the configured ad links to a phone (`#/phone-details?device=<id>`), the
 * whole banner becomes a single-target click: click → fire-and-forget intent →
 * navigate to the phone's details page (`phone-details?device=<id>`). The user
 * then chooses a WhatsApp action (شراء/استبدال/تقسيط/استفسار) or Back/Cancel
 * on the details page. Any other ad link keeps its normal anchor behaviour.
 *
 * M2 — View counting (§17): a view is recorded when the banner stays inside
 * the viewport at ≥ 0.6 visibility for ≥ 1 s (IntersectionObserver). NOT
 * counted: hidden render, preload, DOM creation, off-screen mount. Click and
 * view tracking are fire-and-forget and can never block navigation.
 *
 * BATCH 2 — WhatsApp is ONLY initiated from the phone details page (with
 * `whatsapp_intent` tied to `deviceId`); the ad itself never opens WhatsApp
 * and never opens an image viewer/zoom.
 */
export const AdContactBanner = memo(function AdContactBanner({ placement }: AdContactBannerProps) {
  const [ad, setAd] = useState<ResolvedAd | null>(() => resolve(placement));
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const dispatch = useAppDispatch();

  const device: InventoryRecord | null = ad?.link ? resolveAdDevice(ad.link) : null;
  const deviceId = device?.id;
  const hasPhoneLink = Boolean(ad?.link && extractAdDeviceId(ad.link) !== null);

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
      {isContact || isUnresolvedPhoneLink ? (
        <div role="banner" aria-label={ad.alt || placement}>
          <AdBanner image={ad.image} alt={ad.alt || placement} onStateChange={handleStateChange} />
        </div>
      ) : (
        <AdSpot placement={placement} />
      )}
      {isContact ? (
        <button
          type="button"
          aria-label={ad.alt || placement}
          onClick={() => {
            try {
              recordIntent({ kind: 'click', ctaType: 'ad_click', placement, deviceId: device!.id });
            } catch {
              // fire-and-forget: tracking must never block navigation
            }
            dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: device!.id } });
          }}
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
      ) : null}
    </div>
  );
});

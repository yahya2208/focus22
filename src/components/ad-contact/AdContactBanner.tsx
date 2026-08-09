import { memo, useEffect, useRef, useState } from 'react';
import { ensureAdsLoaded, getAd, subscribeAds, type AdPlacement } from '../../services/ads-service';
import { AdSpot } from '../ads/AdSpot';
import { resolveAdDevice } from '../../services/ad-device-resolver';
import { openPhoneAdWhatsApp } from '../../services/whatsapp-service';
import { recordIntent } from '../../services/intent-tracking';
import type { InventoryRecord } from '../../services/inventory-service';

interface AdContactBannerProps {
  placement: AdPlacement;
}

interface ResolvedAd {
  link: string;
  alt: string;
}

function resolve(placement: AdPlacement): ResolvedAd | null {
  const ad = getAd(placement);
  if (!ad || !ad.enabled || !ad.image) return null;
  return { link: ad.link, alt: ad.alt };
}

/**
 * M1/M2 — Ad Contact Banner (Marketplace Mediator model §10, §17):
 * Deploys the standard AdSpot, but when the configured ad links to a phone
 * (`#/phone-details?device=<id>`), the whole banner becomes a contact CTA:
 * click → fire-and-forget intent → WhatsApp to the owner with the phone data.
 * Any other ad link keeps its normal anchor behaviour.
 *
 * M2 — View counting (§17): a view is recorded when the banner stays inside
 * the viewport at ≥ 0.6 visibility for ≥ 1 s (IntersectionObserver). NOT
 * counted: hidden render, preload, DOM creation, off-screen mount. Click and
 * view tracking are fire-and-forget and can never block or delay WhatsApp.
 */
export const AdContactBanner = memo(function AdContactBanner({ placement }: AdContactBannerProps) {
  const [ad, setAd] = useState<ResolvedAd | null>(() => resolve(placement));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);

  const device: InventoryRecord | null = ad?.link ? resolveAdDevice(ad.link) : null;
  const deviceId = device?.id;

  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      setAd(resolve(placement));
    };
    ensureAdsLoaded().then(update).catch(() => {});
    const unsubscribe = subscribeAds(update);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [placement]);

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

  if (!ad) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <AdSpot placement={placement} />
      {device ? (
        <button
          type="button"
          aria-label={ad.alt || placement}
          onClick={() => {
            try {
              recordIntent({ kind: 'click', ctaType: 'ad_click', placement, deviceId: device.id });
            } catch {
              // fire-and-forget: tracking must never block WhatsApp
            }
            openPhoneAdWhatsApp(device);
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

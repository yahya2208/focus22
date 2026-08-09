import { memo, useEffect, useState } from 'react';
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
 * M1 — Ad Contact Banner (Marketplace Mediator model §10):
 * Deploys the standard AdSpot, but when the configured ad links to a phone
 * (`#/phone-details?device=<id>`), the whole banner becomes a contact CTA:
 * click → fire-and-forget intent → WhatsApp to the owner with the phone data.
 * Any other ad link keeps its normal anchor behaviour. Tracking is
 * fire-and-forget and can never block or delay WhatsApp.
 */
export const AdContactBanner = memo(function AdContactBanner({ placement }: AdContactBannerProps) {
  const [ad, setAd] = useState<ResolvedAd | null>(() => resolve(placement));

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

  if (!ad) return null;

  const device: InventoryRecord | null = ad.link ? resolveAdDevice(ad.link) : null;
  if (!device) return <AdSpot placement={placement} />;

  return (
    <div style={{ position: 'relative' }}>
      <AdSpot placement={placement} />
      <button
        type="button"
        aria-label={ad.alt || placement}
        onClick={() => {
          try {
            recordIntent({ kind: 'ad_click', ctaType: 'ad_click', placement, deviceId: device.id });
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
    </div>
  );
});

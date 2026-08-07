import { memo, useEffect, useState } from 'react';
import { ensureAdsLoaded, getAd, subscribeAds, type AdPlacement } from '../../services/ads-service';
import { AdBanner } from './AdBanner';

interface AdSpotProps {
  placement: AdPlacement;
}

function resolve(placement: AdPlacement): { image: string; link: string; alt: string } | null {
  const ad = getAd(placement);
  if (!ad || !ad.enabled || !ad.image) return null;
  return { image: ad.image, link: ad.link, alt: ad.alt };
}

/**
 * Renders the single configured banner for a placement (if any).
 * Reads from Supabase (ads table) and updates instantly via Realtime.
 * The image is displayed fully inside an adaptive frame — no Ken Burns zoom/crop
 * (see AdBanner for the no-crop motion).
 */
export const AdSpot = memo(function AdSpot({ placement }: AdSpotProps) {
  const [ad, setAd] = useState<{ image: string; link: string; alt: string } | null>(() => resolve(placement));

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

  return ad.link ? (
    <a
      href={ad.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ad.alt || placement}
      role="banner"
      style={{ display: 'block' }}
    >
      <AdBanner image={ad.image} alt={ad.alt || placement} />
    </a>
  ) : (
    <div role="banner" aria-label={ad.alt || placement}>
      <AdBanner image={ad.image} alt={ad.alt || placement} />
    </div>
  );
});

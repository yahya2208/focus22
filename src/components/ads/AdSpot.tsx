import { memo, useCallback, useEffect, useState } from 'react';
import {
  ensureAdsLoaded,
  getAd,
  subscribeAds,
  type AdImage,
  type AdPlacement,
} from '../../services/ads-service';
import { AdBanner, type AdBannerStatus } from './AdBanner';

interface AdSpotProps {
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
 * Renders the single configured banner for a placement (if any).
 * Reads from Supabase (ads table) and updates instantly via Realtime.
 * The image fills the banner (object-fit: cover, top-focused crop) inside a
 * fixed-height wide frame — no Ken Burns zoom/crop. When the configured image
 * fails to load the whole wrapper collapses (no empty interactive target / no
 * empty frame). A placement with a multi-image gallery (ad_images, Phase C)
 * renders the AdImageCarousel; the gallery never mixes across placements.
 */
export const AdSpot = memo(function AdSpot({ placement }: AdSpotProps) {
  const [ad, setAd] = useState<ResolvedAd | null>(() => resolve(placement));
  const [failed, setFailed] = useState(false);

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

  if (!ad || failed) return null;

  return ad.link ? (
    <a
      href={ad.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ad.alt || placement}
      role="banner"
      style={{ display: 'block' }}
    >
      <AdBanner
        image={ad.image}
        images={ad.images}
        alt={ad.alt || placement}
        onStateChange={handleStateChange}
      />
    </a>
  ) : (
    <div role="banner" aria-label={ad.alt || placement}>
      <AdBanner
        image={ad.image}
        images={ad.images}
        alt={ad.alt || placement}
        onStateChange={handleStateChange}
      />
    </div>
  );
});

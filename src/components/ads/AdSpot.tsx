import { memo, useEffect, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getAdsFile, getAdOverride, resolveAd, type AdPlacement } from '../../services/ads-service';

interface AdSpotProps {
  placement: AdPlacement;
}

/**
 * Renders the single configured banner for a placement (if any).
 * The image is a still PNG/WebP animated with a slow Ken Burns pan/zoom —
 * no GIF conversion, so quality stays high.
 */
export const AdSpot = memo(function AdSpot({ placement }: AdSpotProps) {
  const colors = useThemeColors();
  const [ad, setAd] = useState<{ image: string; link: string; alt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdsFile().then((file) => {
      if (cancelled) return;
      const resolved = resolveAd(placement, file, getAdOverride());
      setAd(resolved ? { image: resolved.image, link: resolved.link, alt: resolved.alt } : null);
    });
    return () => { cancelled = true; };
  }, [placement]);

  if (!ad) return null;

  const content = (
    <img
      src={ad.image}
      alt={ad.alt || placement}
      loading="lazy"
      style={{
        position: 'absolute', inset: '-8%',
        width: '116%', height: '116%',
        objectFit: 'cover',
        animation: 'kenburns 22s ease-in-out infinite alternate',
        willChange: 'transform',
      }}
    />
  );

  const frameStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 5',
    overflow: 'hidden',
    borderRadius: '18px',
    border: `1px solid ${colors.glassBorder}`,
    boxShadow: `0 10px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1)`,
    background: colors.bgCard,
  };

  return ad.link ? (
    <a
      href={ad.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ad.alt || placement}
      role="banner"
      style={{ ...frameStyle, display: 'block' }}
    >
      {content}
    </a>
  ) : (
    <div role="banner" aria-label={ad.alt || placement} style={frameStyle}>
      {content}
    </div>
  );
});

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { AdImage } from '../../services/ads-service';
import { AdImageCarousel } from './AdImageCarousel';

export type AdBannerStatus = 'loading' | 'loaded' | 'failed';

interface AdBannerProps {
  image: string;
  alt?: string;
  /**
   * Optional ordered gallery (D-GATE-ADS). When more than one image is
   * present the banner renders the AdImageCarousel instead of a single frame.
   */
  images?: readonly AdImage[];
  /**
   * Optional status signal so parents (AdSpot, AdContactBanner) can collapse
   * their interactive wrapper when the image fails — never a broken/empty frame.
   */
  onStateChange?: (status: AdBannerStatus) => void;
  /**
   * 00021 — per-slide actions for the carousel (see AdImageCarousel).
   */
  onSlideAction?: (image: AdImage) => void;
  canSlideAction?: (image: AdImage) => boolean;
  /**
   * FOCUS-AD-DETAILS — per-slide details navigation for the carousel (see
   * AdImageCarousel). Main-image tap → device details page.
   */
  onSlideDetails?: (image: AdImage) => void;
  /**
   * FOCUS-AD-DETAILS — per-slide details availability for the carousel (see
   * AdImageCarousel).
   */
  canSlideDetails?: (image: AdImage) => boolean;
}

/**
 * Fixed-height, strong banner frame (M1 + final visual correction) with
 * hardened image states (V-1):
 * - loading: intentional static placeholder inside a stable frame.
 * - loaded: full image fills the frame (object-fit: cover, top-focused crop
 *   via object-position: center top) — portrait/square/landscape uploads never
 *   inflate the banner and the important top info stays visible.
 * - failed: collapses to nothing (null) — no empty advertising frame, no
 *   broken-image icon, no retry loop. `onStateChange` lets the parent
 *   collapse its interactive wrapper too.
 */
export const AdBanner = memo(function AdBanner({ image, alt, images, onStateChange, onSlideAction, canSlideAction, onSlideDetails, canSlideDetails }: AdBannerProps) {
  const colors = useThemeColors();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<AdBannerStatus>('loading');

  const handleLoad = useCallback(() => {
    setStatus('loaded');
    onStateChange?.('loaded');
  }, [onStateChange]);

  const handleError = useCallback(() => {
    setStatus('failed');
    onStateChange?.('failed');
  }, [onStateChange]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      setStatus('loaded');
      onStateChange?.('loaded');
    } else {
      setStatus('failed');
      onStateChange?.('failed');
    }
  }, [onStateChange]);

  if (images && images.length > 1) {
    return (
      <AdImageCarousel
        images={images}
        alt={alt}
        onStateChange={onStateChange}
        onSlideAction={onSlideAction}
        canSlideAction={canSlideAction}
        onSlideDetails={onSlideDetails}
        canSlideDetails={canSlideDetails}
      />
    );
  }

  if (status === 'failed') return null;

  return (
    <div
      data-testid="adspot-frame"
      data-status={status}
      className="adspot-frame"
      style={{
        position: 'relative',
        width: '100%',
        height: BANNER_FRAME_HEIGHT,
        overflow: 'hidden',
        borderRadius: '18px',
        border: `1px solid ${colors.glassBorder}`,
        boxShadow: `0 10px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1)`,
        background: colors.bgCard,
      }}
    >
      <img
        ref={imgRef}
        src={image}
        alt={alt ?? ''}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          opacity: status === 'loaded' ? 1 : 0,
        }}
      />
      {status === 'loading' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bgInput,
            color: colors.textFaint,
          }}
        >
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⌛</span>
        </div>
      )}
    </div>
  );
});

// Fixed-height, strong banner frame (final visual correction): the ad image
// FILLS the whole banner — object-fit: cover stretches the image to the frame
// with a TOP-focused crop (object-position: center top) so the important info
// that ads put in the top area (phone name / price / specs) stays visible even
// for tall portrait uploads. A portrait/square/landscape upload never looks
// like a small picture floating in a box and never inflates the frame.
// The height scales with the viewport (mobile ≈ 220 px+, desktop up to
// 360 px); the frame NEVER inherits the image's aspect ratio.
const BANNER_FRAME_HEIGHT = 'clamp(220px, 58vw, 360px)';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

export type AdBannerStatus = 'loading' | 'loaded' | 'failed';

interface AdBannerProps {
  image: string;
  alt?: string;
  /**
   * Optional status signal so parents (AdSpot, AdContactBanner) can collapse
   * their interactive wrapper when the image fails — never a broken/empty frame.
   */
  onStateChange?: (status: AdBannerStatus) => void;
}

/**
 * Adaptive ad frame (M1) with hardened image states (V-1):
 * - loading: intentional static placeholder inside a stable frame.
 * - loaded: full image, adaptive ratio, fully static (BATCH 2 — no breathing,
 *   no shine sweep, no auto-motion).
 * - failed: collapses to nothing (null) — no empty advertising frame, no
 *   broken-image icon, no retry loop. `onStateChange` lets the parent
 *   collapse its interactive wrapper too.
 */
export const AdBanner = memo(function AdBanner({ image, alt, onStateChange }: AdBannerProps) {
  const colors = useThemeColors();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [status, setStatus] = useState<AdBannerStatus>('loading');

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      if (el.naturalWidth > 0 && el.naturalHeight > 0) {
        setRatio(el.naturalWidth / el.naturalHeight);
      }
      setStatus('loaded');
      onStateChange?.('loaded');
    },
    [onStateChange],
  );

  const handleError = useCallback(() => {
    setStatus('failed');
    onStateChange?.('failed');
  }, [onStateChange]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !el.complete) return;
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      setRatio(el.naturalWidth / el.naturalHeight);
      setStatus('loaded');
      onStateChange?.('loaded');
    } else {
      setStatus('failed');
      onStateChange?.('failed');
    }
  }, [onStateChange]);

  if (status === 'failed') return null;

  const frameRatio = ratio !== null ? clampRatio(ratio) : PLACEHOLDER_RATIO;

  return (
    <div
      data-testid="adspot-frame"
      data-status={status}
      className="adspot-frame"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${frameRatio} / 1`,
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
          objectFit: 'contain',
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

const MIN_RATIO = 1.0; // square (1:1) — portrait images letterbox into a square frame
const MAX_RATIO = 3.2; // ~16:5 — ultra-wide images letterbox into a 3.2 frame
const PLACEHOLDER_RATIO = 16 / 5;

function clampRatio(ratio: number): number {
  return Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);
}

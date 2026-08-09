import { memo, useCallback, useState } from 'react';
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
 * - loading: intentional pulsing placeholder inside a stable frame, no shine.
 * - loaded: full image, adaptive ratio, existing breathing + shine sweep.
 * - failed: collapses to nothing (null) — no empty advertising frame, no
 *   broken-image icon, no shine, no retry loop. `onStateChange` lets the parent
 *   collapse its interactive wrapper too.
 */
export const AdBanner = memo(function AdBanner({ image, alt, onStateChange }: AdBannerProps) {
  const colors = useThemeColors();
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
          animation: status === 'loaded' ? 'adspot-breathe 8s ease-in-out infinite' : undefined,
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
          <span style={{ fontSize: '1.6rem', lineHeight: 1, animation: 'adspot-breathe 1.4s ease-in-out infinite' }}>
            ⌛
          </span>
        </div>
      )}
      {/* Decorative shine sweep — pointer-events none, only after the image loads */}
      {status === 'loaded' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.10) 50%, transparent 58%)',
            backgroundSize: '250% 100%',
            backgroundPosition: '220% 0',
            animation: 'adspot-shine 11s ease-in-out infinite alternate',
          }}
        />
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

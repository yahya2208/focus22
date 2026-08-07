import { memo, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface AdBannerProps {
  image: string;
  alt?: string;
}

/**
 * Adaptive ad frame (M1):
 * - Measures the uploaded image's natural dimensions once on load.
 * - Sizes the frame to the image's own aspect ratio (clamped to a sane banner
 *   range), so the whole image is visible without cropping.
 * - Images outside the clamp range are letterboxed with `contain` — the full
 *   image is still shown, never cropped.
 * - Frame height is capped responsively (see `.adspot-frame` in index.html):
 *   Desktop 420px → Laptop 360px → Tablet 320px → Mobile auto (natural size),
 *   so tall/portrait ads never dominate; `contain` keeps the full image visible.
 * - Motion is applied WITHOUT touching the image pixels: a subtle breathing
 *   opacity on the image plus a decorative shine sweep overlay. No scale/zoom
 *   that would hide parts of the image (kenburns removed).
 */
export const AdBanner = memo(function AdBanner({ image, alt }: AdBannerProps) {
  const colors = useThemeColors();
  const [ratio, setRatio] = useState<number | null>(null);

  const frameRatio = ratio !== null ? clampRatio(ratio) : PLACEHOLDER_RATIO;

  return (
    <div
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
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            setRatio(el.naturalWidth / el.naturalHeight);
          }
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          animation: 'adspot-breathe 8s ease-in-out infinite',
        }}
      />
      {/* Decorative shine sweep — pointer-events none, never covers the image */}
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
    </div>
  );
});

const MIN_RATIO = 1.0; // square (1:1) — portrait images letterbox into a square frame
const MAX_RATIO = 3.2; // ~16:5 — ultra-wide images letterbox into a 3.2 frame
const PLACEHOLDER_RATIO = 16 / 5;

function clampRatio(ratio: number): number {
  return Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);
}

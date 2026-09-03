import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { AdImage } from '../../services/ads-service';
import { getRuntimeSetting } from '../../core/config/runtime-settings';

export type AdCarouselStatus = 'loading' | 'loaded' | 'failed';

// Fixed-height, strong banner frame (final visual correction): the ad image
// FILLS the whole banner — object-fit: cover stretches the image to the frame
// with a TOP-focused crop (object-position: center top) so the important info
// that ads put in the top area (phone name / price / specs) stays visible even
// for tall portrait uploads. A portrait/square/landscape upload never looks
// like a small picture floating in a box and never inflates the frame.
// The height scales with the viewport (mobile ≈ 220 px+, desktop up to
// 360 px); the frame NEVER inherits the image's aspect ratio.
const BANNER_FRAME_HEIGHT = 'clamp(220px, 58vw, 360px)';

const AUTOPLAY_MS = 2000;
const SWIPE_THRESHOLD_PX = 50;

/**
 * Respects prefers-reduced-motion: when the user requests reduced motion the
 * carousel never auto-advances — all navigation stays user-initiated (arrows,
 * thumbnails, swipe). Read at mount and kept in sync while mounted.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

interface AdImageCarouselProps {
  images: readonly AdImage[];
  alt?: string;
  onStateChange?: (status: AdCarouselStatus) => void;
  /**
   * 00021 — per-slide conversion action (WhatsApp handoff). When the slide
   * currently shown has its own device_id and a handler + predicate are
   * provided, the frame renders a conversion control for that slide. The
   * parent owns resolvability (canSlideAction) so a slide never becomes a dead
   * clickable target.
   */
  onSlideAction?: (image: AdImage) => void;
  canSlideAction?: (image: AdImage) => boolean;
  /**
   * FOCUS-AD-DETAILS — main-image tap → device details. When this handler is
   * provided, tapping the large main image opens that device's details page
   * (never the WhatsApp handoff). The onSlideAction CTA stays reachable as a
   * small corner button only. A slide without any actionable device stays
   * browse-only.
   */
  onSlideDetails?: (image: AdImage) => void;
  /**
   * FOCUS-AD-DETAILS — per-slide availability of the details surface (a parent
   * may fall back to an ad-level device when a slide carries no device_id).
   * Defaults to `Boolean(image.deviceId)`.
   */
  canSlideDetails?: (image: AdImage) => boolean;
}

/**
 * D-GATE-ADS — lightweight ad gallery carousel carved from ProductImageGallery:
 * stacked crossfading slides, prev/next arrows and a thumbnail strip. The main
 * frame auto-advances every ~2 s (loop last → first, ~5 slides in the first
 * 10 s), pauses while hovered on desktop, and restarts its countdown after any
 * manual navigation; reduced motion disables autoplay entirely. The current
 * slide plus its immediate neighbors are preloaded (eager) so transitions never
 * wait on a cold request; the rest stay lazy (no unbounded downloads). Touch
 * swipe (left → next, right → prev) is supported with a short-swipe threshold.
 * NO fullscreen, NO visible counter. Fixed-height strong banner frame (see
 * BANNER_FRAME_HEIGHT): loading placeholder, loaded → ~70% of the ad's height
 * is visible — the crisp ad is rendered in a 100%/0.7-tall box that keeps the
 * image's real aspect ratio (top-anchored, no distortion) over a blurred
 * backdrop that fills the banner; failed → collapse so the parent collapses
 * its interactive wrapper (never a broken/empty ad frame).
 */
export const AdImageCarousel = memo(function AdImageCarousel({
  images,
  alt,
  onStateChange,
  onSlideAction,
  canSlideAction,
  onSlideDetails,
  canSlideDetails,
}: AdImageCarouselProps) {
  const colors = useThemeColors();
  const count = images.length;

  const [index, setIndex] = useState(() => {
    const cover = images.findIndex((img) => img.isCover);
    return cover >= 0 ? cover : 0;
  });

  const [loadStates, setLoadStates] = useState<Record<string, AdCarouselStatus>>({});
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});

  const current = images[index] ?? images[0] ?? null;
  const currentKey = current?.path ?? '';

  const status: AdCarouselStatus = current ? (loadStates[currentKey] ?? 'loading') : 'failed';

  useEffect(() => {
    onStateChange?.(status);
  }, [status, onStateChange]);

  // Preload window: the current slide plus its immediate neighbors stay
  // eager so a 2 s autoplay never waits on a cold request — the browser has
  // already fetched them while the previous slide was visible. Slides outside
  // the window stay `lazy`, so a large gallery never triggers an unbounded
  // parallel download. Loading a slide when it enters the window is a single
  // request per path (browsers dedupe by URL), so no duplicate fetches.
  const preloadKeys = useMemo(() => {
    const set = new Set<string>();
    const at = (i: number) => images[(i + count) % count]!;
    set.add(at(index).path);
    if (count <= 1) return set;
    set.add(at(index + 1).path);
    set.add(at(index - 1).path);
    return set;
  }, [images, index, count]);

  // Autoplay / touch state.
  const [hovered, setHovered] = useState(false);
  const [interactionTick, setInteractionTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const canAutoplay = count > 1 && !reducedMotion;

  // Every manual interaction (prev/next/thumb/swipe) bumps the tick so the
  // autoplay timer restarts from a full interval — a short pause after
  // interaction, then autoplay resumes after AUTOPLAY_MS of no interaction.
  const bump = useCallback(() => setInteractionTick((t) => t + 1), []);

  const prev = useCallback(() => {
    bump();
    setIndex((i) => (i - 1 + count) % count);
  }, [bump, count]);

  const next = useCallback(() => {
    bump();
    setIndex((i) => (i + 1) % count);
  }, [bump, count]);

  const goTo = useCallback(
    (target: number) => {
      bump();
      setIndex(target);
    },
    [bump],
  );

  // Autoplay: advance ~every AUTOPLAY_MS, looping last → first. Disabled for a
  // single image, while hovered, or when the user prefers reduced motion.
  useEffect(() => {
    if (!canAutoplay || hovered) return;
    const ms = getRuntimeSetting('ads.carousel_autoplay_ms', AUTOPLAY_MS);
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, ms);
    return () => window.clearInterval(id);
  }, [canAutoplay, hovered, interactionTick, count]);

  // Swipe: track a touch start and, on release, jump prev/next only for a
  // clear horizontal swipe (threshold + dominant axis). Vertical drags keep
  // native scrolling (touch-action: pan-y prevents any horizontal page pan).
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches?.[0] ?? e.touches?.[0];
    if (t) touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < getRuntimeSetting('ads.carousel_swipe_threshold_px', SWIPE_THRESHOLD_PX)) return; // too short — treat as tap
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll — not a swipe
      if (dx < 0) next();
      else prev();
    },
    [next, prev],
  );

  const handleLoad = useCallback(
    (key: string, w: number, h: number) => {
      if (w > 0 && h > 0) {
        setDims((prev) => ({ ...prev, [key]: { w, h } }));
      }
      setLoadStates((prev) => ({ ...prev, [key]: 'loaded' }));
    },
    [],
  );

  const handleError = useCallback((key: string) => {
    setLoadStates((prev) => ({ ...prev, [key]: 'failed' }));
  }, []);

  if (!current) return null;
  if (status === 'failed') return null;

  // FOCUS-AD-DETAILS — the MAIN IMAGE is the details surface and can NEVER
  // trigger a conversion. The full-frame overlay only opens details; the
  // WhatsApp handoff lives exclusively on the small corner CTA. The parent
  // owns both availability checks (a slide can fall back to an ad-level
  // device), so a slide never becomes a dead clickable target.
  const detailsAvailable =
    status === 'loaded' &&
    Boolean(onSlideDetails) &&
    (canSlideDetails ? canSlideDetails(current) : Boolean(current?.deviceId));
  const ctaAvailable =
    status === 'loaded' &&
    Boolean(onSlideAction) &&
    (canSlideAction ? canSlideAction(current) : Boolean(current?.deviceId));

  return (
    <div
      data-testid="ad-carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
    >
      <div
        data-testid="ad-carousel-frame"
        data-status={status}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'relative',
          width: '100%',
          height: BANNER_FRAME_HEIGHT,
          overflow: 'hidden',
          touchAction: 'pan-y',
          borderRadius: '18px',
          border: `1px solid ${colors.glassBorder}`,
          boxShadow: `0 10px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1)`,
          background: colors.bgCard,
        }}
      >
        {images.map((img, i) => {
          const nat = dims[img.path];
          const isActive = i === index;
          return (
            <div key={img.path} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {/* Blurred backdrop — fills the whole banner so a tall portrait ad
                  never leaves empty side boxes; the crisp ad renders on top. */}
              <img
                src={img.url}
                alt=""
                aria-hidden="true"
                loading={preloadKeys.has(img.path) ? 'eager' : 'lazy'}
                onError={() => handleError(img.path)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  filter: 'blur(14px) brightness(0.55) saturate(1.1)',
                  transform: 'scale(1.12)',
                  opacity: isActive ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}
              />
              {/* Crisp foreground — rendered so ~70% of the ad's height stays
                  visible: the box is 100%/0.7 tall, keeps the image's real
                  aspect ratio (no distortion), and is anchored to the top so
                  the important phone name / price / specs are never cut off. */}
              <img
                data-testid={isActive ? 'ad-carousel-current' : `ad-carousel-slide-${i}`}
                src={img.url}
                alt={isActive ? (alt ?? '') : ''}
                aria-hidden={!isActive}
                loading={preloadKeys.has(img.path) ? 'eager' : 'lazy'}
                onLoad={(e) =>
                  handleLoad(img.path, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
                }
                onError={() => handleError(img.path)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  height: 'calc(100% / 0.7)',
                  maxWidth: 'none',
                  aspectRatio: nat ? `${nat.w} / ${nat.h}` : '4 / 3',
                  objectFit: 'cover',
                  display: 'block',
                  opacity: isActive && status === 'loaded' ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}
              />
            </div>
          );
        })}
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
        {detailsAvailable && (
          <button
            type="button"
            data-testid="ad-slide-action"
            aria-label={`${alt ?? 'ad'} — عرض التفاصيل`}
            onClick={() => onSlideDetails?.(current)}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
            }}
          />
        )}
        {ctaAvailable && (
          <button
            type="button"
            data-testid="ad-slide-cta"
            aria-label={`${alt ?? 'ad'} — فتح المحادثة`}
            onClick={() => onSlideAction?.(current)}
            style={{
              position: 'absolute',
              insetInlineEnd: '0.6rem',
              bottom: '0.6rem',
              zIndex: 3,
              padding: '0.45rem 0.85rem',
              borderRadius: '999px',
              border: 'none',
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            تواصل
          </button>
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              data-testid="ad-carousel-prev"
              aria-label={`${alt ?? 'ad'} — previous image`}
              onClick={prev}
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                insetInlineStart: '0.5rem',
                zIndex: 4,
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ‹
            </button>
            <button
              type="button"
              data-testid="ad-carousel-next"
              aria-label={`${alt ?? 'ad'} — next image`}
              onClick={next}
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                insetInlineEnd: '0.5rem',
                zIndex: 4,
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ›
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto' }}>
          {images.map((img, i) => (
            <button
              key={img.path}
              type="button"
              data-testid={`ad-carousel-thumb-${i}`}
              aria-label={`${alt ?? 'ad'} — thumbnail ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              style={{
                flex: '0 0 auto',
                width: 48,
                height: 48,
                padding: 0,
                border: i === index ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                borderRadius: '10px',
                overflow: 'hidden',
                background: colors.bgInput,
                cursor: 'pointer',
              }}
            >
              <img
                src={img.url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

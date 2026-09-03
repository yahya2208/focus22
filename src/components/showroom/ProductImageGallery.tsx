import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { track } from '../../core/telemetry';
import { getRuntimeSetting } from '../../core/config/runtime-settings';

interface ProductImageGalleryProps {
  images: readonly string[];
  name: string;
  /** Canonical product entity id used for `product_image_view` (non-PII). */
  entityId?: string | null;
}

/** Auto-play cadence (§ controlled-fix FIX-01): advance every 3s. */
export const GALLERY_AUTOPLAY_MS = 3000;

/** Minimum horizontal drag distance for a swipe/drag navigation. */
export const GALLERY_SWIPE_THRESHOLD_PX = 40;

/** Side-preview dimming so the center image stays the focus. */
export const GALLERY_SIDE_OPACITY = 0.55;
export const GALLERY_SIDE_BLUR_PX = 3;
export const GALLERY_SIDE_SCALE = 0.9;

/**
 * FIX-01 — Product details gallery as a real carousel (hand-rolled, no library):
 *  - center image is the focus (opacity 1, blur 0);
 *  - prev/next images peek on the sides, dimmed + blurred + scaled;
 *  - auto-play every 3s, circular wrap;
 *  - smooth crossfade via stacked slides (no <img> jumps, no layout shift);
 *  - touch swipe + pointer drag (RTL-aware logical direction);
 *  - ArrowLeft/ArrowRight (RTL-aware);
 *  - thumbnails + fullscreen preserved;
 *  - pause/reset on any manual interaction; timers cleaned up on unmount.
 */
export const ProductImageGallery = memo(function ProductImageGallery({
  images,
  name,
  entityId,
}: ProductImageGalleryProps) {
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [, setResetKey] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const regionRef = useRef<HTMLDivElement | null>(null);

  const count = images.length;
  const hasImages = count > 0;

  const isRTL = useCallback((): boolean => {
    const el = regionRef.current;
    if (!el) return false;
    return el.closest('[dir="rtl"]') != null;
  }, []);

  const restartAutoplay = useCallback(() => setResetKey((k) => k + 1), []);

  const next = useCallback(() => {
    setIndex((i) => (count > 0 ? (i + 1) % count : 0));
  }, [count]);

  const goTo = useCallback(
    (target: number) => {
      setIndex(() => Math.min(Math.max(target, 0), Math.max(count - 1, 0)));
    },
    [count],
  );

  // Phase 10A — report a viewed image index (manual navigation only). Passive
  // autoplay/scroll stays silent; only intentional next/prev/select reports.
  const reportView = useCallback(
    (idx: number) => {
      if (!hasImages) return;
      void track({
        event: 'product_image_view',
        entityType: 'product',
        entityId: entityId ?? null,
        properties: { index: idx },
        dedupeKey: `product_image_view:${entityId ?? name}:${idx}`,
      });
    },
    [hasImages, entityId, name],
  );

  // Manual next/prev (arrows, keyboard, swipe, side-peek) that BOTH navigate and
  // report the resulting index. Autoplay keeps using the silent `next`/`prev`.
  const manualNext = useCallback(() => {
    const target = count > 0 ? (index + 1) % count : 0;
    setIndex(() => (count > 0 ? (index + 1) % count : 0));
    reportView(target);
  }, [count, index, reportView]);

  const manualPrev = useCallback(() => {
    const target = count > 0 ? (index - 1 + count) % count : 0;
    setIndex(() => (count > 0 ? (index - 1 + count) % count : 0));
    reportView(target);
  }, [count, index, reportView]);

  // Auto-play: single interval, circular wrap. Paused while the user is
  // touching/dragging; any manual interaction restarts the 3s window.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(next, getRuntimeSetting('experience.gallery_autoplay_ms', GALLERY_AUTOPLAY_MS));
    return () => clearInterval(id);
  }, [count, paused, next, index, restartAutoplay]);

  const openFullscreen = useCallback(() => {
    if (!hasImages || draggedRef.current) return;
    setFullscreen(true);
    // Telemetry (Phase 9): meaningful image-view action — opening the real
    // fullscreen viewer. `product_image_view { index }`, deduped per product
    // + index (same image re-viewed within a session collapses).
    void track({
      event: 'product_image_view',
      entityType: 'product',
      entityId: entityId ?? null,
      properties: { index },
      dedupeKey: `product_image_view:${entityId ?? name}:${index}`,
    });
  }, [hasImages, index, entityId, name]);

  const commitHorizontal = useCallback(
    (dx: number) => {
      if (Math.abs(dx) < GALLERY_SWIPE_THRESHOLD_PX) {
        setPaused(false);
        restartAutoplay();
        return;
      }
      draggedRef.current = true;
      // Logical direction: in LTR swiping left moves forward; mirrored in RTL.
      const forward = isRTL() ? dx > 0 : dx < 0;
      if (forward) manualNext();
      else manualPrev();
      setPaused(false);
      restartAutoplay();
    },
    [isRTL, manualNext, manualPrev, restartAutoplay],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    setPaused(true);
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current == null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchStartX.current;
      touchStartX.current = null;
      commitHorizontal(dx);
    },
    [commitHorizontal],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerStartX.current = e.clientX;
    draggedRef.current = false;
    setPaused(true);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerStartX.current == null) return;
      const dx = e.clientX - pointerStartX.current;
      pointerStartX.current = null;
      commitHorizontal(dx);
    },
    [commitHorizontal],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const forward = e.key === 'ArrowRight' ? !isRTL() : isRTL();
        if (forward) manualNext();
        else manualPrev();
        setPaused(false);
        restartAutoplay();
      }
    },
    [isRTL, manualNext, manualPrev, restartAutoplay],
  );

  const prevIndex = count > 0 ? (index - 1 + count) % count : -1;
  const nextIndex = count > 0 ? (index + 1) % count : -1;
  const prevSrc = prevIndex >= 0 ? (images[prevIndex] ?? null) : null;
  const nextSrc = nextIndex >= 0 ? (images[nextIndex] ?? null) : null;

  const slideStyle = useCallback(
    (active: boolean): React.CSSProperties => ({
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      opacity: active ? 1 : 0,
      filter: active ? 'blur(0px)' : 'blur(2px)',
      transition: 'opacity 0.5s ease, filter 0.5s ease',
      pointerEvents: active ? 'auto' : 'none',
    }),
    [],
  );

  const sidePeekStyle = useCallback(
    (side: 'start' | 'end'): React.CSSProperties => ({
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: '26%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      opacity: GALLERY_SIDE_OPACITY,
      filter: `blur(${GALLERY_SIDE_BLUR_PX}px)`,
      transform: `scale(${GALLERY_SIDE_SCALE})`,
      borderRadius: '14px',
      cursor: 'pointer',
      zIndex: 3,
      [side === 'start' ? 'insetInlineStart' : 'insetInlineEnd']: '0.4rem',
    }),
    [],
  );

  const arrowStyle = useCallback(
    (side: 'start' | 'end'): React.CSSProperties => ({
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      [side === 'start' ? 'insetInlineStart' : 'insetInlineEnd']: '0.5rem',
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
    }),
    [],
  );

  const main = useMemo(() => {
    if (!hasImages) {
      return (
        <div
          role="img"
          aria-label={name}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bgInput,
            color: colors.textFaint,
            fontSize: '3rem',
          }}
        >
          📱
        </div>
      );
    }
    return (
      <>
        {images.map((src, i) =>
          src ? (
            <img
              key={`slide-${i}`}
              data-testid={i === index ? 'gallery-center' : `gallery-slide-${i}`}
              src={src}
              alt={i === index ? `${name} — ${index + 1}/${count}` : ''}
              style={slideStyle(i === index)}
            />
          ) : null,
        )}
        {count > 1 && prevSrc && (
          <img
            data-testid="gallery-prev"
            src={prevSrc}
            alt=""
            aria-hidden
            style={sidePeekStyle('start')}
            onClick={(e) => {
              e.stopPropagation();
              manualPrev();
              setPaused(false);
              restartAutoplay();
            }}
          />
        )}
        {count > 1 && nextSrc && (
          <img
            data-testid="gallery-next"
            src={nextSrc}
            alt=""
            aria-hidden
            style={sidePeekStyle('end')}
            onClick={(e) => {
              e.stopPropagation();
              manualNext();
              setPaused(false);
              restartAutoplay();
            }}
          />
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              data-testid="gallery-prev-arrow"
              aria-label={`${name} — previous image`}
              style={arrowStyle('start')}
              onClick={(e) => {
                e.stopPropagation();
                manualPrev();
                setPaused(false);
                restartAutoplay();
              }}
            >
              ‹
            </button>
            <button
              type="button"
              data-testid="gallery-next-arrow"
              aria-label={`${name} — next image`}
              style={arrowStyle('end')}
              onClick={(e) => {
                e.stopPropagation();
                manualNext();
                setPaused(false);
                restartAutoplay();
              }}
            >
              ›
            </button>
          </>
        )}
      </>
    );
  }, [hasImages, images, index, count, name, colors.bgInput, colors.textFaint, slideStyle, sidePeekStyle, arrowStyle, manualPrev, manualNext, restartAutoplay, prevSrc, nextSrc]);

  return (
    <div
      style={{
        borderRadius: '20px',
        overflow: 'hidden',
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        ref={regionRef}
        role="region"
        aria-label="product gallery"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        onClick={openFullscreen}
        style={{
          position: 'relative',
          aspectRatio: '1 / 1',
          width: '100%',
          overflow: 'hidden',
          cursor: hasImages ? 'zoom-in' : 'default',
          outline: 'none',
        }}
      >
        {main}
        {hasImages && (
          <span
            style={{
              position: 'absolute',
              top: '0.6rem',
              insetInlineEnd: '0.6rem',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              borderRadius: '999px',
              padding: '0.2rem 0.65rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              zIndex: 5,
            }}
          >
            {index + 1}/{count}
          </span>
        )}
      </div>

      {count > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', padding: '0.5rem', overflowX: 'auto' }}>
          {images.map((src, i) => (
            <button
              key={`thumb-${i}`}
              type="button"
              aria-label={`${name} — thumbnail ${i + 1}`}
              aria-current={i === index}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i);
                setPaused(false);
                restartAutoplay();
                void track({
                  event: 'product_image_view',
                  entityType: 'product',
                  entityId: entityId ?? null,
                  properties: { index: i },
                  dedupeKey: `product_image_view:${entityId ?? name}:${i}`,
                });
              }}
              style={{
                flex: '0 0 auto',
                width: 52,
                height: 52,
                padding: 0,
                border: i === index ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                borderRadius: '10px',
                overflow: 'hidden',
                background: colors.bgInput,
                cursor: 'pointer',
              }}
            >
              <img
                src={src}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}

      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setFullscreen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={images[index] ?? ''}
            alt={name}
            style={{ maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
});

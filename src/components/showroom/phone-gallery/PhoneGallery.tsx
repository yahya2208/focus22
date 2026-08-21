import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { usePreloadImages } from './usePreloadImages';

interface PhoneGalleryProps {
  images: readonly string[];
  name: string;
}

/**
 * PhoneGallery — details-page image gallery (Reels-style vertical scroll).
 *
 * UX:
 *  - CSS scroll-snap (scroll-snap-type: y mandatory) for vertical swipe
 *  - Main gallery: 70vh (info stays visible below)
 *  - Fullscreen: 100dvh (true full-viewport Reels experience)
 *  - One image fills the viewport per snap point
 *  - Dot indicators show current position
 *  - No autoplay, no side-peek, no crossfade
 *  - Tap to open fullscreen overlay
 *  - Preloads current + adjacent images
 *  - Swipe up = next, swipe down = previous
 */
export const PhoneGallery = memo(function PhoneGallery({
  images,
  name,
}: PhoneGalleryProps) {
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = images.length;
  const hasImages = count > 0;

  // Preload current + adjacent images
  usePreloadImages(images, index, 1);

  // Track which image is in view via vertical scroll-snap
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const height = el.clientHeight;
    if (height <= 0) return;
    const newIndex = Math.round(scrollTop / height);
    if (newIndex !== index && newIndex >= 0 && newIndex < count) {
      setIndex(newIndex);
    }
  }, [index, count]);

  // Keyboard navigation (ArrowUp/ArrowDown for vertical)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const el = scrollRef.current;
        if (!el) return;
        const forward = e.key === 'ArrowDown';
        const nextIndex = forward
          ? Math.min(index + 1, count - 1)
          : Math.max(index - 1, 0);
        const slide = el.children[nextIndex] as HTMLElement | undefined;
        if (slide) {
          slide.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }
      }
    },
    [index, count],
  );

  const openFullscreen = useCallback(() => {
    if (hasImages) setFullscreen(true);
  }, [hasImages]);

  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
  }, []);

  // Sync scroll position to state on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      handleScroll();
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [handleScroll]);

  if (!hasImages) {
    return (
      <div
        role="region"
        aria-label="product gallery"
        style={{
          borderRadius: '20px',
          overflow: 'hidden',
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          height: '70vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
      <div
        style={{
          borderRadius: '20px',
          overflow: 'hidden',
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
        }}
      >
        {/* Vertical scroll-snap container — 70vh */}
        <div
          ref={scrollRef}
          role="region"
          aria-label="product gallery"
          aria-roledescription="carousel"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onClick={openFullscreen}
          data-testid="phone-gallery-scroll"
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            scrollSnapType: 'y mandatory',
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch',
            height: '70vh',
            width: '100%',
            cursor: hasImages ? 'zoom-in' : 'default',
            outline: 'none',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {images.map((src, i) => (
            <div
              key={`gallery-slide-${i}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              style={{
                flex: '0 0 100%',
                scrollSnapAlign: 'start',
                position: 'relative',
                width: '100%',
                height: '70vh',
              }}
            >
              {src ? (
                <img
                  src={src}
                  alt={i === index ? `${name} — ${index + 1}/${count}` : ''}
                  loading={Math.abs(i - index) <= 1 ? 'eager' : 'lazy'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: colors.bgInput,
                    color: colors.textFaint,
                    fontSize: '2rem',
                  }}
                >
                  📱
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dot indicators */}
        {count > 1 && (
          <div
            data-testid="phone-gallery-dots"
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0',
            }}
          >
            {images.map((_, i) => (
              <button
                key={`dot-${i}`}
                type="button"
                aria-label={`${name} — image ${i + 1}`}
                aria-current={i === index}
                onClick={(e) => {
                  e.stopPropagation();
                  const el = scrollRef.current;
                  if (!el) return;
                  const slide = el.children[i] as HTMLElement | undefined;
                  if (slide) {
                    slide.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
                  }
                }}
                data-testid={i === index ? 'phone-gallery-dot-active' : `phone-gallery-dot-${i}`}
                style={{
                  width: i === index ? '1rem' : '0.45rem',
                  height: '0.45rem',
                  borderRadius: '999px',
                  border: 'none',
                  background: i === index ? colors.accent : colors.textMuted,
                  opacity: i === index ? 1 : 0.4,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'width 0.2s ease, opacity 0.2s ease',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen overlay — 100dvh vertical Reels experience */}
      {fullscreen && (
        <GalleryFullscreen
          images={images}
          initialIndex={index}
          name={name}
          onClose={closeFullscreen}
        />
      )}
    </>
  );
});

// ============================================================================
// Fullscreen viewer — 100dvh vertical Reels-style
// ============================================================================

interface GalleryFullscreenProps {
  images: readonly string[];
  initialIndex: number;
  name: string;
  onClose: () => void;
}

function GalleryFullscreen({
  images,
  initialIndex,
  name,
  onClose,
}: GalleryFullscreenProps) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = images.length;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const height = el.clientHeight;
    if (height <= 0) return;
    const newIndex = Math.round(scrollTop / height);
    if (newIndex !== index && newIndex >= 0 && newIndex < count) {
      setIndex(newIndex);
    }
  }, [index, count]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const el = scrollRef.current;
        if (!el) return;
        const forward = e.key === 'ArrowDown';
        const nextIndex = forward
          ? Math.min(index + 1, count - 1)
          : Math.max(index - 1, 0);
        const slide = el.children[nextIndex] as HTMLElement | undefined;
        if (slide) {
          slide.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }
      }
    },
    [index, count, onClose],
  );

  // Escape key listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Scroll to initial index on open
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || initialIndex === 0) return;
    const slide = el.children[initialIndex] as HTMLElement | undefined;
    if (slide) {
      el.scrollTop = slide.offsetTop;
    }
  }, [initialIndex]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      data-testid="phone-gallery-fullscreen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Close button */}
      <button
        type="button"
        aria-label="Close fullscreen"
        data-testid="phone-gallery-fullscreen-close"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '1rem',
          insetInlineEnd: '1rem',
          zIndex: 10,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: '1.2rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✕
      </button>

      {/* Vertical scroll-snap fullscreen — 100dvh */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        data-testid="phone-gallery-fullscreen-scroll"
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          width: '100%',
          height: '100dvh',
          outline: 'none',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {images.map((src, i) => (
          <div
            key={`fs-slide-${i}`}
            style={{
              flex: '0 0 100dvh',
              scrollSnapAlign: 'start',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100dvh',
            }}
          >
            {src ? (
              <img
                src={src}
                alt={`${name} — ${i + 1}/${count}`}
                loading={Math.abs(i - index) <= 1 ? 'eager' : 'lazy'}
                style={{
                  maxWidth: '96vw',
                  maxHeight: '92dvh',
                  objectFit: 'contain',
                  borderRadius: 4,
                }}
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* Dot indicators in fullscreen */}
      {count > 1 && (
        <div
          data-testid="phone-gallery-fullscreen-dots"
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            display: 'flex',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          {images.map((_, i) => (
            <span
              key={`fs-dot-${i}`}
              style={{
                width: i === index ? '0.65rem' : '0.35rem',
                height: '0.35rem',
                borderRadius: '999px',
                background: '#fff',
                opacity: i === index ? 1 : 0.4,
                transition: 'width 0.2s ease, opacity 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

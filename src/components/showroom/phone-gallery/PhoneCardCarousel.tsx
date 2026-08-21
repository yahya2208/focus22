import { memo, useCallback, useRef, useState } from 'react';
import { useThemeColors } from '../../../hooks/useThemeColors';

interface PhoneCardCarouselProps {
  images: readonly string[];
  name: string;
  aspectRatio?: string;
}

/**
 * PhoneCardCarousel — swipeable image carousel for phone cards.
 *
 * UX:
 *  - CSS scroll-snap (scroll-snap-type: x mandatory) for native swipe
 *  - One image fills the card per snap point
 *  - Small dot indicators below the image area (only when >1 image)
 *  - No autoplay, no side-peek, no crossfade
 *  - Native touch momentum
 *  - 3:4 portrait aspect ratio by default
 */
export const PhoneCardCarousel = memo(function PhoneCardCarousel({
  images,
  name,
  aspectRatio = '3 / 4',
}: PhoneCardCarouselProps) {
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = images.length;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const width = el.clientWidth;
    if (width <= 0) return;
    const newIndex = Math.round(scrollLeft / width);
    if (newIndex !== index && newIndex >= 0 && newIndex < count) {
      setIndex(newIndex);
    }
  }, [index, count]);

  if (count === 0) {
    return (
      <div
        role="img"
        aria-label={name}
        style={{
          aspectRatio,
          width: '100%',
          background: colors.bgInput,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.textFaint,
          fontSize: '2.6rem',
        }}
      >
        📱
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Scroll-snap image container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="phone-card-carousel-scroll"
        aria-label={`${name} — ${count} photos`}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          aspectRatio,
          width: '100%',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {images.map((src, i) => (
          <div
            key={`card-slide-${i}`}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'start',
              width: '100%',
              height: '100%',
            }}
          >
            {src ? (
              <img
                src={src}
                alt={i === 0 ? `${name}` : ''}
                loading={i === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <div
                role="img"
                aria-label={name}
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

      {/* Dot indicators — only when multiple images */}
      {count > 1 && (
        <div
          data-testid="phone-card-dots"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.25rem',
            padding: '0.3rem 0 0',
          }}
        >
          {images.map((_, i) => (
            <span
              key={`card-dot-${i}`}
              data-testid={i === index ? 'phone-card-dot-active' : `card-dot-${i}`}
              style={{
                width: i === index ? '0.55rem' : '0.3rem',
                height: '0.3rem',
                borderRadius: '999px',
                background: i === index ? colors.accent : 'rgba(255,255,255,0.5)',
                transition: 'width 0.15s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

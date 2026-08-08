import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ProductImageGalleryProps {
  images: readonly string[];
  name: string;
}

/**
 * Product details gallery (§3.2): main image + counter badge, thumbnail strip,
 * touch/keyboard swipe, tap → fullscreen.
 */
export const ProductImageGallery = memo(function ProductImageGallery({
  images,
  name,
}: ProductImageGalleryProps) {
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = images.length;
  const hasImages = count > 0;

  const goTo = useCallback(
    (next: number) => {
      setIndex(() => {
        const clamped = Math.min(Math.max(next, 0), Math.max(count - 1, 0));
        return clamped;
      });
    },
    [count],
  );

  const openFullscreen = useCallback(() => {
    if (!hasImages) return;
    setFullscreen(true);
  }, [hasImages]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current == null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) < 40) return;
      goTo(dx < 0 ? index + 1 : index - 1);
    },
    [goTo, index],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(index + 1);
      if (e.key === 'ArrowLeft') goTo(index - 1);
    },
    [goTo, index],
  );

  const mainImg = useMemo(() => {
    if (!hasImages) {
      return (
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
            fontSize: '3rem',
          }}
        >
          📱
        </div>
      );
    }
    const src = images[Math.min(index, count - 1)];
    if (!src) {
      return (
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
            fontSize: '3rem',
          }}
        >
          📱
        </div>
      );
    }
    return (
      <img
        src={src}
        alt={`${name} — ${index + 1}/${count}`}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }, [hasImages, images, index, count, name, colors.bgInput, colors.textFaint]);

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
        role="region"
        aria-label="product gallery"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
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
        {mainImg}
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
              key={`${src}-${i}`}
              type="button"
              aria-label={`${name} — thumbnail ${i + 1}`}
              aria-current={i === index}
              onClick={(e) => {
                e.stopPropagation();
                goTo(i);
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

import { memo, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface PhoneGalleryProps {
  images: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
}

export const PhoneGallery = memo(function PhoneGallery({
  images,
  index,
  onIndexChange,
  onClose,
  title,
  footer,
}: PhoneGalleryProps) {
  const colors = useThemeColors();
  const count = images.length;
  const current = images[Math.min(Math.max(index, 0), Math.max(count - 1, 0))];

  const prev = useCallback(() => {
    onIndexChange((Math.max(index, 0) - 1 + count) % count);
  }, [index, count, onIndexChange]);

  const next = useCallback(() => {
    onIndexChange((Math.max(index, 0) + 1) % count);
  }, [index, count, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') next();
      if (e.key === 'ArrowRight') prev();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next]);

  const navButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '44px', height: '44px',
    borderRadius: '50%',
    border: `1px solid ${colors.glassBorder}`,
    background: 'rgba(10,10,20,0.55)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: colors.text,
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Phone gallery'}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(5,5,12,0.94)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.9rem 1rem',
      }}>
        <span style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 600 }}>
          {title ?? 'Gallery'}
        </span>
        <span style={{ color: colors.textMuted, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
          {Math.min(index, count - 1) + 1} / {count}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: `1px solid ${colors.glassBorder}`, background: colors.glass,
            color: colors.text, fontSize: '1rem', cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {count > 1 && (
          <button type="button" onClick={prev} aria-label="Previous image" style={{ ...navButtonStyle, left: '0.75rem' }}>
            ‹
          </button>
        )}

        <img
          key={current}
          src={current}
          alt={title ?? `Phone image ${Math.min(index, count - 1) + 1}`}
          loading="lazy"
          style={{
            maxWidth: '100%', maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '12px',
            animation: 'scaleIn 0.25s cubic-bezier(0.22,1,0.36,1)',
            boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 60px ${colors.accentGlow}`,
          }}
        />

        {count > 1 && (
          <button type="button" onClick={next} aria-label="Next image" style={{ ...navButtonStyle, right: '0.75rem' }}>
            ›
          </button>
        )}
      </div>

      {footer && (
        <div style={{ padding: '1rem' }}>
          {footer}
        </div>
      )}
    </div>
  );
});

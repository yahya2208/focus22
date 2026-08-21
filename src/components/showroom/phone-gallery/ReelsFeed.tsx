import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useReelFeed } from './useReelFeed';
import { usePreloadImages } from './usePreloadImages';
import { centralListImages } from '../../../services/inventory-central-service';
import type { InventoryRecord } from '../../../services/inventory-service';

interface ReelsFeedProps {
  devices: readonly InventoryRecord[];
  initialDeviceId?: string;
  onSelectDevice: (deviceId: string) => void;
  onClose: () => void;
}

/**
 * ReelsFeed — full-viewport vertical Reels-style feed over ALL showroom devices.
 *
 * Every image from every device is flattened into one continuous scroll-snap
 * feed (via useReelFeed), so swiping past the last photo of a phone lands
 * seamlessly on the first photo of the next — no boundary handling needed.
 *
 * Images are resolved per-device via centralListImages (Supabase storage
 * bucket listing) because InventoryRecord.images is not populated by the
 * public DB view. A loading spinner shows while resolution is in progress.
 */
export const ReelsFeed = memo(function ReelsFeed({
  devices,
  initialDeviceId,
  onSelectDevice,
  onClose,
}: ReelsFeedProps) {
  const colors = useThemeColors();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [resolvedImages, setResolvedImages] = useState<Map<string, string[]>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const map = new Map<string, string[]>();
      await Promise.all(
        devices.map(async (device) => {
          const urls = await centralListImages(device.id);
          if (!cancelled) {
            map.set(device.id, urls);
          }
        }),
      );
      if (!cancelled) {
        setResolvedImages(map);
        setLoading(false);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [devices]);

  const slides = useReelFeed(devices, resolvedImages);
  const [currentIndex, setCurrentIndex] = useState(0);
  const count = slides.length;

  const flatSrcs = useMemo(() => slides.map((slide) => slide.src), [slides]);

  usePreloadImages(flatSrcs, currentIndex, 1);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const height = el.clientHeight;
    if (height <= 0) return;
    const newIndex = Math.round(scrollTop / height);
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < count) {
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, count]);

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
          ? Math.min(currentIndex + 1, count - 1)
          : Math.max(currentIndex - 1, 0);
        const slide = el.children[nextIndex] as HTMLElement | undefined;
        if (slide) {
          slide.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }
      }
    },
    [currentIndex, count, onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!initialDeviceId) return;
    const el = scrollRef.current;
    if (!el) return;
    const idx = slides.findIndex((slide) => slide.deviceId === initialDeviceId);
    if (idx <= 0) return;
    setCurrentIndex(idx);
    const slide = el.children[idx] as HTMLElement | undefined;
    if (slide) {
      el.scrollTop = slide.offsetTop;
    }
  }, [initialDeviceId, slides]);

  if (loading) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reels feed"
        data-testid="reels-feed"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          color: '#fff',
        }}
      >
        <span style={{ fontSize: '3rem' }}>⏳</span>
        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
          Loading images…
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 700,
            padding: '0.5rem 1.5rem',
            borderRadius: '999px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reels feed"
        data-testid="reels-feed"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          color: '#fff',
        }}
      >
        <span style={{ fontSize: '3rem' }}>📱</span>
        <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.7)' }}>
          No images available
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 700,
            padding: '0.5rem 1.5rem',
            borderRadius: '999px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reels feed"
      data-testid="reels-feed"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
      }}
    >
      <button
        type="button"
        aria-label="Close reels feed"
        data-testid="reels-feed-close"
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

      <div
        data-testid="reels-feed-counter"
        style={{
          position: 'absolute',
          top: '1rem',
          insetInlineStart: '1rem',
          zIndex: 10,
          fontSize: '0.72rem',
          fontWeight: 800,
          color: '#fff',
          background: 'rgba(0,0,0,0.6)',
          padding: '4px 12px',
          borderRadius: '999px',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        {currentIndex + 1} / {count}
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        data-testid="reels-feed-scroll"
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
        {slides.map((slide, i) => (
          <div
            key={`reels-slide-${slide.slideIndex}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slide.brand} ${slide.model} — ${i + 1} of ${count}`}
            data-testid={`reels-slide-${i}`}
            data-device-id={slide.deviceId}
            onClick={() => onSelectDevice(slide.deviceId)}
            style={{
              flex: '0 0 100dvh',
              height: '100dvh',
              scrollSnapAlign: 'start',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <img
              src={slide.src}
              alt={`${slide.brand} ${slide.model} — ${i + 1}/${count}`}
              loading={Math.abs(i - currentIndex) <= 1 ? 'eager' : 'lazy'}
              style={{
                maxWidth: '100vw',
                maxHeight: '85dvh',
                objectFit: 'contain',
                display: 'block',
              }}
            />

            <div
              style={{
                position: 'absolute',
                bottom: 0,
                insetInline: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                padding: '3rem 1.25rem 1.5rem',
                color: '#fff',
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                {slide.brand}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  lineHeight: 1.3,
                  marginTop: '0.15rem',
                }}
              >
                {slide.brand} {slide.model}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.65)',
                  marginTop: '0.15rem',
                }}
              >
                {[slide.variant, slide.city].filter(Boolean).join(' · ')}
              </span>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginTop: '0.6rem',
                }}
              >
                {slide.sellPrice != null && (
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: colors.accent }}>
                    {slide.sellPrice.toLocaleString()} د.ج
                  </span>
                )}

                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    color: slide.condition === 'New' ? colors.success : colors.info,
                    background: slide.condition === 'New' ? colors.successBg : colors.infoBg,
                    border: `1px solid ${slide.condition === 'New' ? colors.success : colors.info}44`,
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  {slide.condition}
                </span>

                {slide.totalImages > 1 && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: '#fff',
                      background: 'rgba(0,0,0,0.55)',
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    {slide.imageIndex + 1}/{slide.totalImages}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

import { memo, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';
import { PhoneGallery } from './PhoneGallery';

interface PhoneShowroomProps {
  devices: readonly InventoryRecord[];
  onSelect?: (device: InventoryRecord) => void;
  emptyText?: string;
  selectLabel?: string;
}

export const PhoneShowroom = memo(function PhoneShowroom({
  devices,
  onSelect,
  emptyText = 'لا توجد أجهزة متوفرة حالياً',
  selectLabel = 'اختيار هذا الهاتف',
}: PhoneShowroomProps) {
  const colors = useThemeColors();
  const [gallery, setGallery] = useState<{ device: InventoryRecord; index: number } | null>(null);

  if (devices.length === 0) {
    return (
      <div style={{
        textAlign: 'center', color: colors.textMuted,
        padding: '2.5rem 1rem', fontSize: '0.85rem',
      }}>
        {emptyText}
      </div>
    );
  }

  const openGallery = (device: InventoryRecord, index: number) => {
    setGallery({ device, index });
  };

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.75rem',
      }}>
        {devices.map((device) => {
          const images = device.images ?? [];
          const primary = images[0];
          return (
            <button
              key={`${device.id}-${device.variant}-${device.condition}`}
              type="button"
              onClick={() => (images.length > 0 ? openGallery(device, 0) : onSelect?.(device))}
              style={{
                textAlign: 'right', padding: 0, margin: 0, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', background: 'transparent', display: 'block',
              }}
            >
              <div style={{
                borderRadius: '18px',
                background: colors.glass,
                border: `1px solid ${colors.glassBorder}`,
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: `0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)`,
                overflow: 'hidden',
                transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), border-color 0.18s ease, box-shadow 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = colors.accent + '55';
                e.currentTarget.style.boxShadow = `0 16px 44px rgba(0,0,0,0.38), 0 0 28px ${colors.accentGlow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = colors.glassBorder;
                e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)';
              }}
            >
              <div style={{
                aspectRatio: '4 / 3',
                background: `linear-gradient(150deg, ${colors.bgCard} 0%, ${colors.bg} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                {primary ? (
                  <img
                    src={primary}
                    alt={`${device.brand} ${device.model}`}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '2.4rem', opacity: 0.55 }}>📱</span>
                )}
                {images.length > 1 && (
                  <span style={{
                    position: 'absolute', bottom: '6px', right: '6px',
                    background: 'rgba(10,10,20,0.7)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    color: '#fff', fontSize: '0.62rem', fontWeight: 700,
                    padding: '2px 7px', borderRadius: '999px',
                    border: `1px solid ${colors.glassBorder}`,
                  }}>
                    {images.length} 📷
                  </span>
                )}
              </div>

              <div style={{ padding: '0.65rem 0.7rem 0.75rem' }}>
                <div style={{ color: colors.accent, fontWeight: 700, fontSize: '0.7rem', marginBottom: '0.1rem' }}>
                  {device.brand}
                </div>
                <div style={{ color: colors.text, fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.25 }}>
                  {device.model}
                </div>
                <div style={{ color: colors.textMuted, fontSize: '0.66rem', marginTop: '0.1rem' }}>
                  {device.variant}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: '0.4rem',
                }}>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700,
                    color: device.quantity > 3 ? colors.success : colors.warning,
                    background: device.quantity > 3 ? colors.successBg : colors.warningBg,
                    padding: '1px 6px', borderRadius: '999px',
                  }}>
                    {device.quantity > 0 ? `متوفر (${device.quantity})` : 'نفد'}
                  </span>
                  {device.sellPrice != null && (
                    <span style={{ color: colors.textSecondary, fontWeight: 700, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
                      {device.sellPrice.toLocaleString()} د.ج
                    </span>
                  )}
                </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {gallery && (
        <PhoneGallery
          images={gallery.device.images ?? []}
          index={gallery.index}
          onIndexChange={(i) => setGallery({ device: gallery.device, index: i })}
          onClose={() => setGallery(null)}
          title={`${gallery.device.brand} ${gallery.device.model} — ${gallery.device.variant}`}
          footer={
            onSelect ? (
              <button
                type="button"
                onClick={() => {
                  const device = gallery.device;
                  setGallery(null);
                  onSelect(device);
                }}
                style={{
                  width: '100%', padding: '0.9rem', borderRadius: '14px',
                  border: 'none', background: colors.accent, color: '#fff',
                  fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {selectLabel}
              </button>
            ) : undefined
          }
        />
      )}
    </>
  );
});

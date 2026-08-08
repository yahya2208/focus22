import { memo, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import type { InventoryRecord } from '../../services/inventory-service';

export interface PhoneCardProps {
  device: InventoryRecord;
  compact?: boolean;
  onSelect: (device: InventoryRecord) => void;
}

/**
 * Showroom product card (§3.2): image fills the card (no whitespace), badge
 * جديد/مستعمل, multi-image indicator, name/price/condition/city. Tap ALWAYS
 * opens the details page. The old gallery-only tap is gone — gallery lives in
 * the details page.
 */
export const PhoneCard = memo(function PhoneCard({ device, compact = false, onSelect }: PhoneCardProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const images = device.images ?? [];
  const primary = images[0];

  const handleClick = useCallback(() => {
    onSelect(device);
  }, [device, onSelect]);

  const badge = (
    <span
      style={{
        position: 'absolute',
        top: '0.5rem',
        insetInlineStart: '0.5rem',
        fontSize: compact ? '0.58rem' : '0.62rem',
        fontWeight: 800,
        color: device.condition === 'New' ? colors.success : colors.info,
        background: device.condition === 'New' ? colors.successBg : colors.infoBg,
        border: `1px solid ${device.condition === 'New' ? colors.success : colors.info}44`,
        padding: '2px 8px',
        borderRadius: '999px',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 1,
      }}
    >
      {device.condition === 'New' ? t('showroom.conditionNew') : t('showroom.conditionUsed')}
    </span>
  );

  const multiIndicator = images.length > 1 && (
    <span
      aria-label={`${images.length} photos`}
      style={{
        position: 'absolute',
        bottom: '0.5rem',
        insetInlineEnd: '0.5rem',
        fontSize: '0.6rem',
        fontWeight: 800,
        color: '#fff',
        background: 'rgba(0,0,0,0.6)',
        padding: '2px 7px',
        borderRadius: '999px',
        zIndex: 1,
      }}
    >
      {images.length} 📷
    </span>
  );

  const content = (
    <>
      <div
        style={{
          aspectRatio: compact ? '1 / 1' : '4 / 3',
          position: 'relative',
          background: `linear-gradient(150deg, ${colors.bgCard} 0%, ${colors.bg} 100%)`,
          overflow: 'hidden',
        }}
      >
        {primary ? (
          <img
            src={primary}
            alt={`${device.brand} ${device.model}`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            role="img"
            aria-label={`${device.brand} ${device.model}`}
            style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: compact ? '2rem' : '2.6rem',
            }}
          >
            📱
          </div>
        )}
        {badge}
        {multiIndicator}
      </div>
      <div style={{ padding: compact ? '0.5rem 0.55rem 0.55rem' : '0.65rem 0.7rem 0.75rem' }}>
        <div style={{ color: colors.accent, fontWeight: 700, fontSize: compact ? '0.6rem' : '0.7rem', marginBottom: '0.1rem' }}>
          {device.brand}
        </div>
        <div style={{ color: colors.text, fontWeight: 600, fontSize: compact ? '0.68rem' : '0.78rem', lineHeight: 1.25 }}>
          {device.model}
        </div>
        <div style={{ color: colors.textMuted, fontSize: compact ? '0.58rem' : '0.66rem', marginTop: '0.1rem' }}>
          {device.variant}
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: '0.4rem', gap: '0.3rem', flexWrap: 'wrap',
          }}
        >
          {device.city ? (
            <span style={{ color: colors.textMuted, fontSize: '0.6rem', fontWeight: 700 }}>📍 {device.city}</span>
          ) : (
            <span style={{ color: colors.textMuted, fontSize: '0.6rem', fontWeight: 700 }}>
              {device.quantity > 0 ? t('showroom.available') : t('showroom.outOfStock')}
            </span>
          )}
          {device.sellPrice != null && (
            <span style={{ color: colors.textSecondary, fontWeight: 700, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
              {device.sellPrice.toLocaleString()} د.ج
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <button
      type="button"
      data-device-id={device.id}
      aria-label={`${device.brand} ${device.model} ${device.variant}`}
      onClick={handleClick}
      style={{
        textAlign: 'right', padding: 0, margin: 0, border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', background: 'transparent', display: 'block', width: '100%',
      }}
    >
      <div
        style={{
          borderRadius: compact ? '16px' : '18px',
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
        {content}
      </div>
    </button>
  );
});

interface PhoneShowroomProps {
  devices: readonly InventoryRecord[];
  onSelect: (device: InventoryRecord) => void;
  emptyText?: string;
}

export const PhoneShowroom = memo(function PhoneShowroom({ devices, onSelect, emptyText }: PhoneShowroomProps) {
  const colors = useThemeColors();

  if (devices.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2.5rem 1rem', fontSize: '0.85rem' }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: '0.75rem' }}>
      {devices.map((device) => (
        <PhoneCard
          key={`${device.id}-${device.variant}-${device.condition}`}
          device={device}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});

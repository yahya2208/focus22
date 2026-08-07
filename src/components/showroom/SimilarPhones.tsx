import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { PhoneCard } from './PhoneShowroom';
import type { InventoryRecord } from '../../services/inventory-service';

interface SimilarPhonesProps {
  devices: readonly InventoryRecord[];
  onSelect: (device: InventoryRecord) => void;
}

/** Horizontal similar-phones carousel (§3.2) — compact card variant. */
export const SimilarPhones = memo(function SimilarPhones({ devices, onSelect }: SimilarPhonesProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (devices.length === 0) return null;

  return (
    <section aria-label={t('phoneDetails.similarPhones')} style={{ marginTop: '1.5rem' }}>
      <h2 style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.65rem' }}>
        {t('phoneDetails.similarPhones')}
      </h2>
      <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.4rem', scrollSnapType: 'x proximity' }}>
        {devices.map((device) => (
          <div key={`${device.id}-${device.variant}-${device.condition}`} style={{ flex: '0 0 auto', width: 132, scrollSnapAlign: 'start' }}>
            <PhoneCard compact device={device} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </section>
  );
});

import { memo, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

interface RepairQRProps {
  repairCode: string;
  size?: number;
}

export const RepairQR = memo(function RepairQR({ repairCode, size = 180 }: RepairQRProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl('');
    setError(false);
    const url = window.location.origin + '/repair/track?code=' + encodeURIComponent(repairCode);
    QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      color: { dark: colors.text, light: colors.bgCard },
    }).then((result) => {
      if (!cancelled) setDataUrl(result);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [repairCode, size, colors.text, colors.bgCard]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '12px', padding: '1.5rem',
      background: colors.bgCard, border: `1px solid ${colors.borderLight}`,
      borderRadius: '16px',
    }}>
      {dataUrl && !error ? (
        <img src={dataUrl} alt={`QR ${repairCode}`}
          style={{ width: size, height: size, borderRadius: '12px' }} />
      ) : error ? (
        <div style={{
          width: size, height: size, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          color: colors.textMuted, fontSize: '0.75rem', textAlign: 'center',
          background: colors.bgInput, borderRadius: '12px',
        }}>
          <span style={{ fontSize: '2rem' }}>📵</span>
          <span>{t('repair.qrUnavailable')}</span>
        </div>
      ) : (
        <div style={{ width: size, height: size, background: colors.bgInput, borderRadius: '12px' }} />
      )}
      <span style={{ fontSize: '0.85rem', color: colors.text, textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em', fontWeight: 700 }}>
        {repairCode}
      </span>
    </div>
  );
});

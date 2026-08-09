import { useState, useEffect, memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppDispatch } from '../../store/navigation';
import { Screen } from '../../design-system/layout';
import { logScanWithMetadata } from '../../services/sticker/sticker-database';

export const StickerScanHandler = memo(function StickerScanHandler() {
  const { t, dir } = useTranslation();
  const colors = useThemeColors();
  const dispatch = useAppDispatch();

  const [serialNumber, setSerialNumber] = useState<string | null>(null);
  const [logging, setLogging] = useState(true);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s');
    if (!s || !/^ST-\d{6}$/.test(s)) {
      setError(t('sticker.scan.invalidCode'));
      setLogging(false);
      return;
    }
    setSerialNumber(s);
    try {
      logScanWithMetadata(s, 'direct', 'view_offers');
      setLogged(true);
    } catch {
      setError(t('sticker.scan.logError'));
    }
    setLogging(false);
  }, [t]);

  const handleContinue = () => {
    dispatch({ type: 'REPLACE', screen: 'home' });
  };

  return (
    <Screen>
      <div style={{
        width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '1.5rem', padding: '3rem 1rem', textAlign: 'center',
      }} dir={dir}>
        {logging && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '36px', height: '36px', border: `3px solid ${colors.borderLight}`,
              borderTopColor: colors.accent, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ color: colors.textSecondary, fontSize: '0.9rem', fontFamily: 'inherit' }}>
              {t('sticker.scan.logging')}
            </span>
          </div>
        )}

        {error && (
          <div style={{
            background: colors.dangerBg, borderRadius: '16px', padding: '1.25rem',
            border: `1px solid ${colors.danger}`, maxWidth: '400px', width: '100%',
          }}>
            <div style={{ color: colors.dangerText, fontSize: '0.9rem', fontFamily: 'inherit' }}>{error}</div>
          </div>
        )}

        {logged && serialNumber && (
          <div style={{
            background: colors.bgCard, borderRadius: '16px', padding: '2rem',
            border: `1px solid ${colors.borderLight}`, maxWidth: '400px', width: '100%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
          }}>
            <div style={{ fontSize: '2.5rem' }}>✅</div>
            <div style={{ color: colors.text, fontSize: '1.1rem', fontWeight: 700, fontFamily: 'inherit' }}>
              {t('sticker.scan.successTitle')}
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.85rem', fontFamily: 'inherit' }}>
              {t('sticker.scan.serialLabel')}
            </div>
            <div style={{
              background: colors.bgInput, borderRadius: '12px', padding: '0.6rem 1.5rem',
              border: `1px solid ${colors.borderLight}`,
              color: colors.accent, fontSize: '1.15rem', fontWeight: 800, fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}>
              {serialNumber}
            </div>
            <button
              onClick={handleContinue}
              style={{
                minHeight: '44px', background: colors.accent, color: colors.bg,
                border: 'none', borderRadius: '12px', padding: '0.75rem 2rem',
                fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem',
                cursor: 'pointer', width: '100%', marginTop: '0.5rem',
              }}
            >
              {t('sticker.scan.continue')}
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
});

import { useState, useCallback } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { createShareHandler, SHARE_PLATFORMS } from '../../core/qr/share';
import { generateQRDataUrl } from '../../core/qr/generate';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';
import { getGlobalTelemetry } from '../../core/telemetry';

export function ShareScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/?source=share`;
  const shareHandler = createShareHandler();

  const handleGenerateQr = useCallback(async () => {
    const url = await generateQRDataUrl(shareUrl, { width: 200, margin: 1 });
    setQrDataUrl(url);
    getGlobalTelemetry().track('qr_generated', { source: 'share_screen' });
  }, [shareUrl]);

  const handleShare = useCallback(async (platform: 'whatsapp' | 'telegram' | 'x' | 'facebook' | 'email' | 'copy') => {
    if (platform === 'copy') {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    } else {
      const payload = { url: shareUrl, title: 'FOCUS' };
      shareHandler.share(platform, payload);
    }
    getGlobalTelemetry().track('share_clicked', { platform });
  }, [shareUrl, shareHandler]);

  const handleChallengeFriend = useCallback(() => {
    handleGenerateQr();
  }, [handleGenerateQr]);

  return (
    <nav aria-label="Share" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '1.5rem' }}>
        {t('share.title')}
      </h1>

      <Card>
        <p style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: '1.5rem' }}>
          {t('share.subtitle')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {SHARE_PLATFORMS.map(({ platform, label, icon }) => (
            <Button
              key={platform}
              variant={platform === 'copy' ? 'secondary' : 'primary'}
              onClick={() => handleShare(platform)}
            >
              {icon} {label}
            </Button>
          ))}
        </div>

        {copied && (
          <p style={{ color: colors.success, textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem' }}>
            {t('share.copied')}
          </p>
        )}
      </Card>

      {qrDataUrl && (
        <Card style={{ marginTop: '1rem', textAlign: 'center' as const }}>
          <p style={{ color: colors.textMuted, marginBottom: '1rem' }}>{t('share.qrCode')}</p>
          <img src={qrDataUrl} alt="QR Code to share" style={{ width: '200px', height: '200px', borderRadius: '8px' }} />
        </Card>
      )}

      {!qrDataUrl && (
        <div style={{ marginTop: '1rem' }}>
          <Button variant="secondary" onClick={handleChallengeFriend}>
            {t('share.generateQR')}
          </Button>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>
          {t('share.backToHome')}
        </Button>
      </div>
    </nav>
  );
}

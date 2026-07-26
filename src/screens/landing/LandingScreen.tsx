import { useEffect } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { parseDeepLinkFromCurrentUrl, createLandingSession } from '../../core/qr/deeplink';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';
import { getGlobalTelemetry } from '../../core/telemetry';

export function LandingScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  useEffect(() => {
    const deepLink = parseDeepLinkFromCurrentUrl();
    const session = createLandingSession(deepLink);
    const telemetry = getGlobalTelemetry();

    if (session.campaignDetected) {
      telemetry.track('campaign_detected', { campaign: session.source });
    }
    telemetry.track('landing_loaded', {
      source: session.source,
      referral: session.referralDetected,
      campaign: session.campaignDetected,
    });
  }, []);

  return (
    <nav aria-label="Landing page" style={{
      padding: '2rem 1.5rem',
      maxWidth: '480px',
      margin: '0 auto',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{
          width: 80, height: 80,
          borderRadius: '20px',
          background: colors.gradient,
          border: `1px solid ${colors.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.25rem',
          marginBottom: '1.5rem',
          boxShadow: `0 8px 32px ${colors.accent}22`,
        }}>
          🧠
        </div>

        <h1 style={{
          fontSize: '2.25rem', fontWeight: 'bold', color: colors.text,
          marginBottom: '0.5rem', lineHeight: 1.15, letterSpacing: '-0.02em',
        }}>
          {t('landing.title')}
        </h1>

        <p style={{
          color: colors.textSecondary, fontSize: '1.05rem',
          marginBottom: '0.35rem', lineHeight: 1.5,
        }}>
          {t('landing.heroTagline')}
        </p>
        <p style={{
          color: colors.textMuted, fontSize: '0.85rem',
          marginBottom: '2.5rem',
        }}>
          {t('landing.heroDescription')}
        </p>

        <Card style={{
          background: colors.gradient,
          border: `1px solid ${colors.glassBorder}`,
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '1.25rem',
        }}>
          <div style={{ position: 'absolute', top: -24, right: -24, fontSize: '4rem', opacity: 0.05 }}>💡</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button onClick={() => {
              getGlobalTelemetry().track('game_started', { source: 'landing' });
              dispatch({ type: 'NAVIGATE', screen: 'consent' });
            }}>
              {t('landing.startNow')}
            </Button>
          </div>
        </Card>

        <Card padding="1rem">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { icon: '🔬', text: t('landing.scientificAccuracy') },
              { icon: '🔒', text: t('landing.privacyProtected') },
              { icon: '⚡', text: t('landing.noDownload') },
              { icon: '📱', text: t('landing.pwa') },
            ].map(({ icon, text }) => (
              <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '8px',
                  background: colors.successBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', flexShrink: 0,
                }}>
                  {icon}
                </span>
                <span style={{ color: colors.textSecondary, fontSize: '0.85rem' }}>{text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{
        textAlign: 'center', padding: '1rem 0',
        color: colors.textFaint, fontSize: '0.7rem',
      }}>
        {t('landing.testsCompleted')}
      </div>
    </nav>
  );
}

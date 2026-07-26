import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { getGlobalTelemetry } from '../../core/telemetry';

export function ConsentScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handleAgree = () => {
    getGlobalTelemetry().track('consent_granted');
    dispatch({ type: 'NAVIGATE', screen: 'message' });
  };

  const handleDecline = () => {
    getGlobalTelemetry().track('consent_withdrawn');
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  };

  return (
    <nav aria-label="Informed consent" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1.5rem' }}>
        {t('consent.title')}
      </h1>
      <Card style={{ marginBottom: '1rem' }}>
        <p style={{ color: colors.textSecondary, lineHeight: 1.6, marginBottom: '1.5rem' }}>
          {t('consent.description')}
        </p>

        <h2 style={{ color: colors.text, marginBottom: '0.5rem' }}>{t('consent.purpose')}</h2>
        <p style={{ color: colors.textSecondary, lineHeight: 1.6, marginBottom: '1rem' }}>
          {t('consent.purposeText')}
        </p>

        <h2 style={{ color: colors.text, marginBottom: '0.5rem' }}>{t('consent.dataCollection')}</h2>
        <p style={{ color: colors.textSecondary, lineHeight: 1.6, marginBottom: '1rem' }}>
          {t('consent.dataCollectionText')}
        </p>

        <h2 style={{ color: colors.text, marginBottom: '0.5rem' }}>{t('consent.voluntary')}</h2>
        <p style={{ color: colors.textSecondary, lineHeight: 1.6 }}>
          {t('consent.voluntaryText')}
        </p>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Button onClick={handleAgree}>{t('consent.agree')}</Button>
        <Button variant="danger" onClick={handleDecline}>{t('consent.decline')}</Button>
      </div>
    </nav>
  );
}

import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';

export function IntroScreen() {
  const dispatch = useAppDispatch();
  const { selectedGame } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <nav aria-label="Game introduction" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <Card>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1rem' }}>
          {t('intro.title')}
        </h1>
        <div style={{ color: colors.textSecondary, lineHeight: 1.8, marginBottom: '1.5rem' }}>
          <p style={{ marginBottom: '0.75rem' }}>
            <strong style={{ color: colors.text }}>{t('intro.howItWorks')}</strong>
          </p>
          <ol style={{ paddingLeft: '1.25rem' }}>
            <li>{t('intro.step1')}</li>
            <li>{t('intro.step2')}</li>
            <li>{t('intro.step3')}</li>
            <li>{t('intro.step4')}</li>
          </ol>
          <p style={{ marginTop: '0.75rem', color: colors.textMuted }}>
            {t('intro.gameMode')} <strong>{selectedGame ?? 'reaction-light'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'calibration' })}>
            {t('intro.startCalibration')}
          </Button>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'library' })}>
            {t('intro.back')}
          </Button>
        </div>
      </Card>
    </nav>
  );
}

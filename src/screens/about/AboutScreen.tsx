import { memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { BrandFooter } from '../../components/brand/BrandFooter';
import { versionLabel } from '../../core/version';

export const AboutScreen = memo(function AboutScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <nav aria-label="About FOCUS" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        <BrandLogo size={64} showSubtitle subtitle={t('app.subtitle')} align="center" />
      </div>
      <p style={{
        color: colors.accent, fontSize: '0.8rem', fontWeight: 600,
        letterSpacing: '0.06em', textAlign: 'center', margin: '0 0 1.5rem',
      }}>
        {t('brand.motto')}
      </p>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1.5rem' }}>
        {t('about.title')}
      </h1>
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: colors.text, marginBottom: '0.5rem' }}>{t('about.cognitivePlatform')}</h2>
        <p style={{ color: colors.textMuted, lineHeight: 1.6 }}>
          {t('about.description')}
        </p>
      </Card>
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: colors.text, marginBottom: '0.5rem' }}>{t('about.scientificFoundation')}</h2>
        <ul style={{ color: colors.textMuted, lineHeight: 1.8, paddingLeft: '1.25rem' }}>
          <li>{t('about.calibrationPrecision')}</li>
          <li>{t('about.inputLag')}</li>
          <li>{t('about.outlierRemoval')}</li>
          <li>{t('about.fatigueDetection')}</li>
          <li>{t('about.scoring')}</li>
        </ul>
      </Card>
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: colors.text, marginBottom: '0.5rem' }}>{t('about.privacy')}</h2>
        <p style={{ color: colors.textMuted, lineHeight: 1.6 }}>
          {t('about.privacyDescription')}
        </p>
      </Card>
      <p style={{ color: colors.textFaint, textAlign: 'center', fontSize: '0.875rem', marginTop: '1rem' }}>
        {versionLabel()}
      </p>
      <BrandFooter />
      <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ marginTop: '1rem' }}>
        {t('about.back')}
      </Button>
    </nav>
  );
});

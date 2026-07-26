import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';

export function AccessDeniedScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <nav aria-label="Access Denied" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
      <Card>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.danger, marginBottom: '0.5rem' }}>
          {t('accessDenied.title')}
        </h1>
        <p style={{ color: colors.textMuted, marginBottom: '1.5rem' }}>
          {t('accessDenied.message')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}>
            {t('accessDenied.signIn')}
          </Button>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>
            {t('accessDenied.backToHome')}
          </Button>
        </div>
      </Card>
    </nav>
  );
}

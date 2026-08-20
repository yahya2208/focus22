import { memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { resolveDefaultGameEntry } from '../../challenge/active-challenge-resolver';

export const PreGameMessageScreen = memo(function PreGameMessageScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <nav aria-label="Pre-game message" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <Card style={{ textAlign: 'center', width: '100%' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1rem', lineHeight: 1.4 }}>
          {t('message.title')}
        </h1>
        <p style={{ color: colors.textSecondary, fontSize: '1rem', marginBottom: '2rem' }}>
          {t('message.subtitle')}
        </p>
        <Button onClick={async () => {
          const target = await resolveDefaultGameEntry();
          dispatch({ type: 'NAVIGATE', screen: target });
        }} style={{ width: '100%' }}>
          {t('landing.startNow')}
        </Button>
      </Card>
    </nav>
  );
});

import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';

const GAMES = [
  { id: 'reaction-light' },
];

export function LibraryScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <nav aria-label="Game library" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1.5rem' }}>
        {t('library.title')}
      </h1>
      {GAMES.map((game) => (
        <Card key={game.id} style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: colors.text, marginBottom: '0.5rem' }}>{t('library.reactionLight.name')}</h2>
          <p style={{ color: colors.textMuted, marginBottom: '1rem' }}>{t('library.reactionLight.description')}</p>
          <Button onClick={() => {
            dispatch({ type: 'SELECT_GAME', gameMode: game.id });
            dispatch({ type: 'NAVIGATE', screen: 'intro' });
          }}>
            {t('library.select')}
          </Button>
        </Card>
      ))}
      <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>
        {t('library.back')}
      </Button>
    </nav>
  );
}

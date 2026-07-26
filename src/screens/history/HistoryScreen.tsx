import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';

export function HistoryScreen() {
  const dispatch = useAppDispatch();
  const { sessions } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <nav aria-label="Session history" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1.5rem' }}>
        {t('history.title')}
      </h1>
      {sessions.length === 0 ? (
        <Card>
          <p style={{ color: colors.textMuted, textAlign: 'center' }}>{t('history.noSessions')}</p>
        </Card>
      ) : (
        sessions.map((session) => (
          <Card key={session.id} style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: colors.text, fontWeight: 'bold' }}>
                  {session.gameMode}
                </p>
                <p style={{ color: colors.textMuted, fontSize: '0.875rem' }}>
                  {new Date(session.timestamp).toLocaleDateString()}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: colors.accent, fontWeight: 'bold' }}>
                  {session.score?.focusScore ?? '--'}
                </p>
                <p style={{ color: colors.textMuted, fontSize: '0.75rem' }}>
                  {session.score?.grade ?? 'N/A'}
                </p>
              </div>
            </div>
          </Card>
        ))
      )}
      <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ marginTop: '1rem' }}>
        {t('history.back')}
      </Button>
    </nav>
  );
}

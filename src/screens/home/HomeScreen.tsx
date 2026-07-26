import { useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';
import { useAuth } from '../../core/auth/AuthProvider';
import { getTodayChallenge, checkChallengeCompletion } from '../../core/gamification';
import { loadAchievements } from '../../core/gamification';
import { HomeMenu } from '../../components/navigation/HomeMenu';

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'home.greeting.morning' as const;
  if (h < 17) return 'home.greeting.afternoon' as const;
  return 'home.greeting.evening' as const;
}

export function HomeScreen() {
  const dispatch = useAppDispatch();
  const { sessions } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const userName = state.user?.displayName || state.user?.email?.split('@')[0] || '';

  const dailyChallenge = useMemo(() => {
    const challenge = getTodayChallenge();
    if (challenge.completed) return challenge;
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter((s) => new Date(s.timestamp).toISOString().split('T')[0] === today);
    const bestTimeMs = todaySessions.length > 0
      ? Math.min(...todaySessions.map((s) => Math.min(...(s.correctedRts.length > 0 ? s.correctedRts : s.rawRts))))
      : 0;
    const avgGrade = todaySessions.length > 0
      ? todaySessions.some((s) => {
          const rts = s.correctedRts.length > 0 ? s.correctedRts : s.rawRts;
          const mean = rts.reduce((a: number, b: number) => a + b, 0) / rts.length;
          return mean < 200;
        })
      : false;
    return checkChallengeCompletion(challenge, {
      bestTimeMs,
      sessionsToday: todaySessions.length,
      hasAGradeOrBetter: avgGrade,
    });
  }, [sessions]);

  const achievements = useMemo(() => loadAchievements(), []);
  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;

  const challengeTypeLabel = (type: string) => {
    switch (type) {
      case 'beat_time': return t('home.challenge.beat');
      case 'play_sessions': return t('home.challenge.play');
      case 'reach_consistency': return t('home.challenge.reach');
      default: return '';
    }
  };

  const challengeTargetLabel = (type: string, target: number) => {
    switch (type) {
      case 'beat_time': return `${target}ms`;
      case 'play_sessions': return `${target} ${t('home.challenge.sessions')}`;
      case 'reach_consistency': return t('home.challenge.grade');
      default: return '';
    }
  };

  return (
    <nav aria-label="Main navigation" style={{
      padding: '2rem 1.5rem',
      maxWidth: '480px',
      margin: '0 auto',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top bar: Greeting + Hamburger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ color: colors.textMuted, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
            {t(getGreetingKey())}
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: colors.text }}>
            {userName || t('app.title')}
          </h1>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={t('home.menu')}
          aria-expanded={menuOpen}
          style={{
            background: colors.glass,
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: '12px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '1.2rem',
            color: colors.text,
            flexShrink: 0,
          }}
        >
          ☰
        </button>
      </div>

      <HomeMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Daily Challenge Card */}
      <div
        style={{
          marginBottom: '1rem',
          background: dailyChallenge.completed
            ? `linear-gradient(135deg, ${colors.success}18 0%, ${colors.success}08 100%)`
            : `linear-gradient(135deg, ${colors.accent}18 0%, ${colors.accent}08 100%)`,
          border: `1px solid ${dailyChallenge.completed ? colors.success + '44' : colors.accent + '33'}`,
          borderRadius: '16px',
          padding: '1rem 1.25rem',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
        onClick={() => {
          dispatch({ type: 'SELECT_GAME', gameMode: 'reaction-light' });
          dispatch({ type: 'NAVIGATE', screen: 'countdown' });
        }}
        role="button"
        tabIndex={0}
      >
        <div style={{
          position: 'absolute', top: '-30%', right: '-15%',
          width: '140px', height: '140px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${dailyChallenge.completed ? colors.success : colors.accent}12 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <p style={{
              color: dailyChallenge.completed ? colors.success : colors.accent,
              fontSize: '0.6rem', textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontWeight: 700, margin: 0,
            }}>
              {dailyChallenge.completed ? t('home.challenge.completed') : t('home.challenge.today')}
            </p>
            <span style={{ fontSize: '1.25rem' }}>{dailyChallenge.completed ? '🏆' : '🎯'}</span>
          </div>
          <h3 style={{ color: colors.text, fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
            {dailyChallenge.title.replace('Today\'s Challenge: ', '')}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              background: dailyChallenge.completed ? `${colors.success}22` : `${colors.accent}22`,
              color: dailyChallenge.completed ? colors.success : colors.accent,
              padding: '0.2rem 0.6rem', borderRadius: '9999px',
              fontSize: '0.7rem', fontWeight: 600,
            }}>
              {challengeTypeLabel(dailyChallenge.type)} {challengeTargetLabel(dailyChallenge.type, dailyChallenge.target)}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <Card style={{
        marginBottom: '1.25rem',
        background: colors.gradient,
        border: `1px solid ${colors.glassBorder}`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, fontSize: '5rem', opacity: 0.06 }}>💡</div>
        <p style={{ color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          {t('home.todayFocus')}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
          {(() => {
            const today = new Date().toISOString().split('T')[0];
            const todaySessions = sessions.filter((s) => new Date(s.timestamp).toISOString().split('T')[0] === today);
            const scores = todaySessions.map((s) => s.score?.focusScore).filter((s): s is number => s != null && !isNaN(s));
            const todayFocus = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
            return todayFocus !== null ? (
              <>
                <span style={{ fontSize: '3rem', fontWeight: 'bold', color: colors.accent, lineHeight: 1 }}>{todayFocus}</span>
                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>/100</span>
              </>
            ) : (
              <span style={{ fontSize: '1.1rem', color: colors.textMuted }}>{t('home.noSessionsToday')}</span>
            );
          })()}
        </div>
        <p style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>
          {t('home.focusDescription')}
        </p>
      </Card>

      {/* Main actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <Button onClick={() => {
          dispatch({ type: 'SELECT_GAME', gameMode: 'reaction-light' });
          dispatch({ type: 'NAVIGATE', screen: 'countdown' });
        }}>
          {t('home.startMeasurement')}
        </Button>
        <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'phone-services' })} style={{ width: '100%' }}>
          {t('home.phoneServices')}
        </Button>
      </div>

      {/* Achievements — compact */}
      <div
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderRadius: '10px',
          background: colors.glass,
          border: `1px solid ${colors.glassBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'achievements' })}
        role="button"
        tabIndex={0}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem' }}>🏅</span>
          <p style={{ color: colors.textMuted, fontSize: '0.75rem', margin: 0 }}>
            {t('home.achievements')} · {unlockedCount}/{achievements.length}
          </p>
        </div>
        <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>→</span>
      </div>
    </nav>
  );
}

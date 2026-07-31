import { memo, useMemo } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { HomeMenu } from '../../components/navigation/HomeMenu';
import { Screen, Grid } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Card } from '../../design-system/components/Card';
import { Stack } from '../../design-system/components/Stack';
import { Flex } from '../../design-system/components/Flex';

import { useState } from 'react';
import { getGlobalTelemetry } from '../../core/telemetry';

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'home.greeting.morning' as const;
  if (h < 17) return 'home.greeting.afternoon' as const;
  return 'home.greeting.evening' as const;
}

function FocusLogo({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <Flex gap="sm" align="center" style={{ marginBottom: '0.25rem' }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 2px 12px ${colors.accentGlow}`,
        fontSize: '0.9rem', fontWeight: 900, color: '#fff',
        letterSpacing: '-0.02em',
      }}>
        F
      </div>
      <span style={{
        fontSize: '1.1rem', fontWeight: 800, color: colors.text,
        letterSpacing: '-0.02em',
      }}>
        FOCUS
      </span>
    </Flex>
  );
}

function ScoreRing({ score, colors }: { score: number; colors: ReturnType<typeof useThemeColors> }) {
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / 100, 1);
  const offset = circumference * (1 - progress);

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.progressBg} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={colors.accent} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: '2rem', fontWeight: 800, color: colors.text,
          lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {score}
        </span>
        <span style={{ fontSize: '0.65rem', color: colors.textMuted, marginTop: '2px' }}>/100</span>
      </div>
    </div>
  );
}

const SERVICE_ITEMS: { key: 'buyNew' | 'buyUsed' | 'sell' | 'exchange' | 'repair'; emoji: string; color: string; screen: 'phone-services' | 'repair-home' }[] = [
  { key: 'buyNew', emoji: '🟢', color: '#22c55e', screen: 'phone-services' },
  { key: 'buyUsed', emoji: '🔵', color: '#3b82f6', screen: 'phone-services' },
  { key: 'sell', emoji: '🟠', color: '#f97316', screen: 'phone-services' },
  { key: 'exchange', emoji: '🟣', color: '#a855f7', screen: 'phone-services' },
  { key: 'repair', emoji: '🔧', color: '#ef4444', screen: 'repair-home' },
];

export const HomeScreen = memo(function HomeScreen() {
  const dispatch = useAppDispatch();
  const { sessions } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const userName = state.user?.displayName || state.user?.email?.split('@')[0] || '';

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter((s) => new Date(s.timestamp).toISOString().split('T')[0] === today);
    const todayScores = todaySessions.map((s) => s.score?.focusScore).filter((s): s is number => s != null && !isNaN(s));
    const avgFocus = todayScores.length > 0 ? Math.round(todayScores.reduce((a, b) => a + b, 0) / todayScores.length) : null;

    const allBestRts = sessions.map((s) => {
      const rts = s.correctedRts.length > 0 ? [...s.correctedRts] : [...s.rawRts];
      return rts.length > 0 ? Math.min(...rts) : Infinity;
    }).filter((rt) => rt < Infinity);
    const bestTime = allBestRts.length > 0 ? Math.round(Math.min(...allBestRts)) : null;

    return {
      totalSessions: sessions.length,
      avgFocus,
      bestTime,
      streak: todaySessions.length,
    };
  }, [sessions]);

  const lastResults = useMemo(() => {
    return [...sessions].reverse().slice(0, 3).map((s) => ({
      id: s.id,
      date: new Date(s.timestamp).toLocaleDateString(),
      score: s.score?.focusScore ?? null,
      rts: s.correctedRts.length > 0 ? s.correctedRts : s.rawRts,
    }));
  }, [sessions]);

  const startTest = () => {
    getGlobalTelemetry().track('game_started', { source: 'home_start_button' });
    dispatch({ type: 'SELECT_GAME', gameMode: 'reaction-light' });
    dispatch({ type: 'NAVIGATE', screen: 'countdown' });
  };

  return (
    <Screen ariaLabel="Main navigation" bottomPad="6rem">
      <Stack gap="xl">
        {/* Top bar */}
        <Flex justify="space-between" align="center">
          <FocusLogo colors={colors} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t('home.menu')}
            aria-expanded={menuOpen}
          >
            ☰
          </Button>
        </Flex>

        <HomeMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* Greeting + Score */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
            {t(getGreetingKey())}{userName ? `, ${userName}` : ''}
          </p>
          {stats.avgFocus !== null ? (
            <ScoreRing score={stats.avgFocus} colors={colors} />
          ) : (
            <div style={{
              width: '120px', height: '120px', margin: '0 auto',
              borderRadius: '50%',
              border: `3px dashed ${colors.borderLight}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '0.75rem', color: colors.textMuted, textAlign: 'center', padding: '0.5rem' }}>
                {t('home.noSessionsToday')}
              </span>
            </div>
          )}
          <p style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '0.5rem' }}>
            {t('home.focusScore')}
          </p>
        </div>

        {/* Giant Start Button */}
        <button
          onClick={startTest}
          style={{
            width: '100%',
            padding: '1.25rem 2rem',
            borderRadius: '24px',
            border: 'none',
            background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`,
            color: '#fff',
            fontSize: '1.25rem',
            fontWeight: 800,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            boxShadow: `0 8px 32px ${colors.accentGlow}, 0 0 64px ${colors.accentGlow}`,
            transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px) scale(1.01)';
            (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${colors.accentGlow}, 0 0 80px ${colors.accentGlow}`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0) scale(1)';
            (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${colors.accentGlow}, 0 0 64px ${colors.accentGlow}`;
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>▶</span>
          {t('home.startTest')}
        </button>

        {/* Phone Services Grid */}
        <div>
          <p style={{
            color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase',
            letterSpacing: '0.1em', fontWeight: 600, marginBottom: '0.75rem',
            textAlign: 'center',
          }}>
            {t('home.services')}
          </p>
          <Grid columns={2} gap="md">
            {SERVICE_ITEMS.map((item) => (
              <Card
                key={item.key}
                variant="interactive"
                padding="lg"
                onClick={() => {
                  if (item.key === 'repair') {
                    dispatch({ type: 'NAVIGATE', screen: item.screen as 'repair-home' });
                  } else {
                    getGlobalTelemetry().track('phone_service_opened', { source: 'home_grid' });
                    dispatch({ type: 'NAVIGATE', screen: item.screen as 'phone-services' });
                  }
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.35rem' }}>{item.emoji}</span>
                  <span style={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600 }}>
                    {t(`home.services.${item.key}`)}
                  </span>
                </div>
              </Card>
            ))}
          </Grid>
        </div>

        {/* Sticker Studio */}
        <div>
          <Card
            variant="interactive"
            padding="lg"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'sticker-studio' })}
          >
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.35rem' }}>🖼️</span>
              <span style={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600 }}>
                {t('home.stickerStudio')}
              </span>
            </div>
          </Card>
        </div>

        {/* Statistics */}
        <div>
          <p style={{
            color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase',
            letterSpacing: '0.1em', fontWeight: 600, marginBottom: '0.75rem',
            textAlign: 'center',
          }}>
            {t('home.stats')}
          </p>
          <Grid columns={2} gap="md">
            {[
              { label: t('home.stats.sessions'), value: stats.totalSessions.toString() },
              { label: t('home.stats.avgFocus'), value: stats.avgFocus !== null ? `${stats.avgFocus}` : '—' },
              { label: t('home.stats.bestTime'), value: stats.bestTime !== null ? `${stats.bestTime}ms` : '—' },
              { label: t('home.stats.streak'), value: stats.streak.toString() },
            ].map((stat) => (
              <Card key={stat.label} variant="glass" padding="lg">
                <p style={{ color: colors.textMuted, fontSize: '0.65rem', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {stat.label}
                </p>
                <p style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </p>
              </Card>
            ))}
          </Grid>
        </div>

        {/* Last Results */}
        <div>
          <p style={{
            color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase',
            letterSpacing: '0.1em', fontWeight: 600, marginBottom: '0.75rem',
            textAlign: 'center',
          }}>
            {t('home.lastResults')}
          </p>
          {lastResults.length > 0 ? (
            <Stack gap="sm">
              {lastResults.map((r) => (
                <Card
                  key={r.id}
                  variant="surface"
                  padding="lg"
                  onClick={() => dispatch({ type: 'NAVIGATE', screen: 'history' })}
                >
                  <Flex justify="space-between" align="center">
                    <div>
                      <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                        {r.date}
                      </p>
                      <p style={{ color: colors.textMuted, fontSize: '0.7rem', margin: '0.15rem 0 0' }}>
                        {r.rts.length} trials
                      </p>
                    </div>
                    {r.score !== null && (
                      <span style={{
                        color: colors.accent, fontSize: '1.2rem', fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {r.score}
                      </span>
                    )}
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : (
            <Card variant="outlined" padding="lg">
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0 }}>
                  {t('home.noResults')}
                </p>
              </div>
            </Card>
          )}
        </div>
      </Stack>
    </Screen>
  );
});

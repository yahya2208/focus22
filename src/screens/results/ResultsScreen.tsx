import { useMemo, useEffect, memo } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { calculateFocusScore } from '../../core/engine/scoring';
import { analyzeConsistency } from '../../core/engine/consistency';
import { detectFatigue } from '../../core/engine/fatigue';
import { useTranslation } from '../../hooks/useTranslation';
import type { TranslationKey } from '../../i18n';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../design-system/components/Button';
import { Card } from '../../design-system/components/Card';
import { Stack } from '../../design-system/components/Stack';
import { Flex } from '../../design-system/components/Flex';
import { Screen, Grid } from '../../design-system/layout';
import { getGlobalTelemetry } from '../../core/telemetry';
import { getGlobalSessionService } from '../../core/session/service';
import { useAuth } from '../../core/auth/AuthProvider';
import { AdSpot } from '../../components/ads/AdSpot';

function StatCard({ label, value, accent, colors }: { label: string; value: string; accent?: boolean; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <Card variant="glass" padding="lg">
      <p style={{ color: colors.textMuted, fontSize: '0.65rem', margin: '0 0 0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ color: accent ? colors.accent : colors.text, fontSize: '1.15rem', fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </Card>
  );
}

function TimelineRow({ trial, rtMs, isBest, isWorst, avgMs, colors }: {
  trial: number; rtMs: number; isBest: boolean; isWorst: boolean; avgMs: number; colors: ReturnType<typeof useThemeColors>;
}) {
  const barWidth = Math.min(100, Math.max(8, (rtMs / (avgMs * 2)) * 100));
  const barColor = isBest ? colors.accent : isWorst ? colors.warning : colors.textMuted;
  return (
    <Flex gap="md" align="center" style={{ padding: '0.5rem 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ color: colors.textMuted, fontSize: '0.65rem', fontWeight: 600, minWidth: '24px', textAlign: 'right' }}>
        {trial}
      </span>
      <div style={{ flex: 1, height: '6px', background: colors.progressBg, borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '3px',
          width: `${barWidth}%`,
          background: barColor,
          transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: isBest ? `0 0 8px ${colors.accent}44` : undefined,
        }} />
      </div>
      <span style={{
        color: isBest ? colors.accent : isWorst ? colors.warning : colors.text,
        fontSize: '0.8rem', fontWeight: isBest ? 700 : 500,
        fontVariantNumeric: 'tabular-nums', minWidth: '48px', textAlign: 'right',
      }}>
        {Math.round(rtMs)}ms
      </span>
    </Flex>
  );
}

function ScoreRing({ score, colors }: { score: number; colors: ReturnType<typeof useThemeColors> }) {
  const size = 140;
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
        <span style={{ fontSize: '2.5rem', fontWeight: 800, color: colors.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
        <span style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>/100</span>
      </div>
    </div>
  );
}

export const ResultsScreen = memo(function ResultsScreen() {
  const dispatch = useAppDispatch();
  const { results, isQrFlow, currentSession } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const analysis = useMemo(() => {
    if (!results) return null;
    const consistency = analyzeConsistency(results.correctedRts);
    const fatigue = detectFatigue(results.correctedRts);
    const meanMs = consistency.meanMs;
    const score = calculateFocusScore({
      meanCorrectedMs: meanMs,
      consistencyScore: consistency.score,
      fatigueScore: fatigue.score,
      totalRounds: results.totalRounds,
    });
    return { consistency, fatigue, score };
  }, [results]);

  useEffect(() => {
    if (analysis) {
      getGlobalTelemetry().track('results_viewed', {
        focusScore: analysis.score.focusScore,
        grade: analysis.score.grade,
        isQrFlow,
      });
    }
  }, [analysis, isQrFlow]);

  if (!results || !analysis) {
    return (
      <Screen ariaLabel="Results">
        <Stack gap="lg">
          <Card variant="outlined" padding="lg">
            <p style={{ color: colors.textMuted, margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>{t('results.noResults')}</p>
          </Card>
          <Button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>{t('home.startMeasurement')}</Button>
        </Stack>
    </Screen>
  );
}

  const bestRt = Math.min(...results.correctedRts);
  const avgRt = results.correctedRts.reduce((a, b) => a + b, 0) / results.correctedRts.length;
  const maxRt = Math.max(...results.correctedRts);

  const sessionDuration = results.sessionStart && results.sessionEnd
    ? Math.round((results.sessionEnd - results.sessionStart) / 1000)
    : null;

  const earlyTaps = results.totalRounds - results.validRounds;

  const saveAndExit = () => {
    const sessionService = getGlobalSessionService();
    if (currentSession?.id && results) {
      sessionService.completeSession(currentSession.id, {
        rawRts: results.rawRts,
        correctedRts: results.correctedRts,
        totalRounds: results.totalRounds,
        validRounds: results.validRounds,
        calibration: results.calibration,
        sessionStart: results.sessionStart ?? Date.now(),
        sessionEnd: results.sessionEnd ?? Date.now(),
      });
    }
    dispatch({ type: 'SAVE_SESSION' });
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  };

  const playAgain = () => {
    getGlobalTelemetry().track('game_started', { source: 'results_play_again' });
    dispatch({ type: 'SELECT_GAME', gameMode: 'reaction-light' });
    dispatch({ type: 'NAVIGATE', screen: 'countdown' });
  };

  return (
    <Screen ariaLabel="Measurement results">
      <Stack gap="lg">
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.15rem', color: colors.text }}>
            {t('results.title')}
          </h1>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>
            {results.validRounds}/{results.totalRounds} valid trials
          </p>
        </div>

        {/* Score Ring */}
        <Card variant="glass" padding="lg">
          <div style={{ textAlign: 'center' }}>
            <ScoreRing score={analysis.score.focusScore} colors={colors} />
            <p style={{ color: colors.textMuted, marginTop: '0.75rem', fontSize: '0.85rem' }}>
              {t('results.grade')}: <strong style={{ color: colors.text }}>{analysis.score.grade}</strong>
            </p>
          </div>
        </Card>

        {/* Quick Stats */}
        <AdSpot placement="results" />
        <Grid columns={2} gap="md">
          <StatCard label={t('results.best')} value={`${Math.round(bestRt)}ms`} accent colors={colors} />
          <StatCard label={t('results.average')} value={`${Math.round(avgRt)}ms`} colors={colors} />
          <StatCard label={t('results.consistency')} value={analysis.consistency.rating} colors={colors} />
          <StatCard label={t('results.fatigue')} value={analysis.fatigue.hasFatigue ? t('results.yes') : t('results.no')} colors={colors} />
        </Grid>

        {/* Session Timing */}
        <Card variant="glass" padding="lg">
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.75rem', color: colors.text }}>Session Details</h3>
          <Grid columns={2} gap="sm">
            {results.sessionStart && (
              <div>
                <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Start</p>
                <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(results.sessionStart).toLocaleTimeString()}
                </p>
              </div>
            )}
            {results.sessionEnd && (
              <div>
                <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>End</p>
                <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(results.sessionEnd).toLocaleTimeString()}
                </p>
              </div>
            )}
            {sessionDuration !== null && (
              <div>
                <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Duration</p>
                <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{sessionDuration}s</p>
              </div>
            )}
            <div>
              <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Worst</p>
              <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{Math.round(maxRt)}ms</p>
            </div>
            <div>
              <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Std Dev</p>
              <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{analysis.consistency.sdMs.toFixed(1)}ms</p>
            </div>
            <div>
              <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Errors</p>
              <p style={{ color: earlyTaps > 0 ? colors.warning : colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{earlyTaps}</p>
            </div>
            <div>
              <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Attempts</p>
              <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{results.totalRounds}</p>
            </div>
            <div>
              <p style={{ color: colors.textMuted, fontSize: '0.6rem', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Touches</p>
              <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{results.rawRts.length}</p>
            </div>
          </Grid>
        </Card>

        {/* Session Replay */}
        <Card variant="glass" padding="lg">
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.5rem', color: colors.text }}>Session Replay</h3>
          {results.correctedRts.map((rt, i) => (
            <TimelineRow key={i} trial={i + 1} rtMs={rt} isBest={rt === bestRt} isWorst={rt === maxRt && rt !== bestRt} avgMs={avgRt} colors={colors} />
          ))}
        </Card>

        {/* AI Summary */}
        <Card variant="glass" padding="lg">
          <Flex gap="sm" align="center" style={{ marginBottom: '0.5rem' }}>
            <span style={{
              width: 28, height: 28, borderRadius: '8px',
              background: `${colors.accent}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem',
            }}>🤖</span>
            <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>AI Summary</h3>
          </Flex>
          <p style={{ color: colors.textSecondary, fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
            {analysis.score.focusScore >= 80
              ? `Excellent focus! Your reaction time of ${Math.round(avgRt)}ms with ${analysis.consistency.rating} consistency shows strong cognitive performance.`
              : analysis.score.focusScore >= 60
                ? `Good performance. Your average of ${Math.round(avgRt)}ms is solid. Focus on consistency to improve further.`
                : `Room for improvement. Your average ${Math.round(avgRt)}ms suggests practice could help. Try to stay relaxed between trials.`
            }
          </p>
        </Card>

        {/* Recommendations */}
        <Card variant="glass" padding="lg">
          <Flex gap="sm" align="center" style={{ marginBottom: '0.5rem' }}>
            <span style={{
              width: 28, height: 28, borderRadius: '8px',
              background: `${colors.accent}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem',
            }}>💡</span>
            <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{t('recommendation.title')}</h3>
          </Flex>
          {(() => {
            const grade = analysis.score.grade;
            const tier = grade === 'A' ? 'A' : grade === 'B' ? 'B' : 'C';
            const tipKeys = tier === 'A'
              ? ['recommendation.gradeA.1', 'recommendation.gradeA.2', 'recommendation.gradeA.3', 'recommendation.gradeA.4']
              : tier === 'B'
                ? ['recommendation.gradeB.1', 'recommendation.gradeB.2', 'recommendation.gradeB.3', 'recommendation.gradeB.4']
                : ['recommendation.gradeC.1', 'recommendation.gradeC.2', 'recommendation.gradeC.3', 'recommendation.gradeC.4', 'recommendation.gradeC.5'];
            return (
              <>
                <p style={{ color: colors.accent, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                  {t(`recommendation.${tier === 'A' ? 'excellent' : tier === 'B' ? 'good' : 'fair'}` as const)}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {tipKeys.map((key) => (
                    <li key={key} style={{ color: colors.textSecondary, fontSize: '0.8rem', lineHeight: 1.6, padding: '0.15rem 0' }}>
                      {t(key as TranslationKey)}
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
        </Card>

        {/* Actions */}
        <Stack gap="sm" style={{ paddingBottom: '1rem' }}>
          <Button variant="primary" onClick={playAgain} fullWidth>
            {t('results.playAgain')}
          </Button>
          <Button variant="secondary" onClick={saveAndExit} fullWidth>
            {t('results.saveAndExit')}
          </Button>
          {authState.status !== 'authenticated' && (
            <Button variant="outline" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'register' })} fullWidth>
              {t('results.register')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} fullWidth>
            {t('results.home')}
          </Button>
        </Stack>
      </Stack>
    </Screen>
  );
});

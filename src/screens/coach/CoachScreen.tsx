import { useState, useMemo } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import {
  createCoachEngine,
  buildCognitiveInput,
  type CoachState,
  type ReportPeriod,
  type SessionSnapshot,
} from '../../ai/coach';

type Tab = 'overview' | 'trends' | 'goals' | 'insights' | 'passport';

function toSnapshot(s: { id: string; timestamp: number; rawRts: readonly number[]; correctedRts: readonly number[]; gameMode: string }): SessionSnapshot {
  const rts = s.correctedRts.length > 0 ? s.correctedRts : s.rawRts;
  const sorted = [...rts].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n > 0 ? rts.reduce((a, b) => a + b, 0) / n : 0;
  const median = n > 0 ? (sorted[Math.floor(n / 2)] ?? 0) : 0;
  const variance = n > 0 ? rts.reduce((a, v) => a + (v - mean) ** 2, 0) / n : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const consistencyScore = Math.max(0, Math.min(1, 1 - cv));
  const fatigueIndex = n > 5 ? Math.min(1, cv * 0.5) : 0;
  const focusScore = n > 0 ? Math.min(100, Math.round(consistencyScore * 70 + (1 - fatigueIndex) * 30)) : 0;

  return {
    id: s.id,
    timestamp: s.timestamp,
    duration: n * 2000,
    meanRT: mean,
    medianRT: median,
    consistencyScore,
    fatigueIndex,
    fatigueScore: fatigueIndex * 100,
    focusScore,
    accuracy: 1 - (n > 0 ? rts.filter((r) => r < 150 || r > 2000).length / n : 0),
    calibrationConfidence: 0.8,
    grade: focusScore >= 80 ? 'A' : focusScore >= 60 ? 'B' : focusScore >= 40 ? 'C' : 'D',
    roundCount: n,
  };
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors = useThemeColors();
  const colorMap: Record<string, { bg: string; text: string }> = {
    high: { bg: colors.successBg, text: colors.successText },
    medium: { bg: colors.warningBg, text: colors.warningText },
    low: { bg: colors.dangerBg, text: colors.dangerText },
  };
  const c = colorMap[level] ?? colorMap['medium']!;
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '0.25rem 0.65rem', borderRadius: '9999px',
      fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}>
      {level}
    </span>
  );
}

function TrendArrow({ direction }: { direction: string }) {
  const colors = useThemeColors();
  const arrows: Record<string, string> = {
    improving: '↑', regressing: '↓', plateau: '→', unstable: '↕', recovering: '↗', accelerating: '↑↑', decelerating: '↓',
  };
  const dirColors: Record<string, string> = {
    improving: colors.success, regressing: colors.danger, plateau: colors.textFaint,
    unstable: colors.warning, recovering: colors.info, accelerating: colors.success, decelerating: colors.danger,
  };
  return <span style={{ color: dirColors[direction] ?? colors.textFaint, fontSize: '1.1rem' }}>{arrows[direction] ?? '?'}</span>;
}

function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const colors = useThemeColors();
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ background: colors.progressBg, borderRadius: '9999px', height: '6px', overflow: 'hidden' }}>
      <div style={{ background: colors.accent, height: '100%', width: `${pct}%`, transition: 'width 0.3s', borderRadius: '9999px' }} />
    </div>
  );
}

function OverviewTab({ state }: { state: CoachState }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { performance, confidence, recommendations, goals } = state;
  const dims = ['reactionTime', 'consistency', 'fatigue', 'calibration', 'focusScore', 'accuracy'] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Confidence ring */}
      <Card style={{ background: colors.gradient, border: `1px solid ${colors.glassBorder}`, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem' }}>{t('coach.confidenceLevel')}</h3>
          <ConfidenceBadge level={confidence.level} />
        </div>
        <p style={{ color: colors.textMuted, margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>{confidence.explanation}</p>
        <ProgressBar value={confidence.score} />
        <p style={{ color: colors.textFaint, fontSize: '0.7rem', marginTop: '0.25rem' }}>{Math.round(confidence.score)}%</p>
      </Card>

      {/* Performance dimensions - grid cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
        {dims.map((d) => {
          const dim = performance[d];
          return (
            <div key={d} style={{
              background: colors.glass,
              border: `1px solid ${colors.glassBorder}`,
              borderRadius: '10px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <p style={{ color: colors.textMuted, fontSize: '0.55rem', textTransform: 'capitalize' as const, margin: '0 0 0.15rem' }}>
                {d.replace(/([A-Z])/g, ' $1')}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>
                  {typeof dim.current === 'number' ? dim.current.toFixed(1) : String(dim.current)}
                </span>
                <TrendArrow direction={dim.trend} />
              </div>
              <p style={{ color: colors.textFaint, fontSize: '0.55rem', margin: '0.1rem 0 0' }}>{dim.rating}</p>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <Card>
        <h3 style={{ color: colors.text, margin: '0 0 0.75rem 0', fontSize: '0.85rem' }}>{t('coach.topRecommendations')}</h3>
        {recommendations.slice(0, 3).map((r) => (
          <div key={r.id} style={{
            padding: '0.6rem 0',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <p style={{ color: colors.text, margin: 0, fontSize: '0.8rem' }}>{r.message}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span style={{ color: colors.accent, fontSize: '0.65rem' }}>{r.category}</span>
              <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>{r.researchTag}</span>
            </div>
          </div>
        ))}
        {recommendations.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('coach.noRecommendations')}</p>}
      </Card>

      {/* Goals */}
      <Card>
        <h3 style={{ color: colors.text, margin: '0 0 0.75rem 0', fontSize: '0.85rem' }}>{t('coach.activeGoals')}</h3>
        {goals.filter((g) => g.status === 'active').map((g) => (
          <div key={g.id} style={{ padding: '0.4rem 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ color: colors.text, margin: 0, fontSize: '0.8rem' }}>{g.title}</p>
              <span style={{ color: colors.accent, fontSize: '0.75rem', fontWeight: 600 }}>{Math.round(g.progress)}%</span>
            </div>
            <ProgressBar value={g.progress} />
            <p style={{ color: colors.textFaint, margin: 0, fontSize: '0.65rem', marginTop: '0.15rem' }}>{g.currentValue} / {g.targetValue} {g.unit}</p>
          </div>
        ))}
        {goals.filter((g) => g.status === 'active').length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('coach.noActiveGoals')}</p>}
      </Card>
    </div>
  );
}

function TrendsTab({ state }: { state: CoachState }) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {state.trends.map((trend) => (
        <Card key={trend.dimension}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem', textTransform: 'capitalize' }}>{trend.dimension}</h3>
              <p style={{ color: colors.textFaint, margin: 0, fontSize: '0.65rem' }}>Magnitude: {trend.magnitude.toFixed(3)} · p={trend.statisticalSignificance.toFixed(3)}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <TrendArrow direction={trend.direction} />
              <span style={{ color: colors.text, textTransform: 'capitalize', fontSize: '0.8rem' }}>{trend.direction}</span>
            </div>
          </div>
          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '40px' }}>
            {trend.dataPoints.slice(-20).map((dp, i) => (
              <div
                key={i}
                title={`${dp.date}: ${dp.value.toFixed(2)}`}
                style={{ flex: 1, background: colors.accent, height: `${Math.max(4, (dp.value / 500) * 100)}%`, borderRadius: '2px', minWidth: '3px' }}
              />
            ))}
          </div>
          {trend.dataPoints.length === 0 && <p style={{ color: colors.textFaint, fontSize: '0.7rem', marginTop: '0.4rem' }}>{t('coach.noDataPoints')}</p>}
        </Card>
      ))}
      {state.trends.length === 0 && <Card><p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('coach.noTrends')}</p></Card>}
    </div>
  );
}

function GoalsTab({ state }: { state: CoachState }) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {state.goals.length === 0 && <Card><p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('coach.noGoals')}</p></Card>}
      {state.goals.map((g) => (
        <Card key={g.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem' }}>{g.title}</h3>
            <span style={{
              color: g.status === 'completed' ? colors.success : g.status === 'overdue' ? colors.danger : g.status === 'adapted' ? colors.warning : colors.accent,
              fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600,
            }}>{g.status}</span>
          </div>
          <p style={{ color: colors.textMuted, margin: '0 0 0.5rem 0', fontSize: '0.75rem' }}>{g.description}</p>
          <ProgressBar value={g.progress} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
            <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>{g.currentValue} / {g.targetValue} {g.unit}</span>
            <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>{Math.round(g.progress)}%</span>
          </div>
          <p style={{ color: colors.textFaint, fontSize: '0.6rem', marginTop: '0.35rem' }}>Due: {new Date(g.deadline).toLocaleDateString()} · {g.researchTag}</p>
        </Card>
      ))}
    </div>
  );
}

function InsightsTab({ state }: { state: CoachState }) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {state.insights.length === 0 && <Card><p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('coach.noInsights')}</p></Card>}
      {state.insights.map((ins) => (
        <Card key={ins.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
            <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem', flex: 1 }}>{ins.text}</h3>
            <ConfidenceBadge level={ins.confidence.level} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: colors.accent, fontSize: '0.65rem' }}>{ins.category}</span>
            <span style={{ color: colors.textFaint, fontSize: '0.65rem' }}>{ins.researchTag}</span>
          </div>
          {ins.evidence.length > 0 && (
            <div style={{ marginTop: '0.35rem' }}>
              {ins.evidence.map((e, i) => (
                <p key={i} style={{ color: colors.textFaint, fontSize: '0.65rem', margin: '0.1rem 0' }}>
                  {e.metric}: {e.previous.toFixed(1)} → {e.current.toFixed(1)} ({e.direction === 'up' ? '+' : ''}{e.changePercent.toFixed(1)}%)
                </p>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function PassportTab({ state }: { state: CoachState }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { passport } = state;
  const sessions = useAppState().sessions;
  const totalSessions = sessions.length;
  const bestTime = sessions.length > 0 ? Math.min(...sessions.map((s) => Math.min(...(s.correctedRts.length > 0 ? s.correctedRts : s.rawRts)))) : 0;
  const avgTime = sessions.length > 0
    ? sessions.reduce((sum, s) => {
        const rts = s.correctedRts.length > 0 ? s.correctedRts : s.rawRts;
        return sum + (rts.length > 0 ? rts.reduce((a: number, b: number) => a + b, 0) / rts.length : 0);
      }, 0) / sessions.length
    : 0;
  const lastPlayed = sessions.length > 0 ? new Date(sessions[sessions.length - 1]!.timestamp) : null;
  const level = Math.min(20, Math.floor(totalSessions / 3) + 1);
  const grade = passport.profile.overallScore >= 80 ? 'A+' : passport.profile.overallScore >= 70 ? 'A' : passport.profile.overallScore >= 60 ? 'B+' : passport.profile.overallScore >= 50 ? 'B' : passport.profile.overallScore >= 40 ? 'C' : 'D';

  const formatLastPlayed = (d: Date | null) => {
    if (!d) return t('coach.time.never');
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return t('coach.time.justNow');
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return t('coach.time.yesterday');
    return `${diffD}d ago`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Focus Passport Card */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.accent}18 0%, ${colors.accent}08 100%)`,
        border: `1px solid ${colors.accent}33`,
        borderRadius: '18px',
        padding: '1.25rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: '-40%', right: '-20%',
          width: '200px', height: '200px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${colors.accent}15 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <p style={{ color: colors.accent, fontSize: '0.65rem', textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontWeight: 700, margin: '0 0 0.15rem' }}>Focus Passport</p>
              <h2 style={{ color: colors.text, fontSize: '2rem', fontWeight: 800, margin: 0, lineHeight: 1 }}>Level {level}</h2>
            </div>
            <div style={{
              background: colors.glass, border: `1px solid ${colors.glassBorder}`,
              borderRadius: '12px', padding: '0.5rem 0.75rem', textAlign: 'center',
              backdropFilter: 'blur(8px)',
            }}>
              <p style={{ color: colors.textMuted, fontSize: '0.55rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 0.1rem' }}>Grade</p>
              <p style={{ color: colors.accent, fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{grade}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: colors.textMuted, fontSize: '0.55rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 0.15rem' }}>Best</p>
              <p style={{ color: colors.accent, fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: 0 }}>
                {bestTime > 0 ? `${Math.round(bestTime)}` : '---'}
                <span style={{ fontSize: '0.6rem', fontWeight: 500, color: colors.textMuted }}>ms</span>
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: colors.textMuted, fontSize: '0.55rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 0.15rem' }}>Average</p>
              <p style={{ color: colors.text, fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: 0 }}>
                {avgTime > 0 ? `${Math.round(avgTime)}` : '---'}
                <span style={{ fontSize: '0.6rem', fontWeight: 500, color: colors.textMuted }}>ms</span>
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: colors.textMuted, fontSize: '0.55rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 0.15rem' }}>Sessions</p>
              <p style={{ color: colors.text, fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{totalSessions}</p>
            </div>
          </div>

          <div style={{
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '10px', padding: '0.5rem 0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Last Played</span>
            <span style={{ color: colors.text, fontSize: '0.75rem', fontWeight: 600 }}>{formatLastPlayed(lastPlayed)}</span>
          </div>
        </div>
      </div>

      {passport.strengths.length > 0 && (
        <Card>
          <h3 style={{ color: colors.text, margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Strengths</h3>
          {passport.strengths.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ color: colors.text, fontSize: '0.8rem', textTransform: 'capitalize' }}>{s.dimension}</span>
              <span style={{ color: colors.success, fontWeight: 600, fontSize: '0.8rem' }}>{s.score.toFixed(1)}</span>
            </div>
          ))}
        </Card>
      )}

      {passport.areasToImprove.length > 0 && (
        <Card>
          <h3 style={{ color: colors.text, margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Areas to Improve</h3>
          {passport.areasToImprove.map((a, i) => (
            <div key={i} style={{ padding: '0.3rem 0', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.text, fontSize: '0.8rem', textTransform: 'capitalize' }}>{a.dimension}</span>
                <span style={{ color: colors.warning, fontSize: '0.7rem' }}>{a.currentScore.toFixed(1)} → {a.targetScore.toFixed(1)}</span>
              </div>
              <p style={{ color: colors.textFaint, margin: 0, fontSize: '0.65rem' }}>{a.suggestion}</p>
            </div>
          ))}
        </Card>
      )}

      {passport.milestones.length > 0 && (
        <Card>
          <h3 style={{ color: colors.text, margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Milestones</h3>
          {passport.milestones.map((m) => (
            <div key={m.id} style={{ padding: '0.3rem 0', borderBottom: `1px solid ${colors.border}` }}>
              <p style={{ color: colors.text, margin: 0, fontSize: '0.8rem' }}>{m.title}</p>
              <p style={{ color: colors.textFaint, margin: 0, fontSize: '0.65rem' }}>{m.description} · {new Date(m.achievedAt).toLocaleDateString()}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function CoachScreen() {
  const dispatch = useAppDispatch();
  const { sessions } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('weekly');

  const tabs: readonly { id: Tab; label: string }[] = [
    { id: 'overview', label: t('coach.overview') },
    { id: 'trends', label: t('coach.trends') },
    { id: 'goals', label: t('coach.goals') },
    { id: 'insights', label: t('coach.insights') },
    { id: 'passport', label: t('coach.passport') },
  ];

  const snapshots = useMemo(() => sessions.map(toSnapshot), [sessions]);
  const engine = useMemo(() => createCoachEngine(), []);

  const state: CoachState | null = useMemo(() => {
    if (snapshots.length === 0) return null;
    const input = buildCognitiveInput(snapshots);
    return engine.analyze(input);
  }, [snapshots, engine]);

  const reportText = useMemo(() => {
    if (!state) return '';
    const report = engine.generateReport(reportPeriod, state);
    return engine.formatReport(report);
  }, [state, reportPeriod, engine]);

  const handleExport = () => {
    if (!reportText) return;
    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-coach-report-${reportPeriod}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sessions.length === 0 || !state) {
    return (
      <nav aria-label="AI Coach" style={{ padding: '2rem 1.5rem', maxWidth: '480px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1.5rem' }}>
          {t('coach.title')}
        </h1>
        <Card style={{ background: colors.glass, border: `1px solid ${colors.glassBorder}` }}>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</p>
            <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{t('coach.noData')}</p>
          </div>
        </Card>
        <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ marginTop: '1rem', width: '100%' }}>
          {t('coach.backToHome')}
        </Button>
      </nav>
    );
  }

  return (
    <nav aria-label="AI Coach" style={{ padding: '1.5rem', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 'bold', color: colors.text, margin: 0 }}>{t('coach.title')}</h1>
        <span style={{
          color: colors.textFaint, fontSize: '0.7rem',
          background: colors.glass, border: `1px solid ${colors.glassBorder}`,
          borderRadius: '8px', padding: '0.25rem 0.5rem',
        }}>{sessions.length} {t('coach.sessions')}</span>
      </div>

      {/* Tab bar - pill style */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1rem',
        overflowX: 'auto', paddingBottom: '2px',
      }} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '9999px',
              border: activeTab === tab.id ? `1px solid ${colors.accent}44` : `1px solid ${colors.glassBorder}`,
              background: activeTab === tab.id ? colors.accent : colors.glass,
              color: activeTab === tab.id ? '#fff' : colors.textMuted,
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {activeTab === 'overview' && <OverviewTab state={state} />}
        {activeTab === 'trends' && <TrendsTab state={state} />}
        {activeTab === 'goals' && <GoalsTab state={state} />}
        {activeTab === 'insights' && <InsightsTab state={state} />}
        {activeTab === 'passport' && <PassportTab state={state} />}
      </div>

      {/* Export bar */}
      <div style={{
        marginTop: '1.25rem',
        display: 'flex', gap: '0.4rem', alignItems: 'center',
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: '12px',
        padding: '0.5rem 0.75rem',
      }}>
        <select
          aria-label="Report period"
          value={reportPeriod}
          onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
          style={{
            flex: 1, padding: '0.35rem',
            borderRadius: '8px', border: `1px solid ${colors.borderLight}`,
            background: colors.bgCard, color: colors.text,
            fontSize: '0.75rem',
          }}
        >
          <option value="daily">{t('coach.dailyReport')}</option>
          <option value="weekly">{t('coach.weeklyReport')}</option>
          <option value="monthly">{t('coach.monthlyReport')}</option>
          <option value="longitudinal">{t('coach.longitudinalReport')}</option>
        </select>
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={!reportText}>
          {t('coach.export')}
        </Button>
      </div>

      <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ marginTop: '0.75rem', width: '100%' }}>
        {t('coach.backToHome')}
      </Button>
    </nav>
  );
}

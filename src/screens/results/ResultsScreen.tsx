import { useMemo, useEffect } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { calculateFocusScore } from '../../core/engine/scoring';
import { analyzeConsistency } from '../../core/engine/consistency';
import { detectFatigue } from '../../core/engine/fatigue';
import { useTranslation } from '../../hooks/useTranslation';
import type { TranslationKey } from '../../i18n';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { ProgressRing } from '../../components/shared/ProgressRing';
import { getGlobalTelemetry } from '../../core/telemetry';

const ANIM_KEYFRAMES = `
@keyframes cardSlideIn { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes cardFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes timelinePulse { 0%, 100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 8px rgba(0,210,255,0.15); } }
`;

function StaggerCard({ children, delay, style }: { children: React.ReactNode; delay: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      animation: `cardSlideIn 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      ...style,
    }}>
      {children}
    </div>
  );
}

function TimelineRow({ trial, rtMs, isBest, isWorst, avgMs, colors }: {
  trial: number; rtMs: number; isBest: boolean; isWorst: boolean; avgMs: number; colors: ReturnType<typeof useThemeColors>;
}) {
  const barWidth = Math.min(100, Math.max(8, (rtMs / (avgMs * 2)) * 100));
  const barColor = isBest ? colors.accent : isWorst ? colors.warning : colors.textMuted;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.55rem 0',
      borderBottom: `1px solid ${colors.border}`,
    }}>
      <span style={{
        color: colors.textMuted, fontSize: '0.65rem', fontWeight: 600,
        minWidth: '28px', textAlign: 'right',
      }}>
        {trial}
      </span>
      <div style={{ flex: 1, height: '8px', background: colors.progressBg, borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '4px',
          width: `${barWidth}%`,
          background: barColor,
          transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: isBest ? `0 0 8px ${colors.accent}44` : undefined,
        }} />
      </div>
      <span style={{
        color: isBest ? colors.accent : isWorst ? colors.warning : colors.text,
        fontSize: '0.85rem', fontWeight: isBest ? 700 : 500,
        fontVariantNumeric: 'tabular-nums', minWidth: '52px', textAlign: 'right',
      }}>
        {Math.round(rtMs)}ms
      </span>
      {isBest && <span style={{ color: colors.accent, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>BEST</span>}
    </div>
  );
}

export function ResultsScreen() {
  const dispatch = useAppDispatch();
  const { results, isQrFlow } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();

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
      <nav aria-label="Results" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: '14px', padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ color: colors.textMuted, margin: 0 }}>{t('results.noResults')}</p>
        </div>
        <Button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>{t('home.startMeasurement')}</Button>
      </nav>
    );
  }

  const bestRt = Math.min(...results.correctedRts);
  const avgRt = results.correctedRts.reduce((a, b) => a + b, 0) / results.correctedRts.length;
  const maxRt = Math.max(...results.correctedRts);

  const saveAndExit = () => {
    dispatch({ type: 'SAVE_SESSION' });
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  };

  const handleRegisterCTA = () => {
    getGlobalTelemetry().track('register_cta_clicked', { source: isQrFlow ? 'qr_results' : 'results' });
    dispatch({ type: 'NAVIGATE', screen: 'register' });
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM_KEYFRAMES }} />
      <nav aria-label="Measurement results" style={{ padding: '2rem 1.5rem', maxWidth: '480px', margin: '0 auto' }}>
        {/* Title */}
        <StaggerCard delay={0} style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '0.25rem' }}>
            {t('results.title')}
          </h1>
          <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>
            {results.validRounds}/{results.totalRounds} valid trials
          </p>
        </StaggerCard>

        {/* Score ring */}
        <StaggerCard delay={100} style={{ marginBottom: '1rem' }}>
          <div style={{
            background: colors.gradient, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '16px', padding: '1.25rem', textAlign: 'center',
            backdropFilter: 'blur(10px)',
          }}>
            <ProgressRing
              value={analysis.score.focusScore}
              max={100}
              label={t('results.focusScore')}
              size={140}
            />
            <p style={{ color: colors.textMuted, marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {t('results.grade')}: <strong style={{ color: colors.text }}>{analysis.score.grade}</strong>
            </p>
          </div>
        </StaggerCard>

        {/* Best */}
        <StaggerCard delay={200} style={{ marginBottom: '0.6rem' }}>
          <div style={{
            background: colors.glass, border: `1px solid ${colors.accent}33`,
            borderRadius: '14px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: `0 2px 12px ${colors.accent}11`,
          }}>
            <span style={{ color: colors.accent, fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t('results.best')}</span>
            <span style={{ color: colors.accent, fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{Math.round(bestRt)}ms</span>
          </div>
        </StaggerCard>

        {/* Average */}
        <StaggerCard delay={350} style={{ marginBottom: '0.6rem' }}>
          <div style={{
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t('results.average')}</span>
            <span style={{ color: colors.text, fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{Math.round(avgRt)}ms</span>
          </div>
        </StaggerCard>

        {/* Consistency */}
        <StaggerCard delay={500} style={{ marginBottom: '1rem' }}>
          <div style={{
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t('results.consistency')}</span>
            <span style={{ color: colors.success, fontSize: '1.5rem', fontWeight: 800 }}>{analysis.consistency.rating}</span>
          </div>
        </StaggerCard>

        {/* Session Replay Timeline */}
        <StaggerCard delay={650} style={{ marginBottom: '1rem' }}>
          <div style={{
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px', padding: '1rem', backdropFilter: 'blur(10px)',
          }}>
            <h3 style={{ color: colors.text, margin: '0 0 0.6rem 0', fontSize: '0.85rem', fontWeight: 600 }}>Session Replay</h3>
            {results.correctedRts.map((rt, i) => (
              <TimelineRow
                key={i}
                trial={i + 1}
                rtMs={rt}
                isBest={rt === bestRt}
                isWorst={rt === maxRt && rt !== bestRt}
                avgMs={avgRt}
                colors={colors}
              />
            ))}
          </div>
        </StaggerCard>

        {/* AI Summary */}
        <StaggerCard delay={800} style={{ marginBottom: '1rem' }}>
          <div style={{
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px', padding: '1rem', backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{
                width: 28, height: 28, borderRadius: '8px',
                background: `${colors.accent}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem',
              }}>🤖</span>
              <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem' }}>AI Summary</h3>
            </div>
            <p style={{ color: colors.textSecondary, fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
              {analysis.score.focusScore >= 80
                ? `Excellent focus! Your reaction time of ${Math.round(avgRt)}ms with ${analysis.consistency.rating} consistency shows strong cognitive performance.`
                : analysis.score.focusScore >= 60
                  ? `Good performance. Your average of ${Math.round(avgRt)}ms is solid. Focus on consistency to improve further.`
                  : `Room for improvement. Your average ${Math.round(avgRt)}ms suggests practice could help. Try to stay relaxed between trials.`
              }
            </p>
          </div>
        </StaggerCard>

        {/* Detailed stats */}
        <StaggerCard delay={950} style={{ marginBottom: '1.5rem' }}>
          <div style={{
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px', padding: '1rem', backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              {[
                { label: t('results.mean'), value: `${analysis.consistency.meanMs.toFixed(0)}ms` },
                { label: t('results.sd'), value: `${analysis.consistency.sdMs.toFixed(1)}ms` },
                { label: t('results.cv'), value: `${(analysis.consistency.cv * 100).toFixed(1)}%` },
                { label: t('results.iqr'), value: `${analysis.consistency.iqrMs.toFixed(1)}ms` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ color: colors.textMuted, fontSize: '0.65rem', margin: '0 0 0.15rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{label}</p>
                  <p style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </StaggerCard>

        {/* Scientific Recommendation Card */}
        <StaggerCard delay={1050} style={{ marginBottom: '1rem' }}>
          <div style={{
            background: colors.glass,
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px',
            padding: '1rem',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{
                width: 28, height: 28, borderRadius: '8px',
                background: `${colors.accent}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem',
              }}>💡</span>
              <h3 style={{ color: colors.text, margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{t('recommendation.title')}</h3>
            </div>

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
                  <p style={{ color: colors.accent, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                    {t(`recommendation.${tier === 'A' ? 'excellent' : tier === 'B' ? 'good' : 'fair'}` as const)}
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {tipKeys.map((key) => (
                      <li key={key} style={{
                        color: colors.textSecondary, fontSize: '0.8rem', lineHeight: 1.6,
                        padding: '0.2rem 0',
                      }}>
                        {t(key as TranslationKey)}
                      </li>
                    ))}
                  </ul>
                  <p style={{ color: colors.textMuted, fontSize: '0.6rem', marginTop: '0.6rem', fontStyle: 'italic' }}>
                    {t('recommendation.disclaimer')}
                  </p>
                </>
              );
            })()}
          </div>
        </StaggerCard>

        {/* PRIMARY CTA — Create Account */}
        <StaggerCard delay={1150} style={{ marginBottom: '0.75rem' }}>
          <div style={{
            background: `linear-gradient(135deg, ${colors.accent}12 0%, ${colors.accent}06 100%)`,
            border: `1px solid ${colors.accent}33`,
            borderRadius: '14px',
            padding: '1rem',
            textAlign: 'center',
          }}>
            <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
              {t('results.createAccountTitle')}
            </p>
            <p style={{ color: colors.textSecondary, fontSize: '0.75rem', margin: '0 0 0.75rem 0', lineHeight: 1.4 }}>
              {t('results.createAccountDesc')}
            </p>
            <Button onClick={handleRegisterCTA} style={{ width: '100%' }}>
              {t('results.createAccount')}
            </Button>
          </div>
        </StaggerCard>

        {/* Secondary actions */}
        <StaggerCard delay={1300}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={saveAndExit} style={{ width: '100%' }}>
              {t('results.saveAndExit')}
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ width: '100%' }}>
              {t('results.discard')}
            </Button>
          </div>
        </StaggerCard>
      </nav>
    </>
  );
}

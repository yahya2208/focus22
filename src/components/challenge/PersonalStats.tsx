import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getPersonalChallengeStats } from '../../challenge/challenge-service';
import type { PersonalChallengeStats } from '../../challenge/types';

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
};

export function PersonalStats({ challengeId }: { challengeId: string }) {
  const colors = useThemeColors();
  const [stats, setStats] = useState<PersonalChallengeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPersonalChallengeStats(challengeId);
      setStats(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{
        padding: '1rem', borderRadius: '10px',
        border: `1px solid ${colors.border}`, background: colors.bgCard,
        textAlign: 'center',
      }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Loading stats...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '1rem', borderRadius: '10px',
        border: `1px solid ${colors.danger}33`, background: `${colors.danger}08`,
      }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.danger }}>{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div style={{
      padding: '1rem', borderRadius: '10px',
      border: `1px solid ${colors.border}`, background: colors.bgCard,
    }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: colors.text }}>
        Your Stats
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Best Score
          </p>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
            {stats.bestScore ?? '—'}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Best Grade
          </p>
          {stats.bestGrade ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: '6px',
              background: `${GRADE_COLORS[stats.bestGrade] ?? colors.textMuted}18`,
              color: GRADE_COLORS[stats.bestGrade] ?? colors.textMuted,
              fontSize: '0.85rem', fontWeight: 800,
            }}>
              {stats.bestGrade}
            </span>
          ) : (
            <span style={{ fontSize: '1rem', color: colors.textMuted }}>—</span>
          )}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Your Rank
          </p>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: stats.personalRank > 0 ? colors.accent : colors.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {stats.personalRank > 0 ? `#${stats.personalRank}` : '—'}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Submissions
          </p>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
            {stats.totalSubmissions}
          </p>
        </div>
      </div>

      {stats.lastSubmissionAt && (
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.7rem', color: colors.textMuted }}>
          Last play: {new Date(stats.lastSubmissionAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

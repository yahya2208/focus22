import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getChallengeLeaderboard } from '../../challenge/challenge-service';
import type { LeaderboardEntry, LeaderboardPeriod } from '../../challenge/types';

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  all_time: 'All Time',
  weekly: 'This Week',
  daily: 'Today',
};

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
};

export function Leaderboard({
  challengeId,
  limit = 20,
}: {
  challengeId: string;
  limit?: number;
}) {
  const colors = useThemeColors();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<LeaderboardPeriod>('all_time');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getChallengeLeaderboard(challengeId, period, limit);
      setEntries(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [challengeId, period, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{
      padding: '1rem', borderRadius: '10px',
      border: `1px solid ${colors.border}`, background: colors.bgCard,
    }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: colors.text }}>
        Leaderboard
      </h3>

      {/* Period Tabs */}
      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.75rem' }}>
        {(Object.keys(PERIOD_LABELS) as LeaderboardPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '0.25rem 0.6rem', borderRadius: '6px',
              border: `1px solid ${period === p ? colors.accent : colors.border}`,
              background: period === p ? `${colors.accent}18` : 'transparent',
              color: period === p ? colors.accent : colors.textMuted,
              cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: colors.danger }}>{error}</p>
      )}

      {loading ? (
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted, textAlign: 'center', padding: '1rem' }}>
          Loading...
        </p>
      ) : entries.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted, textAlign: 'center', padding: '1rem' }}>
          No submissions yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {entries.map((entry) => (
            <div
              key={`${entry.rank}-${entry.displayName}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.4rem 0.5rem', borderRadius: '6px',
                background: entry.rank <= 3 ? `${colors.accent}08` : 'transparent',
              }}
            >
              <span style={{
                minWidth: '20px', textAlign: 'center',
                fontSize: '0.75rem', fontWeight: entry.rank <= 3 ? 800 : 500,
                color: entry.rank <= 3 ? colors.accent : colors.textMuted,
              }}>
                {entry.rank}
              </span>
              <span style={{ flex: 1, fontSize: '0.8rem', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.displayName}
              </span>
              <span style={{
                fontSize: '0.8rem', fontWeight: 700,
                color: GRADE_COLORS[entry.grade] ?? colors.text,
              }}>
                {entry.focusScore}
              </span>
              <span style={{
                width: 22, height: 22, borderRadius: '5px',
                background: `${GRADE_COLORS[entry.grade] ?? colors.textMuted}18`,
                color: GRADE_COLORS[entry.grade] ?? colors.textMuted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 700,
              }}>
                {entry.grade}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

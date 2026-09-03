import { memo, useEffect, useRef } from 'react';
import { useNavigate } from '../../store/navigation';
import { useTicTacToeState } from './TicTacToeContext';
import { track } from '../../core/telemetry';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackGuard } from '../../core/navigation/BackProvider';
import type { Difficulty } from '../../core/tic-tac-toe/types';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export const TicTacToeResultsScreen = memo(function TicTacToeResultsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const {
    matchResult,
    sessionOutcome,
    difficulty,
    moveCount,
    setDifficulty,
    reset,
  } = useTicTacToeState();

  useBackGuard({
    screen: 'tic-tac-toe-results',
    beforeBack: () => {
      navigate.replace('tic-tac-toe-intro');
      return false;
    },
  });

  // Phase 10A — `game_result_view` fires once when the results UI is shown.
  // Guarded to prevent re-render duplicates (e.g. difficulty re-render). Mirrors
  // the reaction-light producer; uses the same `game: 'ttt'` / `game` domain the
  // single-player TTT screen already emits (game_start/game_complete/game_abandon).
  const resultViewFiredRef = useRef(false);
  useEffect(() => {
    if (resultViewFiredRef.current) return;
    resultViewFiredRef.current = true;
    void track({
      event: 'game_result_view',
      entityType: 'game',
      properties: { game: 'ttt' },
    });
  }, []);

  const outcomeColor =
    sessionOutcome === 'human' ? colors.success
      : sessionOutcome === 'ai' ? colors.danger
      : colors.textSecondary;

  const heading =
    matchResult === 'win' ? t('ticTacToe.resultWin')
      : matchResult === 'loss' ? t('ticTacToe.resultLoss')
      : t('ticTacToe.resultDraw');

  const handlePlayAgain = () => {
    reset();
    navigate.replace('tic-tac-toe');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 26,
      padding: '1.5rem', color: colors.text, background: colors.bg,
    }}>
      <div
        role="status"
        aria-live="polite"
        style={{
          fontSize: '1.5rem', fontWeight: 800, color: outcomeColor,
          textAlign: 'center', letterSpacing: '-0.02em',
        }}
      >
        {heading}
      </div>

      <p style={{
        margin: 0, fontSize: '0.85rem', color: colors.textSecondary,
        textAlign: 'center', maxWidth: 320,
      }}>
        {t('ticTacToe.winCondition')}
      </p>

      {/* stats card */}
      <div style={{
        display: 'flex', gap: 16, background: colors.bgCard,
        border: `1px solid ${colors.border}`, borderRadius: 14,
        padding: '14px 22px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>{moveCount}</div>
          <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{t('ticTacToe.stats.moves')}</div>
        </div>
        <div style={{ width: 1, background: colors.border }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>
            {t(`ticTacToe.difficulty.${difficulty}` as any)}
          </div>
          <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{t('ticTacToe.stats.difficulty')}</div>
        </div>
      </div>

      {/* difficulty selector for next game */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={difficulty === d}
            onClick={() => setDifficulty(d)}
            style={{
              padding: '8px 18px', borderRadius: 10,
              border: difficulty === d ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
              background: difficulty === d ? colors.glass : 'transparent',
              color: difficulty === d ? colors.accent : colors.textSecondary,
              fontWeight: difficulty === d ? 700 : 500,
              fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {t(`ticTacToe.difficulty.${d}` as any)}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handlePlayAgain}
        style={{
          padding: '14px 36px', borderRadius: 12, border: 'none',
          background: colors.accent, color: '#0a0a12',
          fontWeight: 800, fontSize: '1rem', fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {t('ticTacToe.playAgain')}
      </button>
    </div>
  );
});

import { memo, useState } from 'react';
import { useNavigate } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Difficulty } from '../../core/tic-tac-toe/types';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export const TicTacToeIntroScreen = memo(function TicTacToeIntroScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const handleStart = () => {
    navigate.push('tic-tac-toe', { difficulty });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 24,
      padding: '1.5rem', color: colors.text, background: colors.bg,
    }}>
      <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
        {t('ticTacToe.title')}
      </h1>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: colors.textSecondary }}>
          {t('ticTacToe.you')} (X) vs {t('ticTacToe.ai')} (O)
        </p>

        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>
          {t('ticTacToe.winCondition')}
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
              style={{
                padding: '8px 16px', borderRadius: 8,
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
      </div>

      <button
        type="button"
        onClick={handleStart}
        style={{
          padding: '14px 36px', borderRadius: 10, border: 'none',
          background: colors.accent, color: '#0a0a12',
          fontWeight: 700, fontSize: '1rem', fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {t('ticTacToe.playAgain')}
      </button>
    </div>
  );
});

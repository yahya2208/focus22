import { memo, useCallback, useState } from 'react';
import { useNavigate } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Difficulty } from '../../core/tic-tac-toe/types';
import { useTttMultiplayer } from '../../hooks/use-ttt-multiplayer';
import { GridMotif, MarkGlyph } from '../../core/ttt-multiplayer/visual';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

const TTT_INTRO_KEYFRAMES = `
@keyframes tttIntroRise{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){
  #ttt-intro-root *,[id^="ttt-intro"]{animation:none!important;transition:none!important}
}`;

export const TicTacToeIntroScreen = memo(function TicTacToeIntroScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const { createGame } = useTttMultiplayer();
  const [friendPending, setFriendPending] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  const handleStart = () => {
    navigate.push('tic-tac-toe', { difficulty });
  };

  const handlePlayFriend = useCallback(async () => {
    setFriendPending(true);
    setFriendError(null);
    try {
      const game = await createGame();
      navigate.push('ttt-multiplayer', {
        game: game.gameId,
        role: 'creator',
        invite: game.inviteToken,
      });
    } catch (e) {
      setFriendError(e instanceof Error ? e.message : t('ticTacToe.friendError'));
      setFriendPending(false);
    }
  }, [createGame, navigate, t]);

  return (
    <div
      id="ttt-intro-root"
      style={{
        position: 'relative',
        minHeight: '100vh',
        color: colors.text,
        background: colors.gradient,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TTT_INTRO_KEYFRAMES }} />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(120% 70% at 50% -10%, ${colors.accentGlow}, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 460,
        margin: '0 auto',
        padding: '2rem 1.25rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 18,
        boxSizing: 'border-box',
      }}>
        {/* Hero: game identity */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 12, textAlign: 'center',
          animation: 'tttIntroRise 260ms ease-out',
        }}>
          <div aria-hidden="true" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: 16, padding: '10px 14px',
          }}>
            <MarkGlyph mark="X" size={26} colors={colors} />
            <span style={{
              color: colors.textFaint, fontSize: '1.1rem', fontWeight: 300,
            }}>·</span>
            <GridMotif size={3} accentCell={{ row: 0, col: 0 }} dangerCell={{ row: 2, col: 2 }} colors={colors} cell={10} gap={3} />
            <span style={{
              color: colors.textFaint, fontSize: '1.1rem', fontWeight: 300,
            }}>·</span>
            <MarkGlyph mark="O" size={26} colors={colors} />
          </div>

          <div>
            <h1 style={{
              margin: 0, fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}>
              {t('ticTacToe.title')}
            </h1>
            <p style={{
              margin: '8px 0 0', fontSize: '0.95rem', color: colors.textSecondary,
              fontWeight: 500,
            }}>
              {t('ticTacToe.heroTagline')}
            </p>
          </div>

          {/* 9×9 / four-in-a-row identity */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {([
              ['ticTacToe.tagGrid', colors.info] as const,
              ['ticTacToe.tagRow', colors.warning] as const,
              ['ticTacToe.tagLive', colors.accent] as const,
            ]).map(([key, tint]) => (
              <span key={key} style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '5px 12px',
                borderRadius: 999, background: colors.glass,
                border: `1px solid ${colors.glassBorder}`,
                color: tint,
              }}>
                {t(key as never)}
              </span>
            ))}
          </div>
        </div>

        {/* Game mode cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            background: colors.bgCard, border: `1px solid ${colors.border}`,
            borderRadius: 18, padding: '1rem 1rem 1.25rem',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span aria-hidden="true" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: colors.accentGlow, border: `1px solid ${colors.borderLight}`,
              }}>
                <MarkGlyph mark="X" size={26} colors={colors} />
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  {t('ticTacToe.modeAiTitle')}
                </div>
                <div style={{ fontSize: '0.82rem', color: colors.textSecondary }}>
                  {t('ticTacToe.modeAiDesc')}
                </div>
              </div>
            </div>

            {/* Difficulty */}
            <div role="group" aria-label={t('ticTacToe.stats.difficulty')} style={{
              display: 'flex', gap: 6,
            }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={difficulty === d}
                  onClick={() => setDifficulty(d)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10, fontFamily: 'inherit',
                    fontSize: '0.82rem', fontWeight: difficulty === d ? 800 : 600,
                    cursor: 'pointer',
                    background: difficulty === d ? colors.accent : colors.glass,
                    color: difficulty === d ? '#0a0a12' : colors.textSecondary,
                    border: difficulty === d ? `1px solid ${colors.accent}` : `1px solid ${colors.glassBorder}`,
                  }}
                >
                  {t(`ticTacToe.difficulty.${d}` as never)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleStart}
              style={{
                padding: '14px 20px', borderRadius: 12, cursor: 'pointer',
                background: 'transparent', color: colors.accent, fontFamily: 'inherit',
                fontWeight: 800, fontSize: '1rem',
                border: `1px solid ${colors.borderLight}`,
              }}
            >
              {t('ticTacToe.playAlone')}
            </button>
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            background: colors.bgCard, border: `1px solid ${colors.accent}`,
            borderRadius: 18, padding: '1rem 1rem 1.25rem',
            boxShadow: `0 16px 40px rgba(0,0,0,0.3), 0 0 0 1px ${colors.accentGlow}, 0 0 26px ${colors.accentGlow}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span aria-hidden="true" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: colors.successBg, border: `1px solid ${colors.borderLight}`,
              }}>
                <GridMotif size={3} accentCell={{ row: 0, col: 0 }} dangerCell={{ row: 2, col: 2 }} colors={colors} cell={12} gap={3} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                    {t('ticTacToe.modeFriendTitle')}
                  </span>
                  <span style={{
                    fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.05em',
                    textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999,
                    background: colors.accent, color: '#0a0a12',
                  }}>
                    {t('ticTacToe.newBadge')}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: colors.textSecondary }}>
                  {t('ticTacToe.modeFriendDesc')}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={friendPending}
              onClick={handlePlayFriend}
              style={{
                padding: '14px 20px', borderRadius: 12, cursor: friendPending ? 'default' : 'pointer',
                background: colors.accent, color: '#0a0a12', fontFamily: 'inherit',
                fontWeight: 800, fontSize: '1rem', border: 'none',
                boxShadow: `0 10px 26px ${colors.accentGlow}`,
                opacity: friendPending ? 0.6 : 1,
              }}
            >
              {friendPending ? '…' : t('ticTacToe.playWithFriend')}
            </button>

            {friendError && (
              <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: colors.danger, textAlign: 'center' }}>
                {friendError}
              </p>
            )}
          </div>
        </div>

        {/* Rules */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '0.25rem 0.25rem 0',
        }}>
          <div style={{
            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: colors.textMuted,
          }}>
            {t('ticTacToe.rulesTitle')}
          </div>
          {(
            ['ticTacToe.rule1', 'ticTacToe.rule2', 'ticTacToe.rule3'] as const
          ).map((key) => (
            <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{
                marginTop: 5, width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: colors.accent,
              }} />
              <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                {t(key as never)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
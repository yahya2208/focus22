import { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackOverlay, useBackGuard } from '../../core/navigation/BackProvider';
import { useTttMultiplayer } from '../../hooks/use-ttt-multiplayer';
import { computeTttCellSize, computeTttBoardSide } from './TicTacToeScreen';
import { BOARD_SIZE, indexToRowCol } from '../../core/tic-tac-toe/types';
import type { MovePosition } from '../../core/tic-tac-toe/types';

const BOARD_GAP = 3;
const BOARD_PADDING = 10;

export const TttMultiplayerScreen = memo(function TttMultiplayerScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { routeParams } = useAppState();

  const gameId = (routeParams.game as string | undefined) ?? null;
  const resolvedRole = (routeParams.role as 'creator' | 'joiner' | undefined) ?? null;

  const {
    board,
    status,
    error,
    role,
    gameStatus,
    winner,
    winningLine,
    isMyTurn,
    myPerspective,
    play,
    abandon,
    createGame,
  } = useTttMultiplayer({ gameId, role: resolvedRole });

  const [cellSize, setCellSize] = useState(() =>
    computeTttCellSize(typeof window !== 'undefined' ? window.innerWidth : 360, typeof window !== 'undefined' ? window.innerHeight : 640),
  );

  useLayoutEffect(() => {
    const update = () => setCellSize(computeTttCellSize(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const [quitOpen, setQuitOpen] = useState(false);

  const [restartPending, setRestartPending] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const handlePlayAgain = useCallback(async () => {
    if (restartPending) return;
    setRestartPending(true);
    setRestartError(null);
    try {
      await createGame();
      setRestartPending(false);
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : t('tttMulti.restartFailed'));
      setRestartPending(false);
    }
  }, [restartPending, createGame, t]);

  useBackOverlay({
    kind: 'dialog',
    screen: 'ttt-multiplayer',
    isOpen: () => quitOpen,
    close: () => { setQuitOpen(false); return true; },
  });

  useBackGuard({
    screen: 'ttt-multiplayer',
    beforeBack: () => {
      if (gameStatus === 'completed' || gameStatus === 'abandoned') {
        navigate.replace('home');
        return false;
      }
      setQuitOpen(true);
      return false;
    },
  });

  const handleCellClick = useCallback(
    (position: MovePosition) => {
      if (!isMyTurn) return;
      if (board[position] !== null) return;
      void play(position).catch(() => {});
    },
    [isMyTurn, board, play],
  );

  const handleQuit = useCallback(async () => {
    setQuitOpen(false);
    await abandon();
    navigate.replace('home');
  }, [abandon, navigate]);

  const winningSet = useMemo(
    () => new Set<number>(winningLine ?? []),
    [winningLine],
  );

  const headerText = (() => {
    if (status === 'error' || error) return error ?? '…';
    if (gameStatus === 'waiting') return t('tttMulti.waiting');
    if (gameStatus === 'completed') {
      if (winner === 'draw') return t('ticTacToe.resultDraw');
      return myPerspective === 'win'
        ? t('tttMulti.youWon')
        : t('tttMulti.youLost');
    }
    if (gameStatus === 'abandoned') return t('tttMulti.opponentLeft');
    return isMyTurn ? t('tttMulti.yourTurn') : t('tttMulti.theirTurn');
  })();

  const cells = board.map((cell, i) => {
    const [row, col] = indexToRowCol(i);
    return (
      <button
        key={i}
        type="button"
        aria-label={`Cell ${i + 1}${cell ? `, ${cell}, Row ${row + 1}, Column ${col + 1}` : ', empty'}`}
        onClick={() => handleCellClick(i as MovePosition)}
        disabled={cell !== null || !isMyTurn}
        style={{
          width: cellSize, height: cellSize,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.25rem', fontWeight: 800, fontFamily: 'inherit',
          color: cell === 'X' ? colors.accent : cell === 'O' ? colors.danger : 'transparent',
          background: winningSet.has(i) ? colors.accent : colors.glass,
          border: `1px solid ${winningSet.has(i) ? colors.accent : colors.glassBorder}`,
          borderRadius: 8,
          cursor: cell !== null || !isMyTurn ? 'default' : 'pointer',
          outline: 'none', touchAction: 'manipulation',
          transition: 'background 150ms ease, border-color 150ms ease',
        }}
      >
      {cell ?? ''}
    </button>
  );
});

  return (
    <div
      id="ttt-root"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        minHeight: '100vh', padding: '1.25rem', color: colors.text, background: colors.bg,
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, gap: 8,
      }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: colors.text }}>
          {t('tttMulti.title')}
          <span style={{
            marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, color: colors.accent,
            border: `1px solid ${colors.glassBorder}`, borderRadius: 8, padding: '2px 8px',
            background: colors.glass,
          }}>
            {role === 'joiner' ? 'O' : 'X'} · {isMyTurn ? t('tttMulti.turn') : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setQuitOpen(true)}
          style={{
            padding: '10px 18px', borderRadius: 10, border: `1px solid ${colors.border}`,
            background: colors.glass, color: colors.danger,
            fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {t('ticTacToe.exit')}
        </button>
      </div>

      <div style={{
        fontSize: '0.8rem', color: colors.textSecondary, textAlign: 'center', marginBottom: 10,
      }}>
        {t('ticTacToe.winCondition')}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto',
        width: '100%', maxWidth: computeTttBoardSide(cellSize),
        background: colors.bgCard, borderRadius: 16, border: `1px solid ${colors.border}`,
        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
          gap: BOARD_GAP, padding: BOARD_PADDING,
        }}>
          {cells}
        </div>
      </div>

      <div
        id="ttt-status"
        role="status"
        aria-live="polite"
        style={{
          fontSize: '0.95rem', color: colors.textSecondary, textAlign: 'center',
          minHeight: '1.4em', marginTop: 12, fontWeight: 600,
        }}
      >
        {headerText}
      </div>

      {gameStatus === 'completed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginTop: 16 }}>
          <button
            type="button"
            disabled={restartPending}
            onClick={handlePlayAgain}
            style={{
              padding: '12px 32px', borderRadius: 10, border: 'none',
              background: colors.accent, color: '#0a0a12', fontWeight: 800,
              fontSize: '1rem', fontFamily: 'inherit', cursor: restartPending ? 'default' : 'pointer',
              opacity: restartPending ? 0.6 : 1,
            }}
          >
            {restartPending ? '…' : t('ticTacToe.playAgain')}
          </button>
          {restartError && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: colors.danger }}>
              {restartError}
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate.replace('home')}
            style={{
              padding: '10px 24px', borderRadius: 10, border: `1px solid ${colors.border}`,
              background: 'transparent', color: colors.textSecondary, fontWeight: 600,
              fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {t('ticTacToe.exit')}
          </button>
        </div>
      )}

      {quitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ttt-multi-quit-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }}
        >
          <div style={{
            background: colors.bgCard, border: `1px solid ${colors.border}`,
            borderRadius: 16, padding: 24, maxWidth: 340, width: '90%',
            display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center',
          }}>
            <p id="ttt-multi-quit-title" style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: colors.text, textAlign: 'center' }}>
              {t('ticTacToe.stopConfirmTitle')}
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, textAlign: 'center' }}>
              {t('tttMulti.quitBody')}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setQuitOpen(false)}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: `1px solid ${colors.border}`,
                  background: 'transparent', color: colors.textSecondary,
                  fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {t('back.cancel')}
              </button>
              <button
                type="button"
                onClick={handleQuit}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: colors.danger, color: colors.dangerText,
                  fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {t('ticTacToe.stopConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

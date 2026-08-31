import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackOverlay, useBackGuard } from '../../core/navigation/BackProvider';
import { useTttMultiplayer } from '../../hooks/use-ttt-multiplayer';
import { computeTttCellSize, computeTttBoardSide } from './TicTacToeScreen';
import { BOARD_SIZE, indexToRowCol } from '../../core/tic-tac-toe/types';
import type { MovePosition } from '../../core/tic-tac-toe/types';
import { buildTttInviteUrl, copyText, nativeShare } from '../../core/ttt-multiplayer/invite';
import { GridMotif, MarkGlyph } from '../../core/ttt-multiplayer/visual';
import type { TttRole } from '../../core/ttt-multiplayer/types';

const BOARD_GAP = 3;
const BOARD_PADDING = 10;

const TTT_MULTI_KEYFRAMES = `
@keyframes tttWaitBounce{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
@keyframes tttLobbyRise{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
@keyframes tttCellPop{0%{transform:scale(.6)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes tttWinPulse{0%,100%{filter:brightness(1) drop-shadow(0 0 0 rgba(255,255,255,0))}50%{filter:brightness(1.25) drop-shadow(0 0 8px rgba(255,255,255,.45))}}
@keyframes tttWinPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes tttGridPulse{0%,100%{opacity:.4;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
@media (prefers-reduced-motion: reduce){
  #ttt-multi-root *,[id^="ttt-multi"]{animation:none!important;transition:none!important}
}`;

type InviteFeedback = 'copied' | 'shared' | 'failed' | null;

function Cell({
  index,
  value,
  isWinning,
  isLast,
  onClick,
  disabled,
  colors,
  cellSize,
}: {
  index: number;
  value: 'X' | 'O' | null;
  isWinning: boolean;
  isLast: boolean;
  onClick: () => void;
  disabled: boolean;
  colors: ReturnType<typeof useThemeColors>;
  cellSize: number;
}) {
  const [row, col] = indexToRowCol(index);
  const markColor = value === 'X' ? colors.accent : value === 'O' ? colors.danger : undefined;
  return (
    <button
      type="button"
      aria-label={`Cell ${index + 1}${value ? `, ${value}, Row ${row + 1}, Column ${col + 1}` : ', empty'}`}
      onClick={onClick}
      disabled={disabled || value !== null}
      style={{
        width: cellSize,
        height: cellSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.glass,
        border: `1px solid ${isWinning && markColor ? markColor : colors.borderLight}`,
        borderWidth: isWinning ? 2 : 1,
        borderRadius: 8,
        cursor: disabled || value !== null ? 'default' : 'pointer',
        opacity: value !== null && !isWinning ? 0.82 : 1,
        transition: 'background 150ms ease, border-color 150ms ease',
        animation: value !== null && !isWinning
          ? 'tttCellPop 0.18s ease-out'
          : isWinning
            ? 'tttWinPulse 1s ease-in-out infinite'
            : undefined,
        outline: 'none',
        touchAction: 'manipulation',
        boxShadow: isWinning && markColor
          ? `0 0 16px ${markColor}55`
          : isLast && markColor
            ? `0 0 0 2px ${markColor}`
            : undefined,
      }}
    >
      {value ? <MarkGlyph mark={value} size={Math.max(12, Math.round(cellSize * 0.62))} colors={colors} /> : null}
    </button>
  );
}

export const TttMultiplayerScreen = memo(function TttMultiplayerScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { routeParams } = useAppState();

  const gameId = (routeParams.game as string | undefined) ?? null;
  const initialInvite = (routeParams.invite as string | undefined) ?? null;

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
  } = useTttMultiplayer({ gameId, role: (routeParams.role as TttRole | undefined) ?? null });

  const [inviteToken, setInviteToken] = useState<string | null>(initialInvite);
  const [feedback, setFeedback] = useState<InviteFeedback>(null);
  const feedbackTimer = useRef<number | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [restartPending, setRestartPending] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const [cellSize, setCellSize] = useState(() =>
    computeTttCellSize(typeof window !== 'undefined' ? window.innerWidth : 375, typeof window !== 'undefined' ? window.innerHeight : 667),
  );
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    const styleId = 'ttt-multi-polish-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = TTT_MULTI_KEYFRAMES;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);

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

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  const showFeedback = useCallback((kind: InviteFeedback) => {
    setFeedback(kind);
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2600);
  }, []);

  const invokeUrl = useMemo(
    () => (inviteToken ? buildTttInviteUrl(inviteToken) : null),
    [inviteToken],
  );

  const handleCopyLink = useCallback(async (url: string) => {
    const ok = await copyText(url);
    showFeedback(ok ? 'copied' : 'failed');
  }, [showFeedback]);

  const handleShareLink = useCallback(async (url: string) => {
    const shared = await nativeShare({
      title: t('ticTacToe.title'),
      text: t('tttInvite.challenge'),
      url,
    });
    if (shared) {
      showFeedback('shared');
      return;
    }
    // Web Share unavailable or cancelled — fall back to copy.
    const ok = await copyText(url);
    showFeedback(ok ? 'copied' : 'failed');
  }, [showFeedback, t]);

  const handlePlayAgain = useCallback(async () => {
    if (restartPending) return;
    setRestartPending(true);
    setRestartError(null);
    try {
      const result = await createGame();
      setInviteToken(result.inviteToken);
      setRestartPending(false);
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : t('tttMulti.restartFailed'));
      setRestartPending(false);
    }
  }, [restartPending, createGame, t]);

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

  const winningSet = useMemo(
    () => new Set<number>(winningLine ?? []),
    [winningLine],
  );

  const isLobby = gameStatus === 'waiting' && role === 'creator' && !!invokeUrl;

  const headerText = (() => {
    if (status === 'error' || error) return error ?? '…';
    if (gameStatus === 'waiting') return t('tttLobby.waitingTitle');
    if (gameStatus === 'completed') {
      if (winner === 'draw') return t('ticTacToe.resultDraw');
      return myPerspective === 'win'
        ? t('tttMulti.youWon')
        : t('tttMulti.youLost');
    }
    if (gameStatus === 'abandoned') return t('tttMulti.opponentLeft');
    return isMyTurn ? t('tttMulti.yourTurn') : t('tttMulti.theirTurn');
  })();

  const feedbackText = feedback === 'copied'
    ? t('tttLobby.linkCopied')
    : feedback === 'shared'
      ? t('tttLobby.linkShared')
      : feedback === 'failed'
        ? t('tttLobby.copyFailed')
        : null;

  const lastMoveIndex = board.reduce<number | null>((acc, v, idx) => (v !== null ? idx : acc), null);

  const cells = board.map((cell, i) => {
    const hasCell = cell !== null;
    const isLast = !winningSet.has(i) && lastMoveIndex === i;
    return (
      <Cell
        key={i}
        index={i}
        value={cell}
        isWinning={winningSet.has(i)}
        isLast={hasCell && isLast}
        onClick={() => handleCellClick(i as MovePosition)}
        disabled={!isMyTurn}
        colors={colors}
        cellSize={cellSize}
      />
    );
  });

  const quitTitle = isLobby ? t('tttLobby.cancel') : t('ticTacToe.exit');
  const quitBody = isLobby ? t('tttLobby.cancelBody') : t('tttMulti.quitBody');

  return (
    <div
      id="ttt-multi-root"
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
      <style dangerouslySetInnerHTML={{ __html: TTT_MULTI_KEYFRAMES }} />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(115% 60% at 50% -8%, ${colors.accentGlow}, transparent 62%)`,
          pointerEvents: 'none',
        }}
      />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        padding: '1.25rem 1.25rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 14,
        boxSizing: 'border-box',
      }}>
        {/* Header: game identity + exit */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span aria-hidden="true" style={{ display: 'inline-flex' }}>
              <GridMotif size={3} accentCell={{ row: 0, col: 0 }} dangerCell={{ row: 2, col: 2 }} colors={colors} cell={10} gap={2} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t('tttMulti.title')}
              </div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 600 }}>
                9 × 9 · {t('ticTacToe.tagRow')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setQuitOpen(true)}
            aria-label={t('ticTacToe.exit')}
            style={{
              padding: '8px 16px', borderRadius: 10, border: `1px solid ${colors.borderLight}`,
              background: colors.glass, color: colors.textSecondary,
              fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {t('ticTacToe.exit')}
          </button>
        </div>

        {isLobby ? (
          /* ================= LOBBY / INVITE ================= */
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            background: colors.bgCard, border: `1px solid ${colors.borderLight}`,
            borderRadius: 20, padding: '1.25rem 1.25rem 1.5rem',
            boxShadow: '0 18px 44px rgba(0,0,0,0.3)',
            animation: 'tttLobbyRise 260ms ease-out',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <span aria-hidden="true" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 56, height: 56, borderRadius: 16,
                background: colors.accentGlow, border: `1px solid ${colors.borderLight}`,
              }}>
                <MarkGlyph mark={role === 'creator' ? 'X' : 'O'} size={34} colors={colors} />
              </span>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>
                {t('tttLobby.title')}
              </h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary }}>
                {role === 'creator' ? t('tttLobby.subtitle') : t('tttLobby.youAreO')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="ttt-invite-url" style={{
                fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: colors.textMuted,
              }}>
                {t('tttLobby.linkLabel')}
              </label>
              <input
                id="ttt-invite-url"
                type="text"
                readOnly
                value={invokeUrl ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t('tttLobby.linkLabel')}
                style={{
                  direction: 'ltr', textAlign: 'left',
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 12, fontFamily: 'inherit',
                  fontSize: '0.78rem', lineHeight: 1.4, color: colors.text,
                  background: colors.bgInput, border: `1px solid ${colors.borderLight}`,
                  outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              />
              <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textSecondary }}>
                {t('tttLobby.shareHint')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => { if (invokeUrl) void handleCopyLink(invokeUrl); }}
                style={{
                  flex: 1, padding: '13px 16px', borderRadius: 12, border: 'none',
                  background: colors.accent, color: '#0a0a12', fontFamily: 'inherit',
                  fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                }}
              >
                {t('tttLobby.copyLink')}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => { if (invokeUrl) void handleShareLink(invokeUrl); }}
                  style={{
                    flex: 1, padding: '13px 16px', borderRadius: 12, fontFamily: 'inherit',
                    background: 'transparent', color: colors.accent,
                    fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                    border: `1px solid ${colors.accent}`,
                  }}
                >
                  {t('tttLobby.shareLink')}
                </button>
              )}
            </div>

            <div role="status" aria-live="polite" style={{
              minHeight: '1.2em', textAlign: 'center',
              fontSize: '0.85rem', fontWeight: 700,
              color: feedback === 'failed' ? colors.danger : colors.success,
            }}>
              {feedbackText ?? ''}
            </div>

            {/* Waiting */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              paddingTop: 12, borderTop: `1px solid ${colors.border}`,
            }}>
              <span aria-hidden="true" style={{
                display: 'inline-flex', animation: 'tttGridPulse 1.6s ease-in-out infinite',
              }}>
                <GridMotif size={3} accentCell={{ row: 0, col: 0 }} dangerCell={{ row: 2, col: 2 }} colors={colors} cell={14} gap={3} />
              </span>
              <span role="status" aria-live="polite" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.9rem', fontWeight: 700, color: colors.text,
              }}>
                {t('tttLobby.waitingTitle')}
                <span aria-hidden="true" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 6, height: 6, borderRadius: '50%', background: colors.accent,
                        animation: 'tttWaitBounce 1.2s ease-in-out infinite',
                        animationDelay: `${i * 0.18}s`,
                      }}
                    />
                  ))}
                </span>
              </span>
              <span style={{ fontSize: '0.78rem', color: colors.textSecondary, fontWeight: 600 }}>
                {t('tttLobby.xStartsHint')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setQuitOpen(true)}
              style={{
                alignSelf: 'center', padding: '8px 18px', borderRadius: 10,
                background: 'transparent', border: 'none',
                color: colors.danger, fontFamily: 'inherit', fontWeight: 700,
                fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              {t('tttLobby.cancel')}
            </button>
          </div>
        ) : (
          /* ================= BOARD ================= */
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span style={{
                fontSize: '0.78rem', fontWeight: 800, padding: '5px 12px',
                borderRadius: 999, background: colors.glass, border: `1px solid ${colors.glassBorder}`,
                color: colors.accent,
              }}>
                {t('tttMulti.title')}
              </span>
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '5px 12px',
                borderRadius: 999, background: colors.glass, border: `1px solid ${colors.glassBorder}`,
                color: colors.textSecondary,
              }}>
                {role === 'joiner' ? 'O' : 'X'}
              </span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '0 auto',
              width: '100%',
              maxWidth: computeTttBoardSide(cellSize),
              background: colors.bgCard,
              borderRadius: 18,
              border: `1px solid ${colors.borderLight}`,
              boxShadow: '0 18px 44px rgba(0,0,0,0.3)',
              boxSizing: 'border-box',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
                gap: BOARD_GAP,
                padding: BOARD_PADDING,
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
                minHeight: '1.4em', fontWeight: 600,
              }}
            >
              {gameStatus === 'completed' && winner !== 'draw' ? (
                <span style={{
                  color: myPerspective === 'win' ? colors.success : colors.danger,
                  fontWeight: 800,
                }}>
                  {headerText}
                </span>
              ) : (
                headerText
              )}
            </div>

            {gameStatus === 'completed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 6 }}>
                {winner === 'draw' ? (
                  <span aria-hidden="true" style={{
                    display: 'flex', gap: 12, alignItems: 'center', animation: 'tttWinPop 380ms ease-out',
                  }}>
                    <MarkGlyph mark="X" size={44} colors={colors} />
                    <MarkGlyph mark="O" size={44} colors={colors} />
                  </span>
                ) : (
                  <span aria-hidden="true" style={{ animation: 'tttWinPop 380ms ease-out', lineHeight: 0 }}>
                    <MarkGlyph mark={(winner ?? 'X') as 'X' | 'O'} size={68} colors={colors} />
                  </span>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={restartPending}
                    onClick={handlePlayAgain}
                    style={{
                      padding: '13px 32px', borderRadius: 12, border: 'none',
                      background: colors.accent, color: '#0a0a12', fontWeight: 800,
                      fontSize: '1rem', fontFamily: 'inherit', cursor: restartPending ? 'default' : 'pointer',
                      opacity: restartPending ? 0.6 : 1,
                    }}
                  >
                    {restartPending ? '…' : t('ticTacToe.playAgain')}
                  </button>
                  {restartError && (
                    <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: colors.danger }}>
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
              </div>
            )}

            {gameStatus === 'abandoned' && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => navigate.replace('home')}
                  style={{
                    padding: '10px 24px', borderRadius: 10, border: `1px solid ${colors.accent}`,
                    background: 'transparent', color: colors.accent, fontWeight: 700,
                    fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  {t('ticTacToe.exit')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

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
              {quitTitle}
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, textAlign: 'center' }}>
              {quitBody}
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
                {quitTitle}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
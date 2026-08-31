import { memo, useEffect, useCallback, useRef, useState, useLayoutEffect } from 'react';
import { useNavigate, useAppDispatch } from '../../store/navigation';
import { useTicTacToeState } from './TicTacToeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackOverlay, useBackGuard } from '../../core/navigation/BackProvider';
import { getAvailableMoves } from '../../core/tic-tac-toe/board';
import { getGlobalSessionService } from '../../core/session/service';
import { sendTicTacToeSession } from '../../services/tic-tac-toe-sender';
import type { TicTacToeMatchData } from '../../services/tic-tac-toe-sender';
import { track } from '../../core/telemetry';
import type { MovePosition } from '../../core/tic-tac-toe/types';
import { BOARD_SIZE, indexToRowCol } from '../../core/tic-tac-toe/types';
import type { CalibrationProfile } from '../../core/calibration';
import { buildAppUrl } from '../../core/base-path';
import { copyText } from '../../core/ttt-multiplayer/invite';
import { MarkGlyph } from '../../core/ttt-multiplayer/visual';

const TTT_CELL_MAX = 54;
const TTT_CELL_MIN = 24;
const BOARD_GAP = 3;
const BOARD_PADDING = 10;
const ROOT_PADDING = 20;
const RESERVED_VERTICAL = 196;
const SAFETY = 8;

/**
 * Responsive cell sizing for the 9x9 board. Returns a square cell size
 * (px) derived from the smallest available viewport dimension so the whole
 * 9x9 grid fits without internal scrolling. Clamped to a tappable floor and
 * the original design maximum.
 */
export function computeTttCellSize(viewportWidth: number, viewportHeight: number): number {
  const availWidth = viewportWidth - 2 * ROOT_PADDING - 2 * BOARD_PADDING - SAFETY;
  const availHeight = viewportHeight - RESERVED_VERTICAL - 2 * BOARD_PADDING - SAFETY;
  const side = Math.min(availWidth, availHeight);
  const usable = side - (BOARD_SIZE - 1) * BOARD_GAP - 2 * BOARD_PADDING;
  const raw = Math.floor(usable / BOARD_SIZE);
  return Math.min(Math.max(raw, TTT_CELL_MIN), TTT_CELL_MAX);
}

/** Total outer side (px) of the board container for a given square cell size. */
export function computeTttBoardSide(cellSize: number): number {
  return BOARD_SIZE * cellSize + (BOARD_SIZE - 1) * BOARD_GAP + 2 * BOARD_PADDING;
}

let audioCtx: AudioContext | null = null;

function tone(from: number, to: number, dur: number, volume: number) {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(to, audioCtx.currentTime + dur);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + dur);
}

function playMoveSound() {
  try {
    tone(520, 620, 0.09, 0.08);
  } catch { /* silent */ }
}

function playResultSound(result: 'win' | 'loss' | 'draw') {
  try {
    if (result === 'win') {
      tone(523, 740, 0.14, 0.1);
      setTimeout(() => tone(659, 880, 0.18, 0.1), 120);
    } else if (result === 'loss') {
      tone(440, 240, 0.25, 0.1);
    } else {
      tone(392, 440, 0.18, 0.08);
    }
  } catch { /* silent */ }
}

const PLACEHOLDER_CALIBRATION: CalibrationProfile = {
  refreshRate: 60, displayLagMs: 0, inputLagMs: 0,
  confidence: 0, platform: 'unknown' as const, timestamp: 0,
};

const TTT_KEYFRAMES = `
@keyframes tttCellPop{0%{transform:scale(0.6)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes tttWinPulse{0%,100%{filter:brightness(1) drop-shadow(0 0 0 rgba(255,255,255,0))}50%{filter:brightness(1.2) drop-shadow(0 0 8px rgba(255,255,255,0.4))}}
@keyframes tttWinPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){
  #ttt-root *,[id^="ttt-"]{animation:none!important;transition:none!important}
}`;

function Cell({
  index,
  value,
  isWinning,
  isLast,
  onClick,
  disabled,
  colors,
  cellRef,
  cellSize,
}: {
  index: number;
  value: 'X' | 'O' | null;
  isWinning: boolean;
  isLast: boolean;
  onClick: () => void;
  disabled: boolean;
  colors: ReturnType<typeof useThemeColors>;
  cellRef: (el: HTMLButtonElement | null) => void;
  cellSize: number;
}) {
  const [row, col] = indexToRowCol(index);
  const markColor = value === 'X' ? colors.accent : value === 'O' ? colors.danger : undefined;
  return (
    <button
      ref={cellRef}
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
          : (isLast && markColor)
            ? `0 0 0 2px ${markColor}`
            : undefined,
      }}
    >
      {value ? <MarkGlyph mark={value} size={Math.max(12, Math.round(cellSize * 0.62))} colors={colors} /> : null}
    </button>
  );
}

export const TicTacToeScreen = memo(function TicTacToeScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    board,
    phase,
    matchMoves,
    matchResult,
    moveCount,
    difficulty,
    winningLine,
    humanMove,
    aiMove,
    reset,
  } = useTicTacToeState();

  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [cellSize, setCellSize] = useState(() =>
    computeTttCellSize(typeof window === 'undefined' ? 1000 : window.innerWidth, typeof window === 'undefined' ? 800 : window.innerHeight),
  );
  const sessionIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const playAgainRef = useRef(false);
  const quitConfirmedRef = useRef(false);
  const matchStartTimeRef = useRef<string>(new Date().toISOString());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const styleId = 'ttt-polish-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = TTT_KEYFRAMES;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);

  // Size the 9x9 board to the available viewport so all 81 cells fit
  // without internal scrolling; recompute on resize / orientation change.
  useLayoutEffect(() => {
    const update = () => {
      setCellSize(computeTttCellSize(window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useBackOverlay({
    kind: 'dialog',
    screen: 'tic-tac-toe',
    isOpen: () => stopConfirmOpen,
    close: () => { setStopConfirmOpen(false); return true; },
  });

  useBackGuard({
    screen: 'tic-tac-toe',
    beforeBack: () => {
      if (phase !== 'session-complete') {
        setStopConfirmOpen(true);
        return false;
      }
      return true;
    },
  });

  useEffect(() => {
    const sessionService = getGlobalSessionService();
    const sessionId = sessionService.startSession({ gameMode: 'tic-tac-toe' });
    sessionIdRef.current = sessionId;
    dispatch({ type: 'START_SESSION', sessionId, gameMode: 'tic-tac-toe' });
    playAgainRef.current = false;
    void track({ event: 'game_start', entityType: 'game', entityId: sessionId, properties: { game: 'ttt', size: 9 } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      const sessionId = sessionIdRef.current;
      if (sessionId && !completedRef.current) {
        getGlobalSessionService().abandonSession(sessionId, 'abandoned');
      } else if (sessionId && completedRef.current && !quitConfirmedRef.current && !playAgainRef.current) {
        void track({ event: 'game_exit', entityType: 'game', entityId: sessionId, properties: { game: 'ttt' } });
      }
    };
  }, []);

  const followCell = useCallback((_pos: MovePosition) => {
    // Intentionally a no-op: the 9x9 board is sized to fit the viewport, so
    // there is no internal overflow to scroll into view.
  }, []);

  // follow the AI's just-placed cell so the action area stays in view
  useEffect(() => {
    const last = matchMoves[matchMoves.length - 1];
    if (last && last.player === 'ai') {
      followCell(last.position);
    }
  }, [matchMoves, followCell]);

  // send the single-match session + play result sound on completion
  useEffect(() => {
    if (phase !== 'session-complete') return;
    playResultSound(matchResult as 'win' | 'loss' | 'draw');

    const matchData: TicTacToeMatchData = {
      matchIndex: 0,
      result: matchResult as 'win' | 'loss' | 'draw',
      moveCount,
      moves: matchMoves.map((m) => ({
        position: m.position,
        player: m.player,
        moveNumber: m.moveIndex,
      })),
      startedAt: matchStartTimeRef.current,
      finishedAt: new Date().toISOString(),
    };

    const sessionId = sessionIdRef.current;
    if (!completedRef.current && sessionId) {
      completedRef.current = true;
      sendTicTacToeSession({ sessionId, difficulty, matches: [matchData] });
      void track({ event: 'game_complete', entityType: 'game', entityId: sessionId, properties: { game: 'ttt', outcome: matchResult } });
      getGlobalSessionService().completeSession(sessionId, {
        rawRts: [],
        correctedRts: [],
        totalRounds: moveCount,
        validRounds: 0,
        calibration: PLACEHOLDER_CALIBRATION,
        sessionStart: 0,
        sessionEnd: Date.now(),
      });
    }
  }, [phase, matchResult, matchMoves, moveCount, difficulty]);

  // trigger the (non-blocking) AI after a short thinking delay
  useEffect(() => {
    if (phase !== 'ai-thinking') return;
    const timer = setTimeout(() => { aiMove(); }, 320);
    return () => clearTimeout(timer);
  }, [phase, aiMove]);

  const handleCellClick = useCallback((position: MovePosition) => {
    if (phase !== 'active') return;
    if (!getAvailableMoves(board).includes(position)) return;
    playMoveSound();
    humanMove(position);
    followCell(position);
  }, [phase, board, humanMove, followCell]);

  const handleQuitConfirm = useCallback(() => {
    setStopConfirmOpen(false);
    const sessionId = sessionIdRef.current;
    if (!completedRef.current && sessionId) {
      completedRef.current = true;
      quitConfirmedRef.current = true;
      getGlobalSessionService().abandonSession(sessionId, 'abandoned');
      void track({ event: 'game_abandon', entityType: 'game', entityId: sessionId, properties: { game: 'ttt', turns: moveCount } });
    }
    reset();
    navigate.replace('home');
  }, [navigate, reset, setStopConfirmOpen, moveCount]);

  const handleShareResult = useCallback(async () => {
    const shareUrl = buildAppUrl('');
    const shareText = `${t('ticTacToe.shareText')} ${shareUrl}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: t('ticTacToe.title'), text: shareText, url: shareUrl });
        return;
      }
    } catch { /* user cancelled or unsupported — fall through to copy */ }
    const ok = await copyText(shareText);
    setShareCopied(ok);
  }, [t]);

  const lastMovePos = matchMoves.length > 0 ? matchMoves[matchMoves.length - 1]!.position : null;
  const winningSet = new Set<number>(winningLine ?? []);

  const boardCells = board.map((cell, i) => (
    <Cell
      key={i}
      index={i}
      value={cell}
      isWinning={winningSet.has(i)}
      isLast={!winningSet.has(i) && lastMovePos === i}
      onClick={() => handleCellClick(i as MovePosition)}
      disabled={phase !== 'active'}
      colors={colors}
      cellSize={cellSize}
      cellRef={(el) => { cellRefs.current[i] = el; }}
    />
  ));

  return (
    <div id="ttt-root" style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      minHeight: '100vh', padding: '1.25rem', color: colors.text, background: colors.gradient,
      overflow: 'hidden', boxSizing: 'border-box',
    }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(115% 60% at 50% -8%, ${colors.accentGlow}, transparent 62%)`,
          pointerEvents: 'none',
        }}
      />
      {/* header: title + exit */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, gap: 8,
      }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: colors.text }}>
          {t('ticTacToe.title')}
          <span style={{
            marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, color: colors.accent,
            border: `1px solid ${colors.glassBorder}`, borderRadius: 8, padding: '2px 8px',
            background: colors.glass,
          }}>
            {t(`ticTacToe.difficulty.${difficulty}` as never)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setStopConfirmOpen(true)}
          style={{
            padding: '10px 18px', borderRadius: 10, border: `1px solid ${colors.border}`,
            background: colors.glass, color: colors.danger,
            fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {t('ticTacToe.exit')}
        </button>
      </div>

      {/* movable move counter */}
      <div style={{
        fontSize: '0.8rem', color: colors.textSecondary, textAlign: 'center', marginBottom: 10,
      }}>
        {moveCount} · {t('ticTacToe.stats.moves')}
      </div>

      {/* fully visible, responsive 9x9 board */}
      <div
        ref={boardRef}
        style={{
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
        }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
          gap: BOARD_GAP,
          padding: BOARD_PADDING,
        }}>
          {boardCells}
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
        {phase === 'active' && t('ticTacToe.yourTurn')}
        {phase === 'ai-thinking' && t('ticTacToe.thinking')}
        {phase === 'session-complete' && matchResult !== 'pending' && (
          <span style={{ color: matchResult === 'win' ? colors.success : matchResult === 'loss' ? colors.danger : colors.textSecondary, fontWeight: 800 }}>
            {matchResult === 'win'
              ? t('ticTacToe.resultWin')
              : matchResult === 'loss'
                ? t('ticTacToe.resultLoss')
                : t('ticTacToe.resultDraw')}
          </span>
        )}
      </div>

      {phase === 'session-complete' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 14,
        }}>
          {matchResult !== 'pending' && matchResult !== 'draw' && (
            <span aria-hidden="true" style={{ animation: 'tttWinPop 380ms ease-out', lineHeight: 0 }}>
              <MarkGlyph mark={matchResult === 'win' ? 'X' : 'O'} size={64} colors={colors} />
            </span>
          )}
          {matchResult === 'draw' && (
            <span aria-hidden="true" style={{
              display: 'flex', gap: 12, alignItems: 'center', animation: 'tttWinPop 380ms ease-out',
            }}>
              <MarkGlyph mark="X" size={42} colors={colors} />
              <MarkGlyph mark="O" size={42} colors={colors} />
            </span>
          )}
          <button
            type="button"
            onClick={() => { playAgainRef.current = true; reset(); navigate.replace('tic-tac-toe', { difficulty }); }}
            style={{
              padding: '12px 34px', borderRadius: 10, border: 'none',
              background: colors.accent, color: '#0a0a12',
              fontWeight: 800, fontSize: '1rem', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {t('ticTacToe.playAgain')}
          </button>
          <button
            type="button"
            onClick={handleShareResult}
            style={{
              padding: '12px 34px', borderRadius: 10, border: `1px solid ${colors.accent}`,
              background: 'transparent', color: colors.accent,
              fontWeight: 700, fontSize: '1rem', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {t('ticTacToe.shareMatch')}
          </button>
          {shareCopied && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: colors.success }}>
              {t('ticTacToe.inviteCopied')}
            </p>
          )}
        </div>
      )}

      {stopConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ttt-stop-confirm-title"
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
            <p id="ttt-stop-confirm-title" style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: colors.text, textAlign: 'center' }}>
              {t('ticTacToe.stopConfirmTitle')}
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, textAlign: 'center' }}>
              {t('ticTacToe.stopConfirmBody')}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setStopConfirmOpen(false)}
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
                onClick={handleQuitConfirm}
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

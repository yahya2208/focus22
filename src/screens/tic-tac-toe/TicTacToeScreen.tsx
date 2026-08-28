import { memo, useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate, useAppDispatch } from '../../store/navigation';
import { useTicTacToeState } from './TicTacToeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackOverlay, useBackGuard } from '../../core/navigation/BackProvider';
import { getAvailableMoves } from '../../core/tic-tac-toe/board';
import { getGlobalSessionService } from '../../core/session/service';
import { sendTicTacToeSession } from '../../services/tic-tac-toe-sender';
import type { TicTacToeMatchData } from '../../services/tic-tac-toe-sender';
import type { MovePosition } from '../../core/tic-tac-toe/types';
import { BOARD_SIZE, indexToRowCol } from '../../core/tic-tac-toe/types';
import type { CalibrationProfile } from '../../core/calibration';

const CELL_SIZE = 54;
const BOARD_GAP = 3;
const BOARD_PADDING = 10;

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
}: {
  index: number;
  value: 'X' | 'O' | null;
  isWinning: boolean;
  isLast: boolean;
  onClick: () => void;
  disabled: boolean;
  colors: ReturnType<typeof useThemeColors>;
  cellRef: (el: HTMLButtonElement | null) => void;
}) {
  const [row, col] = indexToRowCol(index);
  return (
    <button
      ref={cellRef}
      type="button"
      aria-label={`Cell ${index + 1}${value ? `, ${value}, Row ${row + 1}, Column ${col + 1}` : ', empty'}`}
      onClick={onClick}
      disabled={disabled || value !== null}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.25rem',
        fontWeight: 800,
        fontFamily: 'inherit',
        color: value === 'X' ? colors.accent : value === 'O' ? colors.danger : 'transparent',
        background: isWinning ? colors.accent : colors.glass,
        border: `1px solid ${isWinning ? colors.accent : colors.glassBorder}`,
        borderRadius: 8,
        cursor: disabled || value !== null ? 'default' : 'pointer',
        opacity: value !== null ? (isWinning ? 1 : 0.85) : 1,
        transition: 'background 150ms ease, border-color 150ms ease',
        animation: value !== null && !isWinning ? 'tttCellPop 0.18s ease-out' : isWinning ? 'tttWinPulse 1s ease-in-out infinite' : undefined,
        outline: 'none',
        touchAction: 'manipulation',
        boxShadow: isLast ? `0 0 0 2px ${colors.accent}` : undefined,
      }}
    >
      {value ?? ''}
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
  const sessionIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const matchStartTimeRef = useRef<string>(new Date().toISOString());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      const sessionId = sessionIdRef.current;
      if (sessionId && !completedRef.current) {
        getGlobalSessionService().abandonSession(sessionId, 'abandoned');
      }
    };
  }, []);

  const followCell = useCallback((pos: MovePosition) => {
    const cell = cellRefs.current[pos];
    const board = boardRef.current;
    if (!cell || !board) return;
    const boardRect = board.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    board.scrollTo({
      top: board.scrollTop + (cellRect.top - boardRect.top) - (board.clientHeight - cell.clientHeight) / 2,
      left: board.scrollLeft + (cellRect.left - boardRect.left) - (board.clientWidth - cell.clientWidth) / 2,
      behavior: 'auto',
    });
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
      getGlobalSessionService().abandonSession(sessionId, 'abandoned');
    }
    reset();
    navigate.replace('home');
  }, [navigate, reset, setStopConfirmOpen]);

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
      cellRef={(el) => { cellRefs.current[i] = el; }}
    />
  ));

  return (
    <div id="ttt-root" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      minHeight: '100vh', padding: '1.25rem', color: colors.text, background: colors.bg,
      boxSizing: 'border-box',
    }}>
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
            {t(`ticTacToe.difficulty.${difficulty}` as any)}
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

      {/* pannable 9x9 board */}
      <div
        ref={boardRef}
        style={{
          position: 'relative',
          overflow: 'auto',
          maxHeight: 'min(66vh, 500px)',
          width: '100%',
          padding: BOARD_PADDING,
          background: colors.bgCard,
          borderRadius: 16,
          border: `1px solid ${colors.border}`,
          msOverflowStyle: 'none',
          scrollbarWidth: 'thin',
        }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
          gap: BOARD_GAP,
          width: BOARD_SIZE * CELL_SIZE + (BOARD_SIZE - 1) * BOARD_GAP,
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
      </div>

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

import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useBackOverlay, useBackGuard } from '../../core/navigation/BackProvider';
import { correctReactionTime } from '../../core/measurement';
import { REACTION } from '../../core/scientific/constants';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getGlobalSessionService } from '../../core/session/service';
import { emitDiagnosticLog } from '../../core/supabase/live-diagnostics';
import { recordFunnel, getActiveCampaignId } from '../../services/qr-measurement';

type Phase = 'waiting' | 'visible' | 'hit' | 'miss';

const TOTAL_ROUNDS = 7;
const MIN_DELAY_MS = 750;
const MAX_DELAY_MS = 2890;
const LAMP_SIZE = 90;
const MIN_POSITION_DISTANCE_PCT = 25;

const GRID_COLS = 5;
const GRID_ROWS = 4;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / (0xFFFFFFFF + 1);
}

function gridToPercent(col: number, row: number): { x: number; y: number } {
  const cellW = 100 / GRID_COLS;
  const cellH = 100 / GRID_ROWS;
  return {
    x: cellW * col + cellW / 2,
    y: cellH * row + cellH / 2,
  };
}

function pickPosition(prevIdx: number): number {
  if (prevIdx < 0) {
    return Math.floor(secureRandom() * TOTAL_CELLS);
  }
  const prevCol = prevIdx % GRID_COLS;
  const prevRow = Math.floor(prevIdx / GRID_COLS);
  const candidates: number[] = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (i === prevIdx) continue;
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const isAdjacent = Math.abs(col - prevCol) <= 1 && Math.abs(row - prevRow) <= 1;
    if (isAdjacent) continue;
    const prevPos = gridToPercent(prevCol, prevRow);
    const curPos = gridToPercent(col, row);
    const dx = curPos.x - prevPos.x;
    const dy = curPos.y - prevPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= MIN_POSITION_DISTANCE_PCT) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) {
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (i === prevIdx) continue;
      candidates.push(i);
    }
  }
  return candidates[Math.floor(secureRandom() * candidates.length)]!;
}

let audioCtx: AudioContext | null = null;
function playBreakSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.2);
  } catch { /* silent */ }
}

const KEYFRAMES_CSS = `
@keyframes lampAppear{0%{transform:translate(-50%,-50%) scale(0);opacity:0;filter:blur(4px)}50%{transform:translate(-50%,-50%) scale(1.1);opacity:1;filter:blur(0)}100%{transform:translate(-50%,-50%) scale(1);opacity:1;filter:blur(0)}}
@keyframes lampPulse{0%,100%{filter:brightness(1) drop-shadow(0 0 12px #f59e0b66)}50%{filter:brightness(1.15) drop-shadow(0 0 20px #f59e0b88)}}
@keyframes lampShatter{0%{transform:translate(-50%,-50%) scale(1);opacity:1;filter:brightness(1)}15%{transform:translate(-50%,-50%) scale(1.3);opacity:1;filter:brightness(2.5)}100%{transform:translate(-50%,-50%) scale(0);opacity:0;filter:brightness(0.3)}}
@keyframes crackSpread{0%{opacity:0;transform:translate(-50%,-50%) scale(0.3)}15%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}
@keyframes shardFly{0%{opacity:1;transform:translate(0,0) rotate(0deg)}100%{opacity:0;transform:translate(var(--sx),var(--sy)) rotate(var(--sr))}}
@keyframes rtPop{0%{transform:scale(0.5);opacity:0}50%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
@keyframes bestPulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
`;

function GlassLamp({ visible, xPct, yPct, onRef }: { visible: boolean; xPct: number; yPct: number; onRef: (el: HTMLButtonElement | null) => void }) {
  const colors = useThemeColors();
  if (!visible) return null;

  return (
    <button
      ref={onRef}
      aria-label="Tap the lamp"
      style={{
        position: 'absolute',
        left: `${xPct}%`, top: `${yPct}%`,
        transform: 'translate(-50%, -50%)',
        width: LAMP_SIZE, height: LAMP_SIZE,
        borderRadius: '50%', border: 'none', padding: 0,
        cursor: 'pointer', zIndex: 5, outline: 'none',
        touchAction: 'manipulation',
        animation: 'lampAppear 0.2s ease-out forwards, lampPulse 1.5s ease-in-out infinite',
        background: `radial-gradient(circle at 50% 50%, transparent -20%, ${colors.warning}22 0%, ${colors.warning}44 30%, ${colors.warning}66 50%, ${colors.warning}33 70%, transparent 100%),
                     radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 30%, transparent 60%),
                     radial-gradient(circle at 50% 50%, ${colors.warning} 0%, ${colors.warning}cc 35%, ${colors.warning}66 65%, transparent 100%)`,
      }}
      onClick={(e) => { e.stopPropagation(); }}
      onTouchEnd={(e) => { e.preventDefault(); }}
    >
      <div style={{
        position: 'absolute', top: '12%', left: '18%',
        width: '25%', height: '15%',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.4)',
        filter: 'blur(2px)',
        transform: 'rotate(-25deg)',
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', right: '20%',
        width: '12%', height: '8%',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
        filter: 'blur(1px)',
      }} />
    </button>
  );
}

export const GameScreen = memo(function GameScreen() {
  const dispatch = useAppDispatch();
  const { calibrationProfile, selectedGame } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const [phase, setPhase] = useState<Phase>('waiting');
  const [round, setRound] = useState(0);
  const [hudTick, setHudTick] = useState(0);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const rawRtsRef = useRef<number[]>([]);
  const bestTimeRef = useRef<number | null>(null);
  const lastRtRef = useRef<number | null>(null);
  const lampCellRef = useRef(-1);
  const lampElRef = useRef<HTMLButtonElement | null>(null);

  const stimulusTimeRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const sessionIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const roundTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const phaseRef = useRef<Phase>('waiting');
  const roundRef = useRef(0);

  phaseRef.current = phase;
  roundRef.current = round;

  // Smart Back (Phase 2): the stop-confirm dialog is a priority-1 overlay, and a
  // beforeBack guard blocks leaving a live game (Stop & Save / Resume dialog).
  useBackOverlay({
    kind: 'dialog',
    screen: 'game',
    isOpen: () => stopConfirmOpen,
    close: () => {
      setStopConfirmOpen(false);
      return true;
    },
  });

  useBackGuard({
    screen: 'game',
    beforeBack: () => {
      if (!completedRef.current) {
        setStopConfirmOpen(true);
        return false;
      }
      return true;
    },
  });

  useEffect(() => {
    const gameMode = selectedGame ?? 'reaction-light';
    const sessionService = getGlobalSessionService();
    const sessionId = sessionService.startSession({ gameMode });
    sessionIdRef.current = sessionId;
    dispatch({ type: 'START_SESSION', sessionId, gameMode });
    recordFunnel(getActiveCampaignId() ?? '', 'game_start');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Contract: every exit path must end in completeSession() or abandonSession().
  // This cleanup covers: unmount, SPA navigation away, refresh/close of the tab,
  // and any path that leaves the game before round 7.
  useEffect(() => {
    return () => {
      const sessionId = sessionIdRef.current;
      if (sessionId && !completedRef.current) {
        getGlobalSessionService().abandonSession(sessionId, 'abandoned');
      }
    };
  }, []);

  const calibration = useMemo(() => calibrationProfile ?? {
    refreshRate: 60, displayLagMs: 16.667, inputLagMs: 8,
    confidence: 0.5, platform: 'unknown' as const, timestamp: Date.now(),
  }, [calibrationProfile]);

  const startRound = useCallback(() => {
    const nextRound = roundRef.current + 1;
    emitDiagnosticLog({ service: 'game', action: 'round_started', caller: 'game-screen', trigger: 'startRound', sessionId: sessionIdRef.current ?? undefined, detail: `round=${nextRound}/${TOTAL_ROUNDS}` });
    setPhase('waiting');
    lastRtRef.current = null;
    const delay = MIN_DELAY_MS + secureRandom() * (MAX_DELAY_MS - MIN_DELAY_MS);
    timerRef.current = setTimeout(() => {
      const nextCell = pickPosition(lampCellRef.current);
      lampCellRef.current = nextCell;
      stimulusTimeRef.current = performance.now();
      setPhase('visible');
    }, delay);
  }, []);

  useEffect(() => {
    if (round >= TOTAL_ROUNDS) {
      const rts = rawRtsRef.current;
      const correctedRts = rts.map((rt) => correctReactionTime(rt, calibration).correctedRtMs);
      const validRounds = rts.filter((rt) => {
        const corrected = rt - calibration.displayLagMs - calibration.inputLagMs;
        return corrected >= REACTION.MIN_RT_MS && rt <= REACTION.MAX_RT_MS;
      }).length;
      const results = {
        rawRts: rts,
        correctedRts,
        calibration,
        totalRounds: TOTAL_ROUNDS,
        validRounds,
        sessionStart: sessionStartRef.current,
        sessionEnd: Date.now(),
      };

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        completedRef.current = true;
        emitDiagnosticLog({ service: 'game', action: 'game_completed', caller: 'game-screen', trigger: 'round7_reached', sessionId, detail: `rounds=${TOTAL_ROUNDS} valid=${validRounds}` });
        getGlobalSessionService().completeSession(sessionId, results);
        recordFunnel(getActiveCampaignId() ?? '', 'game_complete');
      }

      dispatch({ type: 'SET_RESULTS', results });
      dispatch({ type: 'REPLACE', screen: 'results' });
      return;
    }
    startRound();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (roundTimerRef.current) clearTimeout(roundTimerRef.current);
    };
  }, [round, calibration, dispatch, startRound]);

  const handleLampTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (phaseRef.current !== 'visible') {
      return;
    }

    const rt = performance.now() - stimulusTimeRef.current;
    rawRtsRef.current.push(rt);
    lastRtRef.current = rt;
    if (bestTimeRef.current === null || rt < bestTimeRef.current) {
      bestTimeRef.current = rt;
    }
    emitDiagnosticLog({ service: 'game', action: 'round_completed', caller: 'game-screen', trigger: 'lamp_tap', sessionId: sessionIdRef.current ?? undefined, detail: `round=${roundRef.current + 1} rt=${Math.round(rt)}ms` });

    setPhase('hit');
    playBreakSound();
    setHudTick((t) => t + 1);

    roundTimerRef.current = setTimeout(() => {
      setRound((r) => r + 1);
    }, 700);
  }, [calibration]);

  const confirmStop = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (roundTimerRef.current) clearTimeout(roundTimerRef.current);
    const sessionId = sessionIdRef.current;
    completedRef.current = true;
    if (sessionId) {
      getGlobalSessionService().abandonSession(sessionId, 'abandoned');
    }
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  useEffect(() => {
    if (phase === 'visible' && lampElRef.current) {
      const el = lampElRef.current;
      const onClick = () => handleLampTap({ stopPropagation: () => {} } as React.MouseEvent);
      const onTouchEnd = (e: Event) => { e.preventDefault(); handleLampTap({ stopPropagation: () => {} } as React.TouchEvent); };
      el.addEventListener('click', onClick);
      el.addEventListener('touchend', onTouchEnd, { passive: false });
      return () => {
        el.removeEventListener('click', onClick);
        el.removeEventListener('touchend', onTouchEnd);
      };
    }
  }, [phase, handleLampTap]);

  const progress = Math.round((round / TOTAL_ROUNDS) * 100);
  const bestTime = bestTimeRef.current;
  const lastRt = (phase === 'hit') ? lastRtRef.current : null;
  const cellIdx = lampCellRef.current;
  const lp = cellIdx >= 0 ? gridToPercent(cellIdx % GRID_COLS, Math.floor(cellIdx / GRID_COLS)) : { x: 50, y: 50 };

  const isNewBest = lastRt !== null && bestTime !== null && lastRt <= bestTime;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES_CSS }} />
      <nav
        aria-label={`Game round ${round + 1} of ${TOTAL_ROUNDS}`}
        role="application"
        tabIndex={0}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          background: colors.bg,
          outline: 'none',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          contain: 'strict',
        }}
      >
        {/* HUD — Best Time prominent at top-left */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          zIndex: 10,
          contain: 'layout style',
        }}>
          {/* Best Time — large and prominent */}
          <div style={{
            background: colors.glass,
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px',
            padding: '0.6rem 1rem',
            backdropFilter: 'blur(10px)',
            minWidth: '100px',
          }}>
            <span style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block' }}>
              {t('game.bestTime')}
            </span>
            <span style={{
              fontSize: '1.5rem', fontWeight: 800,
              color: bestTime !== null ? colors.accent : colors.textFaint,
              fontVariantNumeric: 'tabular-nums', display: 'block',
              lineHeight: 1.1,
              animation: bestTime !== null && isNewBest ? 'bestPulse 0.4s ease-out' : undefined,
            }}>
              {bestTime !== null ? `${Math.round(bestTime)}` : '---'}
              <span style={{ fontSize: '0.7rem', fontWeight: 500, color: colors.textMuted, marginLeft: '2px' }}>ms</span>
            </span>
          </div>

          {/* Round counter + progress */}
          <div style={{
            background: colors.glass,
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: '14px',
            padding: '0.6rem 1rem',
            textAlign: 'right',
            backdropFilter: 'blur(10px)',
          }}>
            <span style={{ fontSize: '0.55rem', color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block' }}>
              {t('game.round')}
            </span>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums', display: 'block', lineHeight: 1.1 }}>
              {Math.min(round + 1, TOTAL_ROUNDS)}
              <span style={{ fontSize: '0.8rem', fontWeight: 400, color: colors.textMuted }}>/{TOTAL_ROUNDS}</span>
            </span>
            <div style={{ width: '80px', height: '3px', background: colors.progressBg, borderRadius: '2px', overflow: 'hidden', marginTop: '6px', marginLeft: 'auto' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: colors.accent, borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
          </div>
        </div>

        {/* Last RT popup — center */}
        {lastRt !== null && (
          <div
            key={`rt-${hudTick}`}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20, pointerEvents: 'none',
              animation: 'rtPop 0.3s ease-out',
              background: colors.glass,
              border: `1px solid ${isNewBest ? colors.accent : colors.glassBorder}`,
              borderRadius: '18px',
              padding: '0.75rem 1.5rem',
              backdropFilter: 'blur(12px)',
              boxShadow: isNewBest ? `0 0 20px ${colors.accent}33` : undefined,
            }}
          >
            <span style={{
              fontSize: '2.25rem', fontWeight: 800,
              color: isNewBest ? colors.accent : colors.success,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {Math.round(lastRt)}ms
            </span>
            {isNewBest && (
              <span style={{
                display: 'block', fontSize: '0.6rem', fontWeight: 600,
                color: colors.accent, textTransform: 'uppercase' as const,
                letterSpacing: '0.1em', textAlign: 'center', marginTop: '2px',
              }}>
                NEW BEST
              </span>
            )}
          </div>
        )}

        {/* Glass Lamp positioned at current target */}
        <GlassLamp
          visible={phase === 'visible'}
          xPct={lp.x}
          yPct={lp.y}
          onRef={(el) => { lampElRef.current = el; }}
        />

        {/* Shatter effect — glass shards + crack lines */}
        {phase === 'hit' && (
          <>
            <div
              key={`crack-${hudTick}`}
              style={{
                position: 'absolute',
                left: `${lp.x}%`, top: `${lp.y}%`,
                transform: 'translate(-50%, -50%)',
                width: LAMP_SIZE * 2.5, height: LAMP_SIZE * 2.5,
                zIndex: 7, pointerEvents: 'none',
                animation: 'crackSpread 0.5s ease-out forwards',
              }}
            >
              <svg viewBox="0 0 120 120" width="100%" height="100%">
                <circle cx="60" cy="60" r="30" fill="none" stroke={colors.success} strokeWidth="1.5" opacity="0.5" />
                <line x1="60" y1="30" x2="60" y2="5" stroke={colors.success} strokeWidth="1.2" opacity="0.6" />
                <line x1="60" y1="90" x2="60" y2="115" stroke={colors.success} strokeWidth="1.2" opacity="0.6" />
                <line x1="30" y1="60" x2="5" y2="60" stroke={colors.success} strokeWidth="1.2" opacity="0.6" />
                <line x1="90" y1="60" x2="115" y2="60" stroke={colors.success} strokeWidth="1.2" opacity="0.6" />
                <line x1="39" y1="39" x2="18" y2="18" stroke={colors.success} strokeWidth="1" opacity="0.5" />
                <line x1="81" y1="39" x2="102" y2="18" stroke={colors.success} strokeWidth="1" opacity="0.5" />
                <line x1="39" y1="81" x2="18" y2="102" stroke={colors.success} strokeWidth="1" opacity="0.5" />
                <line x1="81" y1="81" x2="102" y2="102" stroke={colors.success} strokeWidth="1" opacity="0.5" />
                <line x1="60" y1="30" x2="45" y2="12" stroke={colors.success} strokeWidth="0.8" opacity="0.4" />
                <line x1="60" y1="30" x2="78" y2="10" stroke={colors.success} strokeWidth="0.8" opacity="0.4" />
                <line x1="60" y1="90" x2="42" y2="108" stroke={colors.success} strokeWidth="0.8" opacity="0.4" />
                <line x1="60" y1="90" x2="80" y2="110" stroke={colors.success} strokeWidth="0.8" opacity="0.4" />
              </svg>
            </div>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const angle = (i * 60 + secureRandom() * 30) * (Math.PI / 180);
              const dist = 30 + secureRandom() * 40;
              return (
                <div
                  key={`shard-${hudTick}-${i}`}
                  style={{
                    position: 'absolute',
                    left: `${lp.x}%`, top: `${lp.y}%`,
                    width: 4 + secureRandom() * 4,
                    height: 4 + secureRandom() * 4,
                    borderRadius: '1px',
                    background: colors.success,
                    opacity: 0.6,
                    zIndex: 8,
                    pointerEvents: 'none',
                    transform: 'translate(-50%, -50%)',
                    ['--sx' as string]: `${Math.cos(angle) * dist}px`,
                    ['--sy' as string]: `${Math.sin(angle) * dist}px`,
                    ['--sr' as string]: `${secureRandom() * 360}deg`,
                    animation: `shardFly ${0.3 + secureRandom() * 0.2}s ease-out forwards`,
                  }}
                />
              );
            })}
          </>
        )}

        {/* Stop Test — bottom center */}
        <button
          onClick={() => setStopConfirmOpen(true)}
          style={{
            position: 'absolute',
            bottom: '1.25rem', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: colors.glass,
            border: `1px solid ${colors.danger}55`,
            color: colors.dangerText,
            borderRadius: '14px',
            padding: '0.55rem 1.1rem',
            fontSize: '0.8rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: `0 6px 24px ${colors.shadow}`,
          }}
        >
          <span style={{ fontSize: '0.65rem' }}>■</span>
          {t('game.stop')}
        </button>

        {/* Stop confirmation modal */}
        {stopConfirmOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-confirm-title"
            style={{
              position: 'fixed', inset: 0, zIndex: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.62)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              padding: '1.5rem',
            }}
          >
            <div style={{
              width: '100%', maxWidth: '340px',
              background: colors.bgCard,
              border: `1px solid ${colors.danger}55`,
              borderRadius: '22px',
              padding: '1.5rem',
              textAlign: 'center',
              boxShadow: `0 24px 64px rgba(0,0,0,0.5)`,
              animation: 'scaleIn 0.2s ease-out',
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: '14px',
                margin: '0 auto 0.9rem',
                background: colors.dangerBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.dangerText, fontSize: '1.1rem',
              }}>
                ■
              </div>
              <h2 id="stop-confirm-title" style={{
                margin: '0 0 0.4rem', fontSize: '1.05rem', fontWeight: 700, color: colors.text,
              }}>
                {t('game.stopConfirm.title')}
              </h2>
              <p style={{
                margin: '0 0 1.25rem', fontSize: '0.85rem', color: colors.textMuted, lineHeight: 1.5,
              }}>
                {t('game.stopConfirm.message')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <button
                  onClick={confirmStop}
                  style={{
                    width: '100%', cursor: 'pointer', fontFamily: 'inherit',
                    padding: '0.7rem 1rem', borderRadius: '14px', border: 'none',
                    background: `linear-gradient(135deg, ${colors.danger} 0%, ${colors.dangerText} 100%)`,
                    color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                  }}
                >
                  {t('game.stopConfirm.confirm')}
                </button>
                <button
                  onClick={() => setStopConfirmOpen(false)}
                  style={{
                    width: '100%', cursor: 'pointer', fontFamily: 'inherit',
                    padding: '0.7rem 1rem', borderRadius: '14px',
                    background: 'none', border: `1px solid ${colors.glassBorder}`,
                    color: colors.textSecondary, fontSize: '0.85rem', fontWeight: 600,
                  }}
                >
                  {t('game.stopConfirm.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
});

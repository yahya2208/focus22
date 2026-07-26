import { useEffect } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { getGlobalTelemetry } from '../../core/telemetry';
import { runSilentCalibration } from '../../core/calibration/silent';

const INTRO_DURATION_MS = 1000;

export function GameIntroScreen() {
  const dispatch = useAppDispatch();
  const colors = useThemeColors();

  useEffect(() => {
    getGlobalTelemetry().track('game_intro_shown');

    runSilentCalibration().then((profile) => {
      if (profile) {
        dispatch({ type: 'SET_CALIBRATION', profile });
      }
    });

    const timer = setTimeout(() => {
      dispatch({ type: 'NAVIGATE', screen: 'game' });
    }, INTRO_DURATION_MS);

    return () => clearTimeout(timer);
  }, [dispatch]);

  return (
    <nav
      aria-label="Game intro"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
      }}
    >
      <div style={{
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: '20px',
        padding: '2.5rem 2rem',
        textAlign: 'center',
        maxWidth: '340px',
        width: '100%',
        backdropFilter: 'blur(12px)',
        boxShadow: `0 8px 32px ${colors.accent}18`,
      }}>
        <div style={{
          width: 64, height: 64,
          borderRadius: '16px',
          background: colors.gradient,
          border: `1px solid ${colors.glassBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.75rem',
          margin: '0 auto 1.25rem',
          boxShadow: `0 4px 20px ${colors.accent}22`,
        }}>
          💡
        </div>

        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: colors.text,
          marginBottom: '0.5rem',
          lineHeight: 1.2,
        }}>
          Test Your Focus
        </h1>

        <p style={{
          color: colors.textSecondary,
          fontSize: '0.9rem',
          lineHeight: 1.5,
          margin: 0,
        }}>
          Tap the glowing lamp
          <br />
          as soon as it appears.
        </p>
      </div>
    </nav>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { CALIBRATION } from '../../core/scientific/constants';
import { createDefaultCalibrationProfile } from '../../core/calibration';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';

export function CalibrationScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [status, setStatus] = useState<'detecting' | 'complete'>('detecting');
  const [frameCount, setFrameCount] = useState(0);
  const framesRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);

  useEffect(() => {
    startTimeRef.current = performance.now();
    let lastTime = performance.now();

    function measure(timestamp: number) {
      const delta = timestamp - lastTime;
      framesRef.current.push(delta);
      lastTime = timestamp;
      setFrameCount(framesRef.current.length);

      if (framesRef.current.length >= CALIBRATION.MIN_SAMPLES) {
        cancelAnimationFrame(rafRef.current);
        setStatus('complete');

        const deltas = framesRef.current;
        const avgFrameMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const refreshRate = Math.round(1000 / avgFrameMs);
        const displayLagMs = 1000 / refreshRate / 2;
        const frameAccuracy = deltas.filter((d) => Math.abs(d - avgFrameMs) < 2).length / deltas.length;
        const refreshRateValidity = refreshRate >= 50 && refreshRate <= 240 ? 1 : 0.5;
        const confidence =
          frameAccuracy * CALIBRATION.CONFIDENCE_WEIGHTS.FRAME_ACCURACY +
          refreshRateValidity * CALIBRATION.CONFIDENCE_WEIGHTS.REFRESH_RATE_VALIDITY;

        const platform = /Android/i.test(navigator.userAgent)
          ? 'Android'
          : /iPhone|iPad/i.test(navigator.userAgent)
            ? 'iOS'
            : 'desktop';
        const inputLagMap: Record<string, number> = { Android: 16, iOS: 12, desktop: 8 };

        const profile = {
          ...createDefaultCalibrationProfile(),
          refreshRate,
          displayLagMs,
          inputLagMs: inputLagMap[platform] ?? 16,
          confidence,
          platform,
          timestamp: Date.now(),
        };

        dispatch({ type: 'SET_CALIBRATION', profile });

        setTimeout(() => dispatch({ type: 'NAVIGATE', screen: 'game' }), 1000);
      } else {
        rafRef.current = requestAnimationFrame(measure);
      }
    }

    rafRef.current = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dispatch]);

  return (
    <nav aria-label="Calibration in progress" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <Card>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, marginBottom: '1rem' }}>
          {t('calibration.title')}
        </h1>
        <div role="status" aria-live="polite" style={{ color: colors.textSecondary, marginBottom: '1rem' }}>
          {status === 'detecting' ? (
            <p>{t('calibration.detecting')} ({frameCount}/{CALIBRATION.MIN_SAMPLES} {t('calibration.samples')})</p>
          ) : (
            <p style={{ color: colors.success }}>{t('calibration.complete')}</p>
          )}
        </div>
        <div
          role="progressbar"
          aria-valuenow={frameCount}
          aria-valuemin={0}
          aria-valuemax={CALIBRATION.MIN_SAMPLES}
          style={{
            width: '100%',
            height: '8px',
            background: colors.progressBg,
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${(frameCount / CALIBRATION.MIN_SAMPLES) * 100}%`,
              height: '100%',
              background: colors.accent,
              borderRadius: '4px',
              transition: 'width 0.1s',
            }}
          />
        </div>
      </Card>
    </nav>
  );
}

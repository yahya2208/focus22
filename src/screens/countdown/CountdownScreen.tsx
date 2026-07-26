import { useState, useEffect } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';

export function CountdownScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      dispatch({ type: 'NAVIGATE', screen: 'game' });
      return;
    }
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, dispatch]);

  const radius = 80;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const progress = count > 0 ? ((3 - count + 1) / 3) * circumference : circumference;

  return (
    <nav
      aria-label="Countdown"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
      }}
    >
      <div
        role="timer"
        aria-live="assertive"
        aria-atomic="true"
        style={{ position: 'relative', width: 200, height: 200 }}
      >
        <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx="100" cy="100" r={radius}
            fill="none"
            stroke={colors.progressBg}
            strokeWidth={stroke}
          />
          <circle
            cx="100" cy="100" r={radius}
            fill="none"
            stroke={colors.accent}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{
            fontSize: '3.5rem',
            fontWeight: 'bold',
            color: colors.accent,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {count > 0 ? count : t('countdown.go')}
          </span>
          <span style={{
            color: colors.textMuted,
            fontSize: '0.8rem',
            marginTop: '0.5rem',
          }}>
            {t('countdown.getReady')}
          </span>
        </div>
      </div>
    </nav>
  );
}

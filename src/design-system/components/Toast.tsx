import { memo, useEffect, type ReactNode } from 'react';
import { useColors } from '../useTokens';
import { radius as radiusToken } from '../radius';
import { spacing } from '../spacing';
import { elevation } from '../shadows';
import { zIndex } from '../z-index';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  type?: ToastType;
  message: string;
  action?: ReactNode;
  duration?: number;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

const toastColors: Record<ToastType, (c: ReturnType<typeof useColors>) => { bg: string; border: string; icon: string }> = {
  success: (c) => ({ bg: c.successMuted, border: c.success, icon: c.success }),
  error: (c) => ({ bg: c.dangerMuted, border: c.danger, icon: c.danger }),
  warning: (c) => ({ bg: c.warningMuted, border: c.warning, icon: c.warning }),
  info: (c) => ({ bg: c.infoMuted, border: c.info, icon: c.info }),
};

const toastIcons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

export const Toast = memo(function Toast({
  type = 'info',
  message,
  action,
  duration = 4000,
  onDismiss,
  style,
}: ToastProps) {
  const colors = useColors();
  const t = toastColors[type](colors);

  useEffect(() => {
    if (!duration || !onDismiss) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.sm} ${spacing.md}`,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: radiusToken.md,
        boxShadow: elevation.dropdown,
        fontFamily: 'inherit',
        fontSize: '0.875rem',
        color: colors.text,
        zIndex: zIndex.toast,
        pointerEvents: 'auto',
        ...style,
      }}
    >
      <span style={{
        width: '20px', height: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        background: t.icon,
        color: colors.bg,
        fontSize: '0.65rem',
        fontWeight: 800,
        flexShrink: 0,
      }}>
        {toastIcons[type]}
      </span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      {action}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none', border: 'none',
            color: colors.textMuted, cursor: 'pointer',
            fontSize: '0.85rem', padding: '2px', fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
});

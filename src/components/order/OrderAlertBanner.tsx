import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../design-system/components/Button';
import { useAppDispatch } from '../../store/navigation';
import type { OrderAlert } from '../../hooks/useOrderAlerts';

// ============================================================================
// OrderAlertBanner — global NEW_ORDER alert (G-N1). Rendered once by AppShell
// above the routed screen. Non-blocking: dismissible, navigates to Store Ops
// order detail on open. Shows order reference + total only; details load
// post-navigation under the viewer's own session.
// ============================================================================

export const OrderAlertBanner = memo(function OrderAlertBanner({
  alerts,
  onDismiss,
}: {
  alerts: readonly OrderAlert[];
  onDismiss: (orderId: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const dispatch = useAppDispatch();

  if (alerts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}
    >
      {alerts.map((a) => (
        <div
          key={a.orderId}
          data-testid={`order-alert-${a.orderId}`}
          style={{
            border: `1px solid ${colors.accent}`,
            borderRadius: 14,
            padding: '0.7rem 0.9rem',
            background: colors.bgCard,
            boxShadow: `0 0 24px ${colors.accentGlow}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: colors.text, fontWeight: 800, fontSize: '0.9rem' }}>
              {t('pilot.newOrderAlertTitle')}
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
              #{a.orderId.slice(0, 8)}{a.total != null ? ` · ${a.total} ${t('pilot.currency')}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                dispatch({ type: 'NAVIGATE', screen: 'pilot-store-ops', params: { orderId: a.orderId } })
              }
            >
              {t('pilot.openOrder')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDismiss(a.orderId)} aria-label={t('pilot.dismissAlert')}>
              ✕
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
});

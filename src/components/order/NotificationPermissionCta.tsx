import { memo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../design-system/components/Button';
import { useAuth } from '../../core/auth/AuthProvider';
import { getNotifyPermission, requestNotifyPermission, wasNotifyAsked, markNotifyAsked } from '../../services/browser-notify';

// ============================================================================
// NotificationPermissionCta — one-time, dismissible permission prompt (G-N2).
// Shows only for signed-in users, only when permission is undecided and never
// asked before. Denied/unsupported states render nothing, forever.
// ============================================================================

export const NotificationPermissionCta = memo(function NotificationPermissionCta() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();
  const [asked, setAsked] = useState(() => wasNotifyAsked());
  const [busy, setBusy] = useState(false);

  if (authState.status !== 'authenticated') return null;
  if (asked) return null;
  const perm = getNotifyPermission();
  if (perm !== 'default') return null;

  const ask = async () => {
    setBusy(true);
    try {
      await requestNotifyPermission();
    } finally {
      setAsked(true);
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '0.6rem 0.8rem',
        background: colors.bgCard,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        marginBottom: '0.75rem',
      }}
    >
      <span style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>
        {t('pilot.notifyPermissionHint')}
      </span>
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <Button variant="primary" size="sm" onClick={() => void ask()} disabled={busy}>
          {t('pilot.notifyEnable')}
        </Button>
            <Button variant="ghost" size="sm" onClick={() => { markNotifyAsked(); setAsked(true); }} aria-label={t('pilot.dismissAlert')}>
          ✕
        </Button>
      </div>
    </div>
  );
});

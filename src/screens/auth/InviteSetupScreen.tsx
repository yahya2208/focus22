import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { usePilotMembership } from '../../hooks/usePilotMembership';
import {
  checkInviteIdentity,
  mapInviteSetupError,
  resolveInviteDestination,
  resolveInviteGate,
  validateSetupPassword,
} from '../../core/auth/invite-setup';
import { fetchMyLiveInvitation } from '../../services/pilot-invite-service';
import { useTranslation } from '../../hooks/useTranslation';
import type { TranslationKey } from '../../i18n';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';

/**
 * Invite completion (P2-A): lets a user who arrived via an invitation link
 * (live session, no password yet) set a password, then routes by verified
 * membership state — never by email, name, URL, or claimed role.
 *
 * Security: the password lives only in local component state, is cleared
 * immediately after submit, and travels exclusively inside
 * supa.auth.updateUser. No logging, no telemetry, no URL/query usage.
 * Backend authorization is untouched; membership states come from the
 * read-only resolver.
 *
 * Gate 1B fix: the password form renders ONLY after the DB-backed proof
 * (pilot_get_my_invitation, keyed on auth.uid()) confirms the invitation
 * belongs to the authenticated session user. A stale/foreign session, a
 * missing invitation, or an already-set password all fail closed — no form,
 * no updateUser. setAccountPassword additionally re-verifies identity at
 * submit time (INVITE_IDENTITY_MISMATCH defense-in-depth).
 */
export const InviteSetupScreen = memo(function InviteSetupScreen() {
  const dispatch = useAppDispatch();
  const { state: authState, service } = useAuth();
  const pilotAccess = usePilotMembership();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [phase, setPhase] = useState<'form' | 'working' | 'success'>('form');
  const [invitation, setInvitation] = useState<ReturnType<typeof normalizeInvitation> | null>(null);
  const [proofStatus, setProofStatus] = useState<'loading' | 'done'>('loading');

  const sessionStatus = authState.status;
  const sessionUserId = authState.user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (sessionStatus !== 'authenticated' || !sessionUserId) {
      setInvitation(null);
      setProofStatus('done');
      return;
    }
    setProofStatus('loading');
    fetchMyLiveInvitation()
      .then((row) => {
        if (cancelled) return;
        setInvitation(row ? normalizeInvitation(row) : null);
        setProofStatus('done');
      })
      .catch(() => {
        if (cancelled) return;
        setInvitation(null);
        setProofStatus('done');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, sessionUserId]);

  const gate = resolveInviteGate({
    sessionStatus,
    sessionUserId,
    invitation: proofStatus === 'done' ? invitation : null,
  });

  const handleSubmit = useCallback(async () => {
    const validation = validateSetupPassword(password, confirm);
    if (validation === 'required' || validation === 'too-short') {
      setErrorKey(
        validation === 'required'
          ? 'inviteSetup.passwordRequired'
          : 'inviteSetup.passwordTooShort',
      );
      return;
    }
    if (validation === 'mismatch') {
      setErrorKey('inviteSetup.passwordMismatch');
      return;
    }
    const boundUserId = invitation?.user_id ?? null;
    const identity = checkInviteIdentity(sessionUserId, boundUserId);
    if (identity !== 'match') {
      setErrorKey('inviteSetup.linkExpired');
      setPhase('form');
      return;
    }
    setErrorKey(null);
    setPhase('working');
    try {
      await service.setAccountPassword(password, boundUserId ?? undefined);
      setPhase('success');
    } catch (err) {
      const kind = mapInviteSetupError(err instanceof Error ? err.message : '');
      setErrorKey(
        kind === 'link-expired'
          ? 'inviteSetup.linkExpired'
          : kind === 'weak-password'
            ? 'inviteSetup.weakPassword'
            : 'inviteSetup.setupFailed',
      );
      setPhase('form');
    } finally {
      setPassword('');
      setConfirm('');
    }
  }, [password, confirm, service, invitation, sessionUserId]);

  const goLogin = useCallback(() => {
    dispatch({ type: 'NAVIGATE', screen: 'login' });
  }, [dispatch]);

  const goHome = useCallback(() => {
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  }, [dispatch]);

  const destination = resolveInviteDestination({
    courierEntry: pilotAccess.courierEntry,
    operatorEntry: pilotAccess.operatorEntry,
    isAdmin: pilotAccess.isAdmin,
  });

  const goDestination = useCallback(() => {
    dispatch({ type: 'NAVIGATE', screen: destination.route });
  }, [dispatch, destination.route]);

  const renderDestinationPanel = () => {
    if (pilotAccess.status === 'loading') {
      return (
        <p style={{ color: colors.textMuted, textAlign: 'center' }}>{t('pilot.loading')}</p>
      );
    }
    if (destination.mode === 'workspace') {
      return (
        <>
          <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '1rem' }}>
            {t('inviteSetup.successMessage')}
          </p>
          <Button onClick={goDestination} style={{ width: '100%' }}>
            {destination.route === 'pilot-courier'
              ? t('pilot.courierWorkspace')
              : t('pilot.merchantWorkspace')}
          </Button>
        </>
      );
    }
    return (
      <>
        <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '1rem' }}>
          {destination.mode === 'pending'
            ? t('inviteSetup.pendingMessage')
            : t('inviteSetup.orientationMessage')}
        </p>
        <Button variant="secondary" onClick={goHome} style={{ width: '100%' }}>
          {t('inviteSetup.backToHome')}
        </Button>
      </>
    );
  };

  const renderGateBlocked = () => (
    <>
      <p style={{ color: colors.textSecondary, fontSize: '0.9rem', textAlign: 'center' }}>
        {t(
          gate === 'needs-session'
            ? 'inviteSetup.needsSessionMessage'
            : 'inviteSetup.linkExpired',
        )}
      </p>
      <p style={{ color: colors.textMuted, fontSize: '0.85rem', textAlign: 'center' }}>
        {t('inviteSetup.magicLinkHint')}
      </p>
      <Button onClick={goLogin} style={{ width: '100%' }}>
        {t('inviteSetup.goToLogin')}
      </Button>
    </>
  );

  const renderForm = () => (
    <>
      <div>
        <label htmlFor="invite-password" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
          {t('login.password')}
        </label>
        <input
          id="invite-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('login.passwordPlaceholder')}
          autoComplete="new-password"
          style={{
            width: '100%', padding: '0.75rem', borderRadius: '8px',
            border: `1px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.text,
            fontSize: '1rem', boxSizing: 'border-box',
          }}
        />
      </div>
      <div>
        <label htmlFor="invite-confirm" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
          {t('inviteSetup.confirmPassword')}
        </label>
        <input
          id="invite-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t('inviteSetup.confirmPasswordPlaceholder')}
          autoComplete="new-password"
          style={{
            width: '100%', padding: '0.75rem', borderRadius: '8px',
            border: `1px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.text,
            fontSize: '1rem', boxSizing: 'border-box',
          }}
        />
      </div>
      {errorKey && (
        <p style={{ color: colors.danger, fontSize: '0.85rem' }}>{t(errorKey)}</p>
      )}
      <Button onClick={() => void handleSubmit()} loading={phase === 'working'}>
        {t('inviteSetup.setPassword')}
      </Button>
    </>
  );

  return (
    <nav aria-label="Invite setup" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
        {phase === 'success' ? t('inviteSetup.successTitle') : t('inviteSetup.title')}
      </h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '2rem' }}>
        {phase === 'success' ? t('inviteSetup.successSubtitle') : t('inviteSetup.subtitle')}
      </p>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {phase === 'success' ? (
            renderDestinationPanel()
          ) : gate === 'loading' ? (
            <p style={{ color: colors.textMuted, textAlign: 'center' }}>{t('pilot.loading')}</p>
          ) : gate !== 'ready' ? (
            renderGateBlocked()
          ) : (
            renderForm()
          )}
        </div>
      </Card>
    </nav>
  );
});

function normalizeInvitation(row: {
  readonly id: string;
  readonly user_id: string;
  readonly status: string;
  readonly password_set_at: string | null;
}) {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status,
    password_set_at: row.password_set_at,
  };
}
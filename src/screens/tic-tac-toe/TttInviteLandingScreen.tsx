import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackGuard } from '../../core/navigation/BackProvider';
import { useTttMultiplayer } from '../../hooks/use-ttt-multiplayer';
import type { TttInviteInfo } from '../../core/ttt-multiplayer/types';

export const TttInviteLandingScreen = memo(function TttInviteLandingScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { routeParams } = useAppState();
  const { loadInvite, joinGame, status } = useTttMultiplayer();

  const invite = (routeParams.invite as string | undefined) ?? null;

  const [info, setInfo] = useState<TttInviteInfo | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const loadedRef = useRef(false);

  useBackGuard({
    screen: 'ttt-invite-landing',
    beforeBack: () => {
      navigate.replace('home');
      return false;
    },
  });

  const load = useCallback(async () => {
    if (!invite || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const i = await loadInvite(invite);
      setInfo(i);
    } catch {
      setJoinError(t('tttInvite.invalid') as string);
    }
  }, [invite, loadInvite, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleJoin = useCallback(async () => {
    if (!invite) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinGame(invite);
      navigate.replace('ttt-multiplayer', { game: result.gameId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('tttInvite.invalid') as string;
      setJoinError(msg);
      setJoining(false);
    }
  }, [invite, joinGame, navigate, t]);

  const alreadyStarted = info?.status === 'completed' || info?.status === 'active';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 20,
      padding: '1.5rem', color: colors.text, background: colors.bg,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem' }}>⭕</div>
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
        {t('tttInvite.title')}
      </h1>

      {info ? (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: 14, padding: '18px 24px', maxWidth: 360,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            {info.hostDisplayName}
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary }}>
            {alreadyStarted
              ? t('tttInvite.alreadyStarted')
              : t('tttInvite.challenge')}
          </p>

          {!alreadyStarted && (
            <button
              type="button"
              disabled={joining}
              onClick={handleJoin}
              style={{
                marginTop: 6, padding: '12px 28px', borderRadius: 10, border: 'none',
                background: colors.accent, color: '#0a0a12', fontWeight: 800,
                fontSize: '1rem', fontFamily: 'inherit', cursor: joining ? 'default' : 'pointer',
                opacity: joining ? 0.6 : 1,
              }}
            >
              {joining ? '…' : t('tttInvite.join')}
            </button>
          )}

          {alreadyStarted && (
            <button
              type="button"
              onClick={() => navigate.replace('home')}
              style={{
                marginTop: 6, padding: '12px 28px', borderRadius: 10, border: 'none',
                background: colors.border, color: colors.text, fontWeight: 700,
                fontSize: '1rem', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {t('tttInvite.close')}
            </button>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.9rem', color: colors.textSecondary }}>
          {joinError ?? (status === 'pending' ? '…' : t('tttInvite.loading'))}
        </p>
      )}
    </div>
  );
});

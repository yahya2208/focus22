import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useBackGuard } from '../../core/navigation/BackProvider';
import { useTttMultiplayer } from '../../hooks/use-ttt-multiplayer';
import { GridMotif, MarkGlyph } from '../../core/ttt-multiplayer/visual';
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
    <div
      id="ttt-landing-root"
      style={{
        position: 'relative',
        minHeight: '100vh',
        color: colors.text,
        background: colors.gradient,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(120% 70% at 50% -10%, ${colors.accentGlow}, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 360,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        textAlign: 'center',
      }}>
        <span aria-hidden="true" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 64, height: 64, borderRadius: 18,
          background: colors.glass, border: `1px solid ${colors.borderLight}`,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        }}>
          <GridMotif size={3} accentCell={{ row: 0, col: 0 }} dangerCell={{ row: 2, col: 2 }} colors={colors} cell={13} gap={3} />
        </span>
        <span style={{
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: colors.textMuted,
        }}>
          {t('ticTacToe.title')} · 9 × 9
        </span>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>
          {t('tttInvite.heroTitle')}
        </h1>

        {info ? (
          <div style={{
            background: colors.bgCard, border: `1px solid ${colors.borderLight}`,
            borderRadius: 16, padding: '20px 24px', maxWidth: 360,
            display: 'flex', flexDirection: 'column', gap: 10,
            boxShadow: '0 18px 44px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <MarkGlyph mark="X" size={18} colors={colors} />
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                {info.hostDisplayName}
              </p>
              <MarkGlyph mark="O" size={18} colors={colors} />
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary, lineHeight: 1.5 }}>
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
                  marginTop: 6, padding: '13px 28px', borderRadius: 12, border: 'none',
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
                  marginTop: 6, padding: '13px 28px', borderRadius: 12, border: 'none',
                  background: colors.border, color: colors.text, fontWeight: 700,
                  fontSize: '1rem', fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {t('tttInvite.close')}
              </button>
            )}
          </div>
        ) : (
          <p role="status" style={{ margin: 0, fontSize: '0.9rem', color: colors.textSecondary }}>
            {joinError ?? (status === 'pending' ? '…' : t('tttInvite.loading'))}
          </p>
        )}
      </div>
    </div>
  );
});

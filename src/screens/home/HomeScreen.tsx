import { memo, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { permissionGuard } from '../../core/research/permissions';
import { HomeMenu } from '../../components/navigation/HomeMenu';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { BrandFooter } from '../../components/brand/BrandFooter';
import { Screen, Grid, Stack } from '../../design-system/layout';
import { layout } from '../../design-system/tokens';
import { Button } from '../../design-system/components/Button';
import { Card } from '../../design-system/components/Card';
import { Flex } from '../../design-system/components/Flex';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import { InventoryService, type InventoryRecord } from '../../services/inventory-service';
import { getInventoryReady, subscribeCentralInventory } from '../../services/inventory-central-service';
import { useInventoryImages } from '../../hooks/useInventoryImages';

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'home.greeting.morning' as const;
  if (h < 17) return 'home.greeting.afternoon' as const;
  return 'home.greeting.evening' as const;
}

function ScoreRing({ score, colors }: { score: number; colors: ReturnType<typeof useThemeColors> }) {
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / 100, 1);
  const offset = circumference * (1 - progress);

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.progressBg} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={colors.accent} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: '2rem', fontWeight: 800, color: colors.text,
          lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {score}
        </span>
        <span style={{ fontSize: '0.65rem', color: colors.textMuted, marginTop: '2px' }}>/100</span>
      </div>
    </div>
  );
}

const SERVICE_ITEMS: { key: 'buyNew' | 'buyUsed' | 'sell' | 'exchange' | 'repair'; emoji: string; color: string; screen: 'phone-services' | 'repair-home' }[] = [
  { key: 'buyNew', emoji: '🟢', color: '#22c55e', screen: 'phone-services' },
  { key: 'buyUsed', emoji: '🔵', color: '#3b82f6', screen: 'phone-services' },
  { key: 'sell', emoji: '🟠', color: '#f97316', screen: 'phone-services' },
  { key: 'exchange', emoji: '🟣', color: '#a855f7', screen: 'phone-services' },
  { key: 'repair', emoji: '🔧', color: '#ef4444', screen: 'repair-home' },
];

function ProductCard({ device, colors, onOpen }: {
  device: InventoryRecord;
  colors: ReturnType<typeof useThemeColors>;
  onOpen: () => void;
}) {
  const images = useInventoryImages(device.id, device.images ?? []);
  const primary = images[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        textAlign: 'right', padding: 0, margin: 0, border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', background: 'transparent', display: 'block', width: '100%',
      }}
    >
      <div style={{
        borderRadius: '18px',
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: `0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)`,
        overflow: 'hidden',
        transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), border-color 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.borderColor = colors.accent + '55';
        e.currentTarget.style.boxShadow = `0 16px 44px rgba(0,0,0,0.38), 0 0 28px ${colors.accentGlow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = colors.glassBorder;
        e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)';
      }}
    >
      <div style={{
        aspectRatio: '4 / 3',
        background: `linear-gradient(150deg, ${colors.bgCard} 0%, ${colors.bg} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {primary ? (
          <img
            src={primary}
            alt={`${device.brand} ${device.model}`}
            loading="lazy"
            decoding="async"
            width={480}
            height={360}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: '2.2rem', opacity: 0.55 }}>📱</span>
        )}
      </div>

      <div style={{ padding: '0.65rem 0.7rem 0.75rem' }}>
        <div style={{ color: colors.accent, fontWeight: 700, fontSize: '0.7rem', marginBottom: '0.1rem' }}>
          {device.brand}
        </div>
        <div style={{ color: colors.text, fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.model}
        </div>
        <div style={{ color: colors.textMuted, fontSize: '0.66rem', marginTop: '0.1rem' }}>
          {device.variant}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '0.4rem',
        }}>
          <span style={{
            fontSize: '0.6rem', fontWeight: 700,
            color: device.quantity > 3 ? colors.success : colors.warning,
            background: device.quantity > 3 ? colors.successBg : colors.warningBg,
            padding: '1px 6px', borderRadius: '999px',
          }}>
            {device.quantity > 0 ? `متوفر (${device.quantity})` : 'نفد'}
          </span>
          {device.sellPrice != null && (
            <span style={{ color: colors.textSecondary, fontWeight: 700, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
              {device.sellPrice.toLocaleString()} د.ج
            </span>
          )}
        </div>
      </div>
      </div>
    </button>
  );
}

export const HomeScreen = memo(function HomeScreen() {
  const dispatch = useAppDispatch();
  const { sessions } = useAppState();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state, researchRole } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [devices, setDevices] = useState<InventoryRecord[]>([]);
  const [inventoryReady, setInventoryReady] = useState(() => getInventoryReady());

  useEffect(() => {
    return subscribeCentralInventory(() => setInventoryReady(getInventoryReady()));
  }, []);

  useEffect(() => {
    if (inventoryReady) setDevices(InventoryService.getExchangeableDevices());
  }, [inventoryReady]);

  const canUseSticker = permissionGuard.can(researchRole, 'sticker', 'write');

  const userName = state.user?.displayName || state.user?.email?.split('@')[0] || '';

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter((s) => new Date(s.timestamp).toISOString().split('T')[0] === today);
    const todayScores = todaySessions.map((s) => s.score?.focusScore).filter((s): s is number => s != null && !isNaN(s));
    const avgFocus = todayScores.length > 0 ? Math.round(todayScores.reduce((a, b) => a + b, 0) / todayScores.length) : null;

    const allBestRts = sessions.map((s) => {
      const rts = s.correctedRts.length > 0 ? [...s.correctedRts] : [...s.rawRts];
      return rts.length > 0 ? Math.min(...rts) : Infinity;
    }).filter((rt) => rt < Infinity);
    const bestTime = allBestRts.length > 0 ? Math.round(Math.min(...allBestRts)) : null;

    return {
      totalSessions: sessions.length,
      avgFocus,
      bestTime,
      streak: todaySessions.length,
    };
  }, [sessions]);

  const lastResults = useMemo(() => {
    return [...sessions].reverse().slice(0, 3).map((s) => ({
      id: s.id,
      date: new Date(s.timestamp).toLocaleDateString(),
      score: s.score?.focusScore ?? null,
      rts: s.correctedRts.length > 0 ? s.correctedRts : s.rawRts,
    }));
  }, [sessions]);

  const startTest = () => {
    dispatch({ type: 'SELECT_GAME', gameMode: 'reaction-light' });
    dispatch({ type: 'NAVIGATE', screen: 'countdown' });
  };

  const openService = (item: (typeof SERVICE_ITEMS)[number]) => {
    if (item.key === 'repair') {
      dispatch({ type: 'NAVIGATE', screen: item.screen as 'repair-home' });
    } else {
      dispatch({ type: 'NAVIGATE', screen: item.screen as 'phone-services' });
    }
  };

  const sectionLabel: React.CSSProperties = {
    color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', fontWeight: 600, margin: 0,
  };

  return (
    <Screen ariaLabel="Main navigation" maxWidth={layout.containerMaxFluid} bottomPad="6rem">
      <Stack gap="lg">
        {/* Top bar */}
        <Flex justify="space-between" align="center">
          <BrandLogo size={40} showSubtitle subtitle={t('app.subtitle')} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t('home.menu')}
            aria-expanded={menuOpen}
          >
            ☰
          </Button>
        </Flex>

        <HomeMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* Ad — the first main content, directly below the top bar.
            Renders nothing when no published ad exists, so no space is reserved. */}
        <AdContactBanner placement="home" />

        {/* Hero — greeting + focus score + start, unified card */}
        <Card variant="glass" padding="xl">
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t(getGreetingKey())}{userName ? `, ${userName}` : ''}
            </p>
            {stats.avgFocus !== null ? (
              <ScoreRing score={stats.avgFocus} colors={colors} />
            ) : (
              <div style={{
                width: '120px', height: '120px', margin: '0 auto',
                borderRadius: '50%',
                border: `3px dashed ${colors.borderLight}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '0.75rem', color: colors.textMuted, textAlign: 'center', padding: '0.5rem' }}>
                  {t('home.noSessionsToday')}
                </span>
              </div>
            )}
            <p style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '0.5rem' }}>
              {t('home.focusScore')}
            </p>
          </div>
          <button
            onClick={startTest}
            style={{
              width: '100%',
              padding: '1rem 2rem',
              borderRadius: '20px',
              border: 'none',
              background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`,
              color: '#fff',
              fontSize: '1.15rem',
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              marginTop: '1rem',
              boxShadow: `0 8px 32px ${colors.accentGlow}, 0 0 64px ${colors.accentGlow}`,
              transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px) scale(1.01)';
              (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${colors.accentGlow}, 0 0 80px ${colors.accentGlow}`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0) scale(1)';
              (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${colors.accentGlow}, 0 0 64px ${colors.accentGlow}`;
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>▶</span>
            {t('home.startTest')}
          </button>
        </Card>

        {/* Phone services — flex-wrap strip, no empty cells at any width */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>
            {t('home.services')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {SERVICE_ITEMS.map((item) => (
              <Card
                key={item.key}
                variant="interactive"
                padding="lg"
                onClick={() => openService(item)}
                style={{ flex: '1 1 132px', minWidth: '112px', textAlign: 'center' }}
              >
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.35rem' }}>{item.emoji}</span>
                <span style={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600 }}>
                  {t(`home.services.${item.key}`)}
                </span>
              </Card>
            ))}
            {canUseSticker && (
              <Card
                variant="interactive"
                padding="lg"
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'sticker-studio' })}
                style={{ flex: '1 1 132px', minWidth: '112px', textAlign: 'center' }}
              >
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.35rem' }}>🖼️</span>
                <span style={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600 }}>
                  {t('home.stickerStudio')}
                </span>
              </Card>
            )}
          </div>
        </div>

        {/* Latest devices — live data source, count adapts to screen */}
        <div>
          <Flex justify="space-between" align="center" style={{ marginBottom: '0.75rem' }}>
            <p style={sectionLabel}>
              {t('home.latestDevices')}
            </p>
            <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'showroom' })}>
              {t('home.viewAll')} →
            </Button>
          </Flex>
          {devices.length > 0 ? (
            <Grid minColumnWidth="150px" gap="md">
              {devices.map((device) => (
                <ProductCard
                  key={`${device.id}-${device.variant}-${device.condition}`}
                  device={device}
                  colors={colors}
                  onOpen={() => dispatch({ type: 'NAVIGATE', screen: 'showroom' })}
                />
              ))}
            </Grid>
          ) : (
            <Card variant="outlined" padding="lg">
              <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
                {t('home.noDevices')}
              </p>
            </Card>
          )}
        </div>

        {/* Statistics */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>
            {t('home.stats')}
          </p>
          <Grid minColumnWidth="150px" gap="md">
            {[
              { label: t('home.stats.sessions'), value: stats.totalSessions.toString() },
              { label: t('home.stats.avgFocus'), value: stats.avgFocus !== null ? `${stats.avgFocus}` : '—' },
              { label: t('home.stats.bestTime'), value: stats.bestTime !== null ? `${stats.bestTime}ms` : '—' },
              { label: t('home.stats.streak'), value: stats.streak.toString() },
            ].map((stat) => (
              <Card key={stat.label} variant="glass" padding="lg">
                <p style={{ color: colors.textMuted, fontSize: '0.65rem', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {stat.label}
                </p>
                <p style={{ color: colors.text, fontSize: '1.3rem', fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </p>
              </Card>
            ))}
          </Grid>
        </div>

        {/* Last Results */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>
            {t('home.lastResults')}
          </p>
          {lastResults.length > 0 ? (
            <Stack gap="sm">
              {lastResults.map((r) => (
                <Card
                  key={r.id}
                  variant="surface"
                  padding="lg"
                  onClick={() => dispatch({ type: 'NAVIGATE', screen: 'history' })}
                >
                  <Flex justify="space-between" align="center">
                    <div>
                      <p style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
                        {r.date}
                      </p>
                      <p style={{ color: colors.textMuted, fontSize: '0.7rem', margin: '0.15rem 0 0' }}>
                        {r.rts.length} trials
                      </p>
                    </div>
                    {r.score !== null && (
                      <span style={{
                        color: colors.accent, fontSize: '1.2rem', fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {r.score}
                      </span>
                    )}
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : (
            <Card variant="outlined" padding="lg">
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0 }}>
                  {t('home.noResults')}
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Brand identity */}
        <BrandFooter />
      </Stack>
    </Screen>
  );
});

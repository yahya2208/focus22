import { memo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { GOLD, GOLD_GLOW, LuxIcon, type LuxIconName } from './tokens';
import type { TranslationKey } from '../../../i18n';

export type CommandSection = 'home' | 'legacy';

export interface CommandNavItem {
  readonly id: CommandSection | string;
  readonly labelKey: TranslationKey;
  readonly icon: LuxIconName;
}

/**
 * Executive navigation (G1). RTL-authentic: the sidebar is the first DOM
 * child, so in RTL it docks right with no physical left/right hacks.
 * Sections beyond home resolve to the legacy screen (G2+ splits them).
 */
export const AdminSidebar = memo(function AdminSidebar({
  active,
  onNavigate,
  userLabel,
  layout = 'side',
}: {
  active: string;
  onNavigate: (id: string) => void;
  userLabel: string;
  layout?: 'side' | 'top';
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const items: CommandNavItem[] = [
    { id: 'home', labelKey: 'cc.navHome', icon: 'home' },
    { id: 'families', labelKey: 'cc.navFamilies', icon: 'users' },
    { id: 'finance', labelKey: 'cc.navFinance', icon: 'wallet' },
    { id: 'orders', labelKey: 'cc.navOrders', icon: 'cart' },
    { id: 'store', labelKey: 'cc.navStore', icon: 'store' },
    { id: 'research', labelKey: 'cc.navResearch', icon: 'flask' },
    { id: 'telemetry', labelKey: 'cc.navTelemetry', icon: 'chart' },
    { id: 'team', labelKey: 'cc.navTeam', icon: 'team' },
  ];
  const isTop = layout === 'top';
  return (
    <aside
      aria-label={t('cc.sidebarLabel')}
      style={
        isTop
          ? {
              display: 'flex',
              gap: '0.35rem',
              overflowX: 'auto',
              padding: '0.6rem 1rem',
              background: '#0d0d17',
              borderBottom: `1px solid ${colors.border}`,
            }
          : {
              width: 248,
              flexShrink: 0,
              background: '#0d0d17',
              borderInlineEnd: `1px solid ${colors.border}`,
              padding: '1.4rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              minHeight: '100%',
            }
      }
    >
      {!isTop && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.5rem' }}>
          <div
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.1rem',
              color: GOLD,
              background: 'linear-gradient(150deg, #15152b, #0a0a12)',
              border: '1px solid rgba(216, 180, 106, 0.5)',
              boxShadow: `0 0 22px ${GOLD_GLOW}`,
            }}
          >
            F
          </div>
          <div>
            <div style={{ fontWeight: 800, color: colors.text }}>FOCUS</div>
            <div style={{ color: colors.textMuted, fontSize: '0.7rem', fontWeight: 500 }}>{t('cc.commandCenter')}</div>
          </div>
        </div>
      )}
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.65rem 0.9rem',
              borderRadius: 12,
              border: isActive ? '1px solid rgba(216, 180, 106, 0.35)' : '1px solid transparent',
              background: isActive ? '#1a1a2e' : 'transparent',
              boxShadow: isActive ? `0 0 24px ${GOLD_GLOW}` : 'none',
              color: isActive ? GOLD : colors.textSecondary,
              fontSize: '0.88rem',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              textAlign: 'start',
            }}
          >
            <LuxIcon name={item.icon} size={isTop ? 16 : 18} />
            <span style={isTop ? { fontSize: '0.72rem', whiteSpace: 'nowrap' } : undefined}>
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
      {!isTop && (
        <div style={{ marginTop: 'auto', paddingTop: '1rem', color: colors.textMuted, fontSize: '0.75rem' }}>
          {userLabel}
        </div>
      )}
    </aside>
  );
});

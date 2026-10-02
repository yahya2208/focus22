import { memo, useMemo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { CommandHero } from './CommandHero';
import { KPIGrid, formatDZD, type KpiDatum } from './KPIGrid';
import { AttentionPanel, type AttentionItem } from './AttentionPanel';
import { ActivityFeed } from './ActivityFeed';
import { QuickActions, type QuickActionId } from './QuickActions';
import { LUX_RADIUS } from './tokens';
import type { PilotFamilyMember } from '../../../services/pilot-account-service';
import type { PilotOrder } from '../../../services/order-service';
import type { InvitationRow } from '../../../services/pilot-invite-service';

export interface AdminHomeData {
  /** All loaded memberships, UNFILTERED (totals dedupe by family). */
  readonly members: readonly PilotFamilyMember[];
  readonly orders: readonly PilotOrder[];
  readonly ordersScopeLabel: string;
  readonly invitations: readonly InvitationRow[];
}

/**
 * Command home (G1): landing composition only. All figures derive from props
 * already loaded by the legacy screen — zero new fetching, zero writes.
 * Money rule: balances are server-computed per family; the total deduplicates
 * by family_id and is labeled as balances, never sales/profit.
 */
export const AdminHome = memo(function AdminHome({
  data,
  onQuickAction,
  onOpenSettings,
}: {
  data: AdminHomeData;
  onQuickAction: (id: QuickActionId) => void;
  /** Session/navigation utility, kept separate from operational quick actions. */
  onOpenSettings: () => void;
}) {

  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }, []);

  const kpis: KpiDatum[] = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of data.members) {
      if (m.status !== 'active') continue;
      if (!seen.has(m.family_id)) seen.set(m.family_id, Number(m.balance) || 0);
    }
    let total = 0;
    for (const v of seen.values()) total += v;
    const isToday = (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? false : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === todayKey;
    };
    const todays = data.orders.filter((o) => isToday(o.created_at)).length;
    const preparing = data.orders.filter((o) => o.status === 'preparing').length;
    return [
      { id: 'balances', labelKey: 'cc.kpiBalances', display: formatDZD(total), sourceKey: 'cc.kpiBalancesSrc', featured: true },
      { id: 'today', labelKey: 'cc.kpiToday', display: String(todays), sourceKey: 'cc.kpiOrdersSrc', sourceExtra: data.ordersScopeLabel },
      { id: 'preparing', labelKey: 'cc.kpiPreparing', display: String(preparing), sourceKey: 'cc.kpiOrdersSrc', sourceExtra: data.ordersScopeLabel },
      { id: 'debts', labelKey: 'cc.kpiDebts', display: '—', sourceKey: 'cc.kpiDebtsSrc' },
    ];
  }, [data, todayKey]);

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    const pendingInvites = data.invitations.filter((i) => i.status === 'PENDING' || i.status === 'SENT');
    for (const inv of pendingInvites.slice(0, 5)) {
      items.push({ id: `inv-${inv.invite_email}-${inv.member_kind}`, text: `${inv.invite_email} — ${inv.member_kind} (${inv.status})`, tone: 'gold' });
    }
    const active = data.orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing').slice(0, 5);
    for (const o of active) {
      items.push({ id: `ord-${o.id}`, text: `${o.order_number} — ${o.status}`, tone: 'teal' });
    }
    return items;
  }, [data]);

  return (
    <>
      <CommandHero />
      <KPIGrid items={kpis} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.4rem',
        }}
      >
        <AttentionPanel items={attention} />
        <ActivityFeed />
      </div>
      <QuickActions onAction={onQuickAction} />
      <AdminTools onOpenSettings={onOpenSettings} />
    </>
  );
});

/**
 * Admin tools (session/navigation utilities only). Deliberately separate from
 * QuickActions so operational shortcuts stay unmixed with session utilities.
 * Everything here delegates outward; no business logic lives here.
 */
const AdminTools = memo(function AdminTools({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <section aria-label={t('cc.toolsLabel')} style={{ marginBottom: '1.4rem' }}>
      <div style={{ color: colors.textSecondary, fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.6rem' }}>
        {t('cc.toolsLabel')}
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        style={{
          background: '#14142a',
          border: `1px solid ${colors.border}`,
          borderRadius: LUX_RADIUS,
          padding: '1rem',
          textAlign: 'center',
          color: colors.text,
          fontSize: '0.86rem',
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {t('home.settings')}
      </button>
    </section>
  );
});

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Select } from '../../design-system/components/Select';
import { Input } from '../../design-system/components/Input';
import { Flex } from '../../design-system/components/Flex';
import {
  adminListNeighborhoods,
  adminListStores,
  adminListOperators,
  adminSetOperatorStatus,
  adminFindUsers,
  type Neighborhood,
  type Store,
  type OperatorMembership,
  type OperatorStatus,
  type AdminUserLookup,
} from '../../services/neighborhood-service';
import {
  adminListCouriers,
  adminSetCourierStatus,
  type CourierMembership,
  type CourierStatus,
} from '../../services/courier-service';
import {
  setOperationalReady,
  type MemberKind,
} from '../../services/readiness-service';
import {
  fetchPilotStartStatus,
  startPilot,
  type PilotStartStatus,
} from '../../services/pilot-start-service';
import {
  resetPilot,
  fetchPilotHealth,
  type PilotHealth,
} from '../../services/order-service';
import { AdminShell } from '../admin/command-center/AdminShell';
import { AdminHome } from '../admin/command-center/AdminHome';
import { AdminFamilies } from '../admin/command-center/AdminFamilies';
import { AdminFinance } from '../admin/command-center/AdminFinance';
import { AdminOrders } from '../admin/command-center/AdminOrders';
import { AdminStore } from '../admin/command-center/AdminStore';
import { AdminResearch } from '../admin/command-center/AdminResearch';
import { AdminTelemetry } from '../admin/command-center/AdminTelemetry';
import { useFamilyWorkspace } from '../admin/command-center/hooks/useFamilyWorkspace';
import { useOrdersWorkspace } from '../admin/command-center/hooks/useOrdersWorkspace';
import { useOrderDetail } from '../admin/command-center/hooks/useOrderDetail';
import { useStoreWorkspace } from '../admin/command-center/hooks/useStoreWorkspace';
import type { QuickActionId } from '../admin/command-center/QuickActions';
import {
  composeAdminTriage,
  type TriageItem,
} from '../../services/admin-triage-service';
import { fetchOrderTimeline } from '../../services/order-tracking-service';
import { Badge, type BadgeVariant } from '../../design-system/components/Badge';
import type { TranslationKey } from '../../i18n';

/**
 * The only legacy anchor still reachable by navigation: the sidebar 'team'
 * item. Every other anchor id was removed in G0-A as provably untargeted.
 */
type LegacySectionAnchor = 'team';
import {
  sendInvitation,
  resendInvitation,
  invitationChip,
  isOperationalMember,
  messageKeyFor,
  successMessageKeyFor,
  toInviteOutcome,
  type InvitationRow,
} from '../../services/pilot-invite-service';

/**
 * PilotOpsAdminScreen — Phase 7 + 9 (Gate SO / Gate A).
 * Inspects neighborhoods / stores / families and runs store order operations
 * through the operator-or-admin RPCs (00065). Server re-authorizes every call
 * with `fn_admin_uid()` / operator check — this screen is surface only.
 */
export const PilotOpsAdminScreen = memo(function PilotOpsAdminScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [operators, setOperators] = useState<OperatorMembership[]>([]);
  const [couriers, setCouriers] = useState<CourierMembership[]>([]);
  const [storeId, setStoreId] = useState('');
  // Command Center views (G1/G2): home + independent sections render inside
  // AdminShell; 'legacy' preserves the remaining long-form screen below.
  // The family domain lives in useFamilyWorkspace (single instance shared by
  // the staff UI reads and the AdminFamilies section) — never duplicated.
  const [commandView, setCommandView] = useState<'home' | 'families' | 'finance' | 'orders' | 'store' | 'research' | 'telemetry' | 'legacy'>('home');
  const fw = useFamilyWorkspace({ storeId });
  const { refreshInvitations } = fw;
  const ow = useOrdersWorkspace({ storeId, authStatus: authState.status });
  const od = useOrderDetail();
  const sw = useStoreWorkspace({ storeId, stores, neighborhoods });

  /** Switch to the legacy view and scroll to a section anchor (G1 nav). */
  const openLegacySection = useCallback((anchor: LegacySectionAnchor) => {
    setCommandView('legacy');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Guarded: scrollIntoView is absent in some runtimes (and all of it
        // is progressive enhancement — navigation itself already happened).
        const el = document.getElementById(`cc-section-${anchor}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'start' });
        }
      });
    });
  }, []);

  /**
   * Sidebar section mapping (consolidation): finance, orders, store, research
   * and telemetry are independent pages; families, deposits and family
   * invitations stay on the Families page. Team stays on the staff surface.
   */
  const handleCommandNavigate = useCallback(
    (id: string) => {
      if (id === 'home') {
        setCommandView('home');
        return;
      }
      if (id === 'finance') {
        setCommandView('finance');
        return;
      }
      if (id === 'families' || id === 'deposit' || id === 'invite') {
        setCommandView('families');
        return;
      }
      if (id === 'orders') {
        setCommandView('orders');
        return;
      }
      if (id === 'store') {
        setCommandView('store');
        return;
      }
      if (id === 'research') {
        setCommandView('research');
        return;
      }
      if (id === 'telemetry') {
        setCommandView('telemetry');
        return;
      }
      openLegacySection('team');
    },
    [openLegacySection],
  );

  const handleCommandQuickAction = useCallback(
    (id: QuickActionId) => {
      if (id === 'deposit') {
        setCommandView('finance');
        return;
      }
      if (id === 'invite') {
        setCommandView('families');
        return;
      }
      if (id === 'orders') {
        setCommandView('orders');
        return;
      }
    },
    [],
  );
  const [health, setHealth] = useState<PilotHealth | null>(null);
  // Admin triage inputs (Gate 1, read-only composition): buyable counts for
  // the selected store + timeline event counts for its non-terminal orders.
  // Best-effort only — missing data yields no triage item, never an alarm.
  // The buyable count derives from the Store workspace's single product read,
  // so the host no longer fetches the catalog itself.
  const [triageTimelines, setTriageTimelines] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [searchResults, setSearchResults] = useState<AdminUserLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [pilotStart, setPilotStart] = useState<PilotStartStatus | null>(null);
  /**
   * Distinguishes "still loading" from "the read failed" (G0-A). Without it a
   * failed pilot_admin_pilot_start_status leaves `pilotStart === null` and the
   * panel renders the loading label forever.
   */
  const [pilotStartFailed, setPilotStartFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  // Invitations (Gate 1B) — server-authoritative lifecycle rows for this store.
  // (family domain state lives in useFamilyWorkspace; staff UI reads it.)
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'operator' | 'courier'>('courier');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ns, h] = await Promise.all([
        adminListNeighborhoods(),
        fetchPilotHealth(),
      ]);
      setNeighborhoods(ns);
      setHealth(h);
      const myStores: Store[] = [];
      for (const n of ns) {
        const ss = await adminListStores(n.id);
        myStores.push(...ss);
      }
      setStores(myStores);
      setStoreId((prev) => prev || myStores[0]?.id || '');
      setError(null);
    } catch {
      setError('ADMIN_LOAD_FAILED');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The admin order list and its realtime feed are owned by
  // useOrdersWorkspace. Triage below reads that shared list.
  // The store product read is owned by useStoreWorkspace; the buyable count
  // derives from it so the catalog is fetched once per store, never twice.
  const triageBuyable = useMemo<Record<string, number>>(
    () => (storeId && !sw.productsLoading && !sw.productsError ? { [storeId]: sw.products.length } : {}),
    [storeId, sw.products, sw.productsLoading, sw.productsError],
  );

  // Best-effort timeline counts still follow the shared order list, as before.
  useEffect(() => {
    let cancelled = false;
    if (!storeId) {
      setTriageTimelines({});
      return;
    }
    void (async () => {
      try {
        const open = ow.orders.filter(
          (o) => o.status !== 'delivered' && o.status !== 'cancelled',
        );
        const entries = await Promise.all(
          open.map(async (o) => {
            try {
              const tl = await fetchOrderTimeline(o.id);
              return [o.id, tl.events.length] as const;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const e of entries) {
          if (e) next[e[0]] = e[1];
        }
        setTriageTimelines(next);
      } catch {
        if (!cancelled) setTriageTimelines({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, ow.orders]);

  const refreshMembers = useCallback(async (sid: string) => {
    const [ops, cos] = await Promise.all([adminListOperators(sid), adminListCouriers(sid)]);
    setOperators(ops);
    setCouriers(cos);
  }, []);

  useEffect(() => {
    if (!storeId) {
      setOperators([]);
      setCouriers([]);
      return;
    }
    void refreshMembers(storeId).catch(() => {
      setError('ADMIN_LOAD_FAILED');
    });
  }, [storeId, refreshMembers]);

  const invitationFor = useCallback(
    (email: string | null | undefined, kind: 'operator' | 'courier'): InvitationRow | null => {
      if (!email) return null;
      return fw.invitations.find((i) => i.invite_email === email && i.member_kind === kind) ?? null;
    },
    // Family domain state lives in useFamilyWorkspace; staff UI reads it.
    [fw.invitations],
  );

  const handleInvite = useCallback(
    async (role: 'operator' | 'courier', email: string, resend: boolean) => {
      if (!storeId || inviting) return;
      const normalized = email.trim().toLowerCase();
      if (!normalized) return;
      setInviting(true);
      setError(null);
      setMessage(null);
      try {
        const result = resend
          ? await resendInvitation({ storeId, role, email: normalized })
          : await sendInvitation({ storeId, role, email: normalized });
        if (result.ok) {
          const outcome = toInviteOutcome(result);
          if (outcome.kind === 'noop') {
            // P3: no email was dispatched (address already active) — report
            // honestly instead of "sent", and keep the form populated.
            setMessage('INVITE_NOT_NEEDED');
          } else {
            setMessage(successMessageKeyFor(result.code === 'INVITATION_RESENT'));
            setInviteEmail('');
          }
          await refreshInvitations();
        } else {
          setError(messageKeyFor(result.code));
        }
      } catch {
        setError('INVITE_SEND_FAILED');
      } finally {
        setInviting(false);
      }
    },
    [storeId, inviting, refreshInvitations],
  );

  // Family invitations live in useFamilyWorkspace (AdminFamilies section).

  const renderInviteControls = (
    role: 'operator' | 'courier',
    email: string | null | undefined,
    operational: boolean,
  ): ReactNode => {
    if (!email) return null;
    const row = invitationFor(email, role);
    const chip = invitationChip({ operational, invitation: row });
    const badgeVariant: BadgeVariant =
      chip.labelKey === 'invite.status.operational'
        ? 'success'
        : chip.labelKey === 'invite.status.noInvitation'
          ? 'neutral'
          : chip.canResend
            ? 'warning'
            : 'info';
    return (
      <Flex justify="flex-start" align="center" gap="sm">
        <Badge variant={badgeVariant}>{t(chip.labelKey as TranslationKey)}</Badge>
        {chip.canSend && (
          <Button
            variant="primary"
            size="sm"
            disabled={inviting}
            onClick={() => void handleInvite(role, email, false)}
          >
            {t('invite.send')}
          </Button>
        )}
        {chip.canResend && (
          <Button
            variant="secondary"
            size="sm"
            disabled={inviting}
            onClick={() => void handleInvite(role, email, true)}
          >
            {t(row?.status === 'PENDING' ? 'invite.retry' : 'invite.resend')}
          </Button>
        )}
      </Flex>
    );
  };

  // The courier eligible to start: the server-authoritative read uses the first
  // ACTIVE + READY courier membership of the store; START re-verifies server-side.
  const designatedCourierId = useMemo(() => {
    if (!storeId) return null;
    const activeReady = couriers.find((c) => c.status === 'active' && c.operational_ready === true);
    return activeReady?.user_id ?? null;
  }, [storeId, couriers]);

  // Admin triage overview (Gate 1): pure client-side composition over data
  // this screen already loads, plus best-effort buyable/timeline counts.
  // Visibility only — every action stays server-authorized as before.
  const triageItems: TriageItem[] = useMemo(
    () =>
      composeAdminTriage({
        operators: operators.map((m) => ({
          userId: m.user_id,
          storeId: m.store_id,
          name: m.user_name ?? m.user_email ?? m.user_id,
          status: m.status,
          operationalReady: m.operational_ready === true,
        })),
        couriers: couriers.map((m) => ({
          userId: m.user_id,
          storeId: m.store_id,
          name: m.user_name ?? m.user_email ?? m.user_id,
          status: m.status,
          operationalReady: m.operational_ready === true,
        })),
        stores: stores
          .filter((s) => s.id === storeId)
          .map((s) => ({ id: s.id, name: s.name })),
        orders: ow.orders.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          storeId: o.store_id,
          status: o.status,
          courierUserId: o.courier_user_id ?? null,
        })),
        buyableCountByStore: triageBuyable,
        timelineCountByOrder: triageTimelines,
      }),
    [operators, couriers, stores, ow.orders, triageBuyable, triageTimelines, storeId],
  );

  const triageCounts = useMemo(() => {
    let actionRequired = 0;
    let watch = 0;
    let review = 0;
    for (const item of triageItems) {
      if (item.severity === 'action-required') actionRequired += 1;
      else if (item.severity === 'watch') watch += 1;
      else review += 1;
    }
    return { actionRequired, watch, review };
  }, [triageItems]);

  const triageBadgeVariant = (
    severity: TriageItem['severity'],
  ): 'warning' | 'info' | 'neutral' => {
    if (severity === 'action-required') return 'warning';
    if (severity === 'watch') return 'info';
    return 'neutral';
  };

  const triageSeverityLabel = (severity: TriageItem['severity']): string => {
    if (severity === 'action-required') return t('triage.severityActionRequired');
    if (severity === 'watch') return t('triage.severityWatch');
    return t('triage.severityReview');
  };

  // Server truth for the pilot panel: precondition readout, open run, and the
  // post-START drift validity (Option A). Loaded with the same RPC the START
  // call will use, refreshed whenever the designated courier changes.
  useEffect(() => {
    if (!storeId) {
      setPilotStart(null);
      setPilotStartFailed(false);
      return;
    }
    let cancelled = false;
    void fetchPilotStartStatus(storeId, designatedCourierId ?? undefined)
      .then((st) => {
        if (cancelled) return;
        setPilotStart(st);
        setPilotStartFailed(false);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setPilotStartFailed(true);
        setError('START_STATUS_FAILED');
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, designatedCourierId]);

  const setOperator = useCallback(
    async (userId: string, status: OperatorStatus) => {
      if (!storeId) return;
      try {
        await adminSetOperatorStatus(storeId, userId, status);
        setMessage('OPERATOR_STATUS_UPDATED');
        setError(null);
        setOperators(await adminListOperators(storeId));
      } catch {
        setError('OPERATORS_LOAD_FAILED');
      }
    },
    [storeId],
  );

  const setCourier = useCallback(
    async (userId: string, status: CourierStatus) => {
      if (!storeId) return;
      try {
        await adminSetCourierStatus(storeId, userId, status);
        setMessage('COURIER_STATUS_UPDATED');
        setError(null);
        setCouriers(await adminListCouriers(storeId));
      } catch {
        setError('COURIERS_LOAD_FAILED');
      }
    },
    [storeId],
  );

  const isAdmin = authState.user?.role === 'admin' || authState.user?.role === 'super_admin';

  const setReady = useCallback(
    async (kind: MemberKind, userId: string, ready: boolean) => {
      if (!storeId || !isAdmin) return;
      if (!ready && !window.confirm(t('pilot.clearReadyConfirm'))) return;
      try {
        await setOperationalReady({
          memberKind: kind,
          storeId,
          userId,
          ready,
          reason: ready ? '' : 'admin manual clear',
        });
        setMessage(ready ? 'READY_OK' : 'READY_CLEARED');
        setError(null);
        setOperators(await adminListOperators(storeId));
        setCouriers(await adminListCouriers(storeId));
      } catch {
        setError('READY_FAILED');
      }
    },
    [storeId, isAdmin, t],
  );

  /**
   * G0-A: member triage items carry `destination: 'pilot-admin'` — the screen
   * already mounted — so dispatching NAVIGATE to it was a no-op. Route those
   * to the EXISTING member handlers instead. Order/store items keep their
   * `pilot-store-ops` navigation, which is where the write lives.
   */
  const handleTriageAction = useCallback(
    (item: TriageItem) => {
      if (item.entityType === 'operator') {
        if (item.action.kind === 'approve-member') {
          void setOperator(item.entityId, 'active');
          return;
        }
        if (item.action.kind === 'set-ready') {
          void setReady('operator', item.entityId, true);
          return;
        }
      }
      if (item.entityType === 'courier') {
        if (item.action.kind === 'approve-member') {
          void setCourier(item.entityId, 'active');
          return;
        }
        if (item.action.kind === 'set-ready') {
          void setReady('courier', item.entityId, true);
          return;
        }
      }
      if (item.entityType === 'operator' || item.entityType === 'courier') {
        // view-detail for a member: the team roster IS the detail surface.
        openLegacySection('team');
        return;
      }
      dispatch({ type: 'NAVIGATE', screen: item.destination });
    },
    [dispatch, setOperator, setCourier, setReady, openLegacySection],
  );

  const handleStartPilot = useCallback(async () => {
    if (!storeId || !designatedCourierId || !isAdmin) return;
    if (!window.confirm(t('pilot.startPilotConfirm'))) return;
    setStarting(true);
    setError(null);
    try {
      await startPilot({ storeId, courierUserId: designatedCourierId });
      setMessage('START_OK');
      setPilotStart(await fetchPilotStartStatus(storeId, designatedCourierId));
      setPilotStartFailed(false);
    } catch (e) {
      const code = (e as Error).message;
      setError(code === 'ALREADY_STARTED' ? 'ALREADY_STARTED' : 'START_FAILED');
    } finally {
      setStarting(false);
    }
  }, [storeId, designatedCourierId, isAdmin, t]);

  const searchUsers = useCallback(async () => {
    if (!storeId) return;
    setSearching(true);
    try {
      setSearchResults(await adminFindUsers(email, 20));
      setMessage('SEARCH_DONE');
      setError(null);
    } catch {
      setError('SEARCH_FAILED');
    } finally {
      setSearching(false);
    }
  }, [email, storeId]);

  const provisionMember = useCallback(
    async (userId: string, kind: 'operator' | 'courier') => {
      if (!storeId) return;
      try {
        if (kind === 'operator') {
          await adminSetOperatorStatus(storeId, userId, 'pending');
        } else {
          await adminSetCourierStatus(storeId, userId, 'pending');
        }
        setMessage('PROVISION_OK');
        setError(null);
        await refreshMembers(storeId);
      } catch {
        setError('PROVISION_FAILED');
      }
    },
    [storeId, refreshMembers],
  );

  const handleReset = useCallback(async () => {
    if (!window.confirm(t('pilot.resetConfirm'))) return;
    try {
      await resetPilot();
      setMessage('RESET_OK');
      setError(null);
      setStores([]);
      setStoreId('');
      await load();
    } catch {
      setError('RESET_FAILED');
    }
  }, [t, load]);

  const labelStyle = { color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const tErrorStyle = { color: colors.danger, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const name = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);

  // Command Center views (G2.1): home + independent families section render
  // inside AdminShell; legacy below keeps every other section byte-preserved.
  if (commandView === 'families') {
    return (
      <AdminShell active="families" onNavigate={handleCommandNavigate}>
        <AdminFamilies workspace={fw} />
      </AdminShell>
    );
  }

  if (commandView === 'finance') {
    return (
      <AdminShell active="finance" onNavigate={handleCommandNavigate}>
        <AdminFinance workspace={fw} isAdmin={isAdmin} />
      </AdminShell>
    );
  }

  if (commandView === 'orders') {
    return (
      <AdminShell active="orders" onNavigate={handleCommandNavigate}>
        <AdminOrders
          orders={ow}
          detail={od}
          stores={stores}
          storeId={storeId}
          onStoreChange={setStoreId}
          families={fw.families}
        />
      </AdminShell>
    );
  }

  if (commandView === 'store') {
    return (
      <AdminShell active="store" onNavigate={handleCommandNavigate}>
        <AdminStore
          workspace={sw}
          stores={stores}
          storeId={storeId}
          onStoreChange={setStoreId}
        />
      </AdminShell>
    );
  }

  if (commandView === 'research') {
    return (
      <AdminShell active="research" onNavigate={handleCommandNavigate}>
        <AdminResearch />
      </AdminShell>
    );
  }

  if (commandView === 'telemetry') {
    return (
      <AdminShell active="telemetry" onNavigate={handleCommandNavigate}>
        <AdminTelemetry health={health} />
      </AdminShell>
    );
  }

  if (commandView === 'home') {
    const activeStore = stores.find((s) => s.id === storeId) ?? null;
    return (
      <AdminShell active="home" onNavigate={handleCommandNavigate}>
        <AdminHome
          data={{
            members: fw.allMembers,
            orders: ow.orders,
            ordersScopeLabel: activeStore ? name(activeStore.name, activeStore.name_ar) : t('cc.navStore'),
            invitations: fw.invitations,
          }}
          onQuickAction={handleCommandQuickAction}
          onOpenSettings={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}
        />
      </AdminShell>
    );
  }

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.opsTitle')}</h1>
          <Flex gap="sm" align="center">
            <Button variant="ghost" size="sm" onClick={() => setCommandView('home')}>
              {t('cc.navHome')}
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}>
              {t('pilot.backSettings')}
            </Button>
          </Flex>
        </Flex>
        <Divider />

        {message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tMsg(message)}</span>}
        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(error)}</span>}

        {ow.feedStatus === 'fallback' && (
          <span style={{ color: colors.warning, fontSize: '0.8rem' }}>
            {t('pilot.staleIndicator' as TranslationKey)}
          </span>
        )}

        {/* Admin triage overview (Gate 1, read-only composition over loaded
            admin data for the selected store; visibility only). */}
        <span style={labelStyle}>{t('triage.title')}</span>
        <span style={mutedStyle}>{t('triage.scopeStore')}</span>
        {triageItems.length === 0 ? (
          <span style={mutedStyle}>{t('triage.empty')}</span>
        ) : (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            <span style={mutedStyle}>
              {t('triage.severityActionRequired')}: {String(triageCounts.actionRequired)} · {t('triage.severityWatch')}: {String(triageCounts.watch)} · {t('triage.severityReview')}: {String(triageCounts.review)}
            </span>
            {triageItems.map((item) => (
              <div key={`${item.entityType}:${item.entityId}:${item.reasonKey}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Badge variant={triageBadgeVariant(item.severity)}>{triageSeverityLabel(item.severity)}</Badge>
                <span style={{ color: colors.text, fontSize: '0.85rem', flex: 1 }}>
                  {t(item.reasonKey as TranslationKey)} · {item.detail}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleTriageAction(item)}
                >
                  {t(item.action.labelKey as TranslationKey)}
                </Button>
              </div>
            ))}
          </div>
        )}

        <span style={labelStyle}>{t('pilot.neighborhoods')}</span>
        {neighborhoods.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.emptyNeighborhoods')}</span>
        ) : (
          neighborhoods.map((n) => (
            <div key={n.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
              <div style={{ color: colors.text, fontWeight: 700 }}>{name(n.name, n.name_ar)}</div>
              <span style={mutedStyle}>
                slug: {n.slug} · status: {n.status}
              </span>
            </div>
          ))
        )}

        {health && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{t('pilot.healthTitle')}</div>
            <span style={mutedStyle}>
              🏘️ {t('pilot.neighborhoodsCount')}: {String(health.neighborhoods)} · 🏪 {t('pilot.storesCount')}: {String(health.stores)} · 👨‍👩‍👧‍👦 {t('pilot.familiesCount')}: {String(health.families)} · 🛵 {t('pilot.couriersCount')}: {String(health.couriers)}
            </span>
            <span style={mutedStyle}>
              {t('pilot.ordersTotal')}: {String(health.orders.total)} · pending {String(health.orders.pending)} · confirmed {String(health.orders.confirmed)} · preparing {String(health.orders.preparing)} · 🛵 {String(health.orders.out_for_delivery)} · ✓ {String(health.orders.delivered)} · ✗ {String(health.orders.cancelled)}
            </span>
            <span style={mutedStyle}>
              📊 {t('pilot.telemetryCreated')}: {String(health.telemetry.order_created)} · {t('pilot.telemetryCompleted')}: {String(health.telemetry.order_completed)} · {t('pilot.telemetryFailed')}: {String(health.telemetry.order_failed)}
            </span>
          </div>
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.families')}</span>
        {fw.families.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noFamilies')}</span>
        ) : (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            {fw.families.map((f) => (
              <span key={f.id} style={mutedStyle}>
                {name(f.name, f.name_ar)} · {f.status}
              </span>
            ))}
          </div>
        )}


        <Divider />

        <span id="cc-section-team" style={labelStyle}>{t('pilot.operatorsTitle')}</span>
        <span style={mutedStyle}>{t('pilot.operatorsHint')}</span>
        {operators.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noOperators')}</span>
        ) : (
          operators.map((op) => (
            <div key={op.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
              <Flex justify="space-between" align="center">
                <span style={{ color: colors.text, fontWeight: 700 }}>{op.user_name ?? op.user_email ?? op.user_id}</span>
                <span style={mutedStyle}>
                  {op.status} · {op.operational_ready ? t('pilot.ready') : t('pilot.notReady')}
                </span>
              </Flex>
              <Flex justify="flex-start" align="center" gap="sm">
                {op.status !== 'active' && (
                  <Button variant="primary" size="sm" onClick={() => void setOperator(op.user_id, 'active')}>
                    {t('pilot.approve')}
                  </Button>
                )}
                {op.status === 'active' && (
                  <Button variant="danger" size="sm" onClick={() => void setOperator(op.user_id, 'suspended')}>
                    {t('pilot.suspend')}
                  </Button>
                )}
                {isAdmin && op.status === 'active' && !op.operational_ready && (
                  <Button variant="primary" size="sm" onClick={() => void setReady('operator', op.user_id, true)}>
                    {t('pilot.markReady')}
                  </Button>
                )}
                {isAdmin && op.status === 'active' && op.operational_ready && (
                  <Button variant="secondary" size="sm" onClick={() => void setReady('operator', op.user_id, false)}>
                    {t('pilot.clearReady')}
                  </Button>
                )}
              </Flex>
              {isAdmin &&
                renderInviteControls('operator', op.user_email, isOperationalMember(op.status, op.operational_ready === true))}
            </div>
          ))
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.couriersManagementTitle')}</span>
        <span style={mutedStyle}>{t('pilot.couriersManagementHint')}</span>
        {couriers.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noCouriers')}</span>
        ) : (
          couriers.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
              <Flex justify="space-between" align="center">
                <span style={{ color: colors.text, fontWeight: 700 }}>{c.user_name ?? c.user_email ?? c.user_id}</span>
                <span style={mutedStyle}>
                  {c.status} · {c.operational_ready ? t('pilot.ready') : t('pilot.notReady')}
                </span>
              </Flex>
              <Flex justify="flex-start" align="center" gap="sm">
                {c.status !== 'active' && (
                  <Button variant="primary" size="sm" onClick={() => void setCourier(c.user_id, 'active')}>
                    {t('pilot.approve')}
                  </Button>
                )}
                {c.status === 'active' && (
                  <Button variant="danger" size="sm" onClick={() => void setCourier(c.user_id, 'suspended')}>
                    {t('pilot.suspend')}
                  </Button>
                )}
                {isAdmin && c.status === 'active' && !c.operational_ready && (
                  <Button variant="primary" size="sm" onClick={() => void setReady('courier', c.user_id, true)}>
                    {t('pilot.markReady')}
                  </Button>
                )}
                {isAdmin && c.status === 'active' && c.operational_ready && (
                  <Button variant="secondary" size="sm" onClick={() => void setReady('courier', c.user_id, false)}>
                    {t('pilot.clearReady')}
                  </Button>
                )}
              </Flex>
              {isAdmin &&
                renderInviteControls('courier', c.user_email, isOperationalMember(c.status, c.operational_ready === true))}
            </div>
          ))
        )}

        <Divider />

        <span style={labelStyle}>{t('invite.title')}</span>
        <span style={mutedStyle}>{t('invite.hint')}</span>
        {isAdmin && storeId ? (
          <>
            <Flex gap="sm" align="center">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('invite.emailPlaceholder')}
                aria-label={t('invite.emailPlaceholder')}
              />
              <Select
                options={[
                  { value: 'courier', label: t('invite.roleCourier') },
                  { value: 'operator', label: t('invite.roleOperator') },
                ]}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'courier' | 'operator')}
                aria-label={t('invite.roleCourier')}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={inviting || !inviteEmail.trim()}
                onClick={() => void handleInvite(inviteRole, inviteEmail, false)}
              >
                {inviting ? t('invite.sending') : t('invite.send')}
              </Button>
            </Flex>
            {fw.staffInvitations.length === 0 ? (
              <span style={mutedStyle}>{t('invite.emptyRows')}</span>
            ) : (
              fw.staffInvitations.map((row) => (
                <div
                  key={`${row.invite_email}:${row.member_kind}`}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}
                >
                  <Flex justify="space-between" align="center">
                    <span style={{ color: colors.text, fontWeight: 700 }}>{row.invite_email}</span>
                    <span style={mutedStyle}>{row.member_kind}</span>
                  </Flex>
                  {renderInviteControls(row.member_kind as 'operator' | 'courier', row.invite_email, false)}
                </div>
              ))
            )}
          </>
        ) : (
          <span style={mutedStyle}>{t('pilot.startPilotStoreHint')}</span>
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.startPilotTitle')}</span>
        {isAdmin && storeId ? (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            {pilotStartFailed ? (
              <span style={tErrorStyle}>{tError('START_STATUS_FAILED')}</span>
            ) : pilotStart === null ? (
              <span style={mutedStyle}>{t('pilot.loading')}</span>
            ) : pilotStart.started ? (
              <>
                <span style={{ color: colors.successText, fontWeight: 700, fontSize: '0.9rem', display: 'block' }}>
                  {t('pilot.pilotStarted')} · {t('pilot.runLabel')} #{String(pilotStart.run?.run_index)}
                </span>
                <span style={mutedStyle}>
                  {t('pilot.startedAt')}: {pilotStart.run?.started_at ?? ''}
                </span>
                {pilotStart.valid !== null && (
                  <span style={{ color: pilotStart.valid ? colors.successText : colors.warning, fontSize: '0.8rem', display: 'block' }}>
                    {pilotStart.valid
                      ? `✓ ${t('pilot.startValid')}`
                      : `! ${t('pilot.startInvalid')} · ${pilotStart.validReasons
                          .map((r) => t(`pilot.validReason.${r}` as TranslationKey))
                          .join(' · ')}`}
                  </span>
                )}
              </>
            ) : (
              <>
                <span style={mutedStyle}>{t('pilot.pilotNotStarted')}</span>
                {(
                  [
                    ['store_active', pilotStart.preconditions.store_active],
                    ['operator_linked', pilotStart.preconditions.operator_linked],
                    ['operator_active', pilotStart.preconditions.operator_active],
                    ['operator_ready', pilotStart.preconditions.operator_ready],
                    ['courier_linked', pilotStart.preconditions.courier_linked],
                    ['courier_active', pilotStart.preconditions.courier_active],
                    ['courier_ready', pilotStart.preconditions.courier_ready],
                  ] as const
                ).map(([key, ok]) => (
                  <span key={key} style={{ color: ok ? colors.successText : colors.danger, fontSize: '0.78rem', display: 'block' }}>
                    {ok ? '✓' : '✗'} {t(`pilot.check.${key}` as TranslationKey)}
                  </span>
                ))}
                <span style={{ color: pilotStart.ready ? colors.successText : colors.danger, fontSize: '0.85rem', fontWeight: 700, display: 'block' }}>
                  {pilotStart.ready ? t('pilot.readyToStart') : t('pilot.blockedToStart')}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!pilotStart.ready || starting || !designatedCourierId}
                  onClick={() => void handleStartPilot()}
                >
                  {t('pilot.startPilot')}
                </Button>
              </>
            )}
          </div>
        ) : (
          <span style={mutedStyle}>{t('pilot.startPilotStoreHint')}</span>
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.provisionTitle')}</span>
        <span style={mutedStyle}>{t('pilot.provisionHint')}</span>
        {storeId ? (
          <>
            <Flex gap="sm" align="center">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('pilot.emailPlaceholder')}
                aria-label={t('pilot.emailPlaceholder')}
              />
              <Button variant="primary" size="sm" onClick={() => void searchUsers()} disabled={searching}>
                {t('pilot.findUser')}
              </Button>
            </Flex>
            {searchResults.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noUsersFound')}</span>
            ) : (
              searchResults.map((u) => {
                const op = u.operator_memberships?.some((m) => m.store_id === storeId && m.status === 'active');
                const cr = u.courier_memberships?.some((m) => m.store_id === storeId && m.status === 'active');
                return (
                  <div
                    key={u.user_id}
                    style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}
                  >
                    <Flex justify="space-between" align="center">
                      <span style={{ color: colors.text, fontWeight: 700 }}>{u.display_name ?? u.email ?? u.user_id}</span>
                      <span style={mutedStyle}>{u.email}</span>
                    </Flex>
                    <span style={mutedStyle}>
                      {op ? t('pilot.operatorMember') : cr ? t('pilot.courierMember') : t('pilot.notMemberHere')}
                    </span>
                    {!op && !cr && (
                      <Flex justify="flex-start" align="center" gap="sm">
                        <Button variant="primary" size="sm" onClick={() => void provisionMember(u.user_id, 'operator')}>
                          {t('pilot.addOperator')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => void provisionMember(u.user_id, 'courier')}>
                          {t('pilot.addCourier')}
                        </Button>
                      </Flex>
                    )}
                  </div>
                );
              })
            )}
          </>
        ) : (
          <span style={mutedStyle}>{t('pilot.provisionStoreHint')}</span>
        )}

        <Divider />

        {isAdmin && (
          <Button variant="danger" onClick={() => void handleReset()} style={{ width: '100%' }}>
            {t('pilot.resetPilot')}
          </Button>
        )}
      </Stack>
    </Screen>
  );
});
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  adminListFamilies,
  adminListOperators,
  adminSetOperatorStatus,
  adminFindUsers,
  fetchStoreProducts,
  type Neighborhood,
  type Store,
  type FamilyGroup,
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
  fetchStoreOrders,
  updateStoreOrderStatus,
  resetPilot,
  fetchPilotHealth,
  PILOT_ORDER_STATUSES,
  type PilotOrder,
  type PilotHealth,
} from '../../services/order-service';
import { createPilotOrderRealtime, type PilotRealtimeFeedStatus } from '../../services/pilot-realtime-service';
import {
  adminListFamilyMembers,
  adminDeposit,
  adminProvisionFamilyMember,
  adminFamilyPreferences,
  type PilotFamilyMember,
  type AdminFamilyPreferences,
} from '../../services/pilot-account-service';
import { Gate8bE2eProvisionHarness } from './Gate8bE2eProvisionHarness';
import {
  composeAdminTriage,
  type TriageItem,
} from '../../services/admin-triage-service';
import { fetchOrderTimeline } from '../../services/order-tracking-service';
import { Badge, type BadgeVariant } from '../../design-system/components/Badge';
import type { TranslationKey } from '../../i18n';
import {
  adminListInvitations,
  sendInvitation,
  resendInvitation,
  invitationChip,
  isOperationalMember,
  messageKeyFor,
  successMessageKeyFor,
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
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [operators, setOperators] = useState<OperatorMembership[]>([]);
  const [couriers, setCouriers] = useState<CourierMembership[]>([]);
  const [storeId, setStoreId] = useState('');
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [health, setHealth] = useState<PilotHealth | null>(null);
  // Admin triage inputs (Gate 1, read-only composition): buyable counts for
  // the selected store + timeline event counts for its non-terminal orders.
  // Best-effort only — missing data yields no triage item, never an alarm.
  const [triageBuyable, setTriageBuyable] = useState<Record<string, number>>({});
  const [triageTimelines, setTriageTimelines] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [searchResults, setSearchResults] = useState<AdminUserLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [feedStatus, setFeedStatus] = useState<PilotRealtimeFeedStatus>('idle');
  const feedRef = useRef<ReturnType<typeof createPilotOrderRealtime> | null>(null);
  const [pilotStart, setPilotStart] = useState<PilotStartStatus | null>(null);
  const [starting, setStarting] = useState(false);
  // Invitations (Gate 1B) — server-authoritative lifecycle rows for this store.
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'operator' | 'courier'>('courier');
  const [inviting, setInviting] = useState(false);
  // Family account management (Gate B, ADMIN ONLY): members + server balance,
  // cash deposits, and binding a user to a family. All writes go through the
  // 00100 admin RPCs which re-check fn_admin_uid() server-side.
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [familyMembers, setFamilyMembers] = useState<PilotFamilyMember[]>([]);
  const [familyPrefs, setFamilyPrefs] = useState<AdminFamilyPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [familyEmail, setFamilyEmail] = useState('');
  const [familyUserResults, setFamilyUserResults] = useState<AdminUserLookup[]>([]);
  const [familySearching, setFamilySearching] = useState(false);
  const [bindingUserId, setBindingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ns, fs, h] = await Promise.all([
        adminListNeighborhoods(),
        adminListFamilies(),
        fetchPilotHealth(),
      ]);
      setNeighborhoods(ns);
      setFamilies(fs);
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

  useEffect(() => {
    if (!storeId) {
      setOrders([]);
      return;
    }
    void fetchStoreOrders(storeId)
      .then((os) => {
        setOrders(os);
        setError(null);
      })
      .catch(() => setError('ORDER_LOAD_FAILED'));
  }, [storeId]);

  useEffect(() => {
    let cancelled = false;
    if (!storeId) {
      setTriageBuyable({});
      setTriageTimelines({});
      return;
    }
    void (async () => {
      try {
        const products = await fetchStoreProducts(storeId);
        if (!cancelled) setTriageBuyable({ [storeId]: products.length });
      } catch {
        if (!cancelled) setTriageBuyable({});
      }
      try {
        const open = orders.filter(
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
  }, [storeId, orders]);

  // Realtime subscription — the admin live view rides on the narrow
  // "Realtime read all orders (admin)" RLS policy (00082); admins need no
  // client filter, RLS + fn_admin_uid() authorizes the stream server-side.
  useEffect(() => {
    if (authState.status === 'unauthenticated') return;
    const feed = createPilotOrderRealtime({
      table: 'orders',
      channelPrefix: 'pilot-admin-ops',
      onPayload: () => {
        if (!storeId) return;
        void fetchStoreOrders(storeId).then(setOrders).catch(() => {});
      },
      onStatus: setFeedStatus,
      onPollFetch: async () => {
        if (!storeId) return;
        const os = await fetchStoreOrders(storeId);
        setOrders(os);
      },
    });
    feedRef.current = feed;
    feed.start();
    return () => { feed.stop(); feedRef.current = null; };
  }, [authState.status, storeId]);

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

  // Invitation lifecycle rows (Gate 1B). Best-effort admin read; the EF + RPCs
  // remain the server-authoritative path for every send/resend.
  useEffect(() => {
    if (!storeId) {
      setInvitations([]);
      return;
    }
    void adminListInvitations(storeId)
      .then((rows) => {
        setInvitations(rows);
        setError(null);
      })
      .catch(() => setError('INVITE_LOAD_FAILED'));
  }, [storeId]);

  // Family account management (Gate B, ADMIN ONLY). Members + balance load on
  // family selection; every write is re-authorized by the 00100 RPCs.
  useEffect(() => {
    if (!selectedFamilyId) {
      setFamilyMembers([]);
      return;
    }
    let cancelled = false;
    setFamilyLoading(true);
    void adminListFamilyMembers()
      .then((rows) => {
        if (!cancelled) setFamilyMembers(rows.filter((m) => m.family_id === selectedFamilyId));
      })
      .catch(() => {
        if (!cancelled) setError('FAMILY_MEMBERS_FAILED');
      })
      .finally(() => {
        if (!cancelled) setFamilyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFamilyId]);

  // Family vegetable preferences (read-only display; values owned by the
  // family via member RPCs; null-safe, never blocks the admin surface).
  useEffect(() => {
    if (!selectedFamilyId) {
      setFamilyPrefs(null);
      setPrefsLoading(false);
      return;
    }
    let cancelled = false;
    setPrefsLoading(true);
    void adminFamilyPreferences(selectedFamilyId)
      .then((prefs) => {
        if (!cancelled) setFamilyPrefs(prefs);
      })
      .catch(() => {
        if (!cancelled) setFamilyPrefs(null);
      })
      .finally(() => {
        if (!cancelled) setPrefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFamilyId]);

  const invitationFor = useCallback(
    (email: string | null | undefined, kind: 'operator' | 'courier'): InvitationRow | null => {
      if (!email) return null;
      return invitations.find((i) => i.invite_email === email && i.member_kind === kind) ?? null;
    },
    [invitations],
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
          setMessage(successMessageKeyFor(result.code === 'INVITATION_RESENT'));
          setInvitations(await adminListInvitations(storeId));
          setInviteEmail('');
        } else {
          setError(messageKeyFor(result.code));
        }
      } catch {
        setError('INVITE_SEND_FAILED');
      } finally {
        setInviting(false);
      }
    },
    [storeId, inviting],
  );

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
        orders: orders.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          storeId: o.store_id,
          status: o.status,
          courierUserId: o.courier_user_id ?? null,
        })),
        buyableCountByStore: triageBuyable,
        timelineCountByOrder: triageTimelines,
      }),
    [operators, couriers, stores, orders, triageBuyable, triageTimelines, storeId],
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
      return;
    }
    let cancelled = false;
    void fetchPilotStartStatus(storeId, designatedCourierId ?? undefined)
      .then((st) => {
        if (cancelled) return;
        setPilotStart(st);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('START_STATUS_FAILED');
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

  const handleStartPilot = useCallback(async () => {
    if (!storeId || !designatedCourierId || !isAdmin) return;
    if (!window.confirm(t('pilot.startPilotConfirm'))) return;
    setStarting(true);
    setError(null);
    try {
      await startPilot({ storeId, courierUserId: designatedCourierId });
      setMessage('START_OK');
      setPilotStart(await fetchPilotStartStatus(storeId, designatedCourierId));
    } catch (e) {
      const code = (e as Error).message;
      setError(code === 'ALREADY_STARTED' ? 'ALREADY_STARTED' : 'START_FAILED');
    } finally {
      setStarting(false);
    }
  }, [storeId, designatedCourierId, isAdmin, t]);

  const setStatus = useCallback(
    async (orderId: string, status: string) => {
      if (!(PILOT_ORDER_STATUSES as readonly string[]).includes(status)) return;
      try {
        await updateStoreOrderStatus(orderId, status as (typeof PILOT_ORDER_STATUSES)[number]);
        setMessage('STATUS_UPDATED');
        if (storeId) {
          setOrders(await fetchStoreOrders(storeId));
        }
      } catch {
        setError('STATUS_FAILED');
      }
    },
    [storeId],
  );

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

  const submitDeposit = useCallback(async () => {
    if (!selectedFamilyId) return;
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('DEPOSIT_INVALID');
      return;
    }
    setDepositing(true);
    setError(null);
    setMessage(null);
    try {
      await adminDeposit(selectedFamilyId, amount, depositNote.trim());
      setMessage('DEPOSIT_OK');
      setDepositAmount('');
      setDepositNote('');
      setFamilyMembers((await adminListFamilyMembers()).filter((m) => m.family_id === selectedFamilyId));
    } catch {
      setError('DEPOSIT_FAILED');
    } finally {
      setDepositing(false);
    }
  }, [selectedFamilyId, depositAmount, depositNote]);

  const searchFamilyUsers = useCallback(async () => {
    setFamilySearching(true);
    try {
      setFamilyUserResults(await adminFindUsers(familyEmail, 20));
      setError(null);
    } catch {
      setError('SEARCH_FAILED');
    } finally {
      setFamilySearching(false);
    }
  }, [familyEmail]);

  const bindToFamily = useCallback(
    async (userId: string) => {
      if (!selectedFamilyId) return;
      setBindingUserId(userId);
      setError(null);
      setMessage(null);
      try {
        await adminProvisionFamilyMember(userId, selectedFamilyId, 'active');
        setMessage('PROVISION_OK');
        setFamilyEmail('');
        setFamilyUserResults([]);
        setFamilyMembers((await adminListFamilyMembers()).filter((m) => m.family_id === selectedFamilyId));
      } catch {
        setError('FAMILY_PROVISION_FAILED');
      } finally {
        setBindingUserId(null);
      }
    },
    [selectedFamilyId],
  );

  const handleReset = useCallback(async () => {
    if (!window.confirm(t('pilot.resetConfirm'))) return;
    try {
      await resetPilot();
      setMessage('RESET_OK');
      setError(null);
      setOrders([]);
      setStores([]);
      setStoreId('');
      await load();
    } catch {
      setError('RESET_FAILED');
    }
  }, [t, load]);

  const labelStyle = { color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const name = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.opsTitle')}</h1>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}>
            {t('pilot.backSettings')}
          </Button>
        </Flex>
        <Divider />

        {message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tMsg(message)}</span>}
        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(error)}</span>}

        {feedStatus === 'fallback' && (
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
                  onClick={() => dispatch({ type: 'NAVIGATE', screen: item.destination })}
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
        {families.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noFamilies')}</span>
        ) : (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            {families.map((f) => (
              <span key={f.id} style={mutedStyle}>
                {name(f.name, f.name_ar)} · {f.status}
              </span>
            ))}
          </div>
        )}

        {isAdmin && (
          <>
            <Divider />

            <span style={labelStyle}>{t('pilot.familyAccountTitle' as TranslationKey)}</span>
            <span style={mutedStyle}>{t('pilot.familyAccountHint' as TranslationKey)}</span>
            {families.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noFamilies')}</span>
            ) : (
              <>
                <Select
                  options={families.map((f) => ({ value: f.id, label: name(f.name, f.name_ar) }))}
                  value={selectedFamilyId}
                  onChange={(e) => setSelectedFamilyId(e.target.value)}
                  placeholder={t('pilot.selectFamily' as TranslationKey)}
                  aria-label={t('pilot.selectFamily' as TranslationKey)}
                />

                {selectedFamilyId && (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
                    {familyLoading ? (
                      <span style={mutedStyle}>{t('pilot.loading')}</span>
                    ) : familyMembers.length === 0 ? (
                      <span style={mutedStyle}>{t('pilot.familyNoMembers' as TranslationKey)}</span>
                    ) : (
                      familyMembers.map((m) => (
                        <Flex key={m.member_id} justify="space-between" align="center">
                          <span style={{ color: colors.text, fontSize: '0.85rem' }}>{m.user_email}</span>
                          <span style={mutedStyle}>
                            {t('pilot.balanceLabel' as TranslationKey)}: {Number(m.balance).toFixed(2)} {t('pilot.currency')}
                          </span>
                        </Flex>
                      ))
                    )}
                  </div>
                )}

                {selectedFamilyId && (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
                    <span style={labelStyle}>{t('pilot.preferencesTitle')}</span>
                    {prefsLoading ? (
                      <span style={mutedStyle}>{t('pilot.loading')}</span>
                    ) : (familyPrefs?.preferred_delivery_time ?? '') === '' &&
                    (familyPrefs?.veg_notes ?? '') === '' ? (
                      <span style={mutedStyle}>{t('pilot.preferencesEmpty')}</span>
                    ) : (
                      <>
                        <Flex justify="space-between" align="center" style={{ padding: '0.2rem 0' }}>
                          <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>{t('pilot.preferencesTimePlaceholder')}</span>
                          <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700 }}>
                            {familyPrefs?.preferred_delivery_time || '—'}
                          </span>
                        </Flex>
                        <Flex justify="space-between" align="center" style={{ padding: '0.2rem 0' }}>
                          <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>{t('pilot.preferencesNotesPlaceholder')}</span>
                          <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700 }}>
                            {familyPrefs?.veg_notes || '—'}
                          </span>
                        </Flex>
                        {familyPrefs?.updated_at ? (
                          <span style={mutedStyle}>
                            {t('pilot.preferencesUpdated')}: {familyPrefs.updated_at}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                )}

                {selectedFamilyId && (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
                    <span style={labelStyle}>{t('pilot.depositTitle' as TranslationKey)}</span>
                    <Flex gap="sm" align="center">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder={t('pilot.depositAmountPlaceholder' as TranslationKey)}
                        aria-label={t('pilot.depositAmountPlaceholder' as TranslationKey)}
                      />
                      <Input
                        value={depositNote}
                        onChange={(e) => setDepositNote(e.target.value)}
                        placeholder={t('pilot.depositNotePlaceholder' as TranslationKey)}
                        aria-label={t('pilot.depositNotePlaceholder' as TranslationKey)}
                      />
                      <Button variant="primary" size="sm" disabled={depositing} onClick={() => void submitDeposit()}>
                        {depositing ? t('pilot.depositing' as TranslationKey) : t('pilot.depositAction' as TranslationKey)}
                      </Button>
                    </Flex>
                  </div>
                )}

                {selectedFamilyId && (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
                    <span style={labelStyle}>{t('pilot.familyProvisionTitle' as TranslationKey)}</span>
                    <Flex gap="sm" align="center">
                      <Input
                        value={familyEmail}
                        onChange={(e) => setFamilyEmail(e.target.value)}
                        placeholder={t('pilot.emailPlaceholder')}
                        aria-label={t('pilot.emailPlaceholder')}
                      />
                      <Button variant="secondary" size="sm" disabled={familySearching} onClick={() => void searchFamilyUsers()}>
                        {t('pilot.findUser')}
                      </Button>
                    </Flex>
                    {familyUserResults.map((u) => (
                      <Flex key={u.user_id} justify="space-between" align="center" style={{ marginTop: 6 }}>
                        <span style={{ color: colors.text, fontSize: '0.85rem' }}>{u.display_name ?? u.email ?? u.user_id}</span>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={bindingUserId === u.user_id}
                          onClick={() => void bindToFamily(u.user_id)}
                        >
                          {t('pilot.bindToFamily' as TranslationKey)}
                        </Button>
                      </Flex>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.operatorsTitle')}</span>
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
            {invitations.length === 0 ? (
              <span style={mutedStyle}>{t('invite.emptyRows')}</span>
            ) : (
              invitations.map((row) => (
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
            {pilotStart === null ? (
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

        <span style={labelStyle}>{t('pilot.storeOrders')}</span>
        {stores.length > 0 ? (
          <>
            <Select
              options={stores.map((s) => ({ value: s.id, label: name(s.name, s.name_ar) }))}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label={t('pilot.store')}
            />
            {orders.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noStoreOrders')}</span>
            ) : (
              orders.map((o) => (
                <div
                  key={o.id}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}
                >
                  <Flex justify="space-between" align="center">
                    <span style={{ color: colors.text, fontWeight: 700 }}>{o.order_number}</span>
                    <Select
                      options={PILOT_ORDER_STATUSES.filter(
                        (s) => !(s === 'delivered' && o.family_id),
                      ).map((s) => ({ value: s, label: s }))}
                      value={o.status}
                      onChange={(e) => void setStatus(o.id, e.target.value)}
                      aria-label="order status"
                    />
                  </Flex>
                  <span style={mutedStyle}>
                    {o.customer_name} · {o.total.toFixed(2)} · {o.created_at}
                  </span>
                </div>
              ))
            )}
          </>
        ) : (
          <span style={mutedStyle}>{t('pilot.noStores')}</span>
        )}

        <Divider />

        <Gate8bE2eProvisionHarness />

        <Divider />

        <Button variant="danger" onClick={() => void handleReset()} style={{ width: '100%' }}>
          {t('pilot.resetPilot')}
        </Button>
      </Stack>
    </Screen>
  );
});
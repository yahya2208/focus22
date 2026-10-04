import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { Flex } from '../../design-system/components/Flex';
import { useAuth } from '../../core/auth/AuthProvider';
import { fetchMyStores, fetchStoreProducts, fetchStoreOrderFamilies, type Store, type PilotProduct } from '../../services/neighborhood-service';
import {
  fetchStoreOrders,
  advanceStoreOrder,
  settleFamilyOrder,
  notifySettlePush,
  type AdminAdvanceStatus,
  type DeliveredActual,
  type PilotOrder,
  type SettlementResult,
  type SettlementDecision,
} from '../../services/order-service';
import { fetchOrderDetail, type OrderDetailPayload } from '../../services/courier-service';
import {
  createPilotOrderRealtime,
  type PilotRealtimeFeedStatus,
} from '../../services/pilot-realtime-service';
import type { TranslationKey } from '../../i18n';

/**
 * Admin-visible status labels (local copy of the family-screen mapping —
 * kept local to minimize diff). Raw DB statuses must never reach the user.
 */
const STATUS_LABELS: Record<string, string> = {
  pending: 'pilot.status.pending',
  confirmed: 'pilot.status.confirmed',
  preparing: 'pilot.status.preparing',
  out_for_delivery: 'pilot.status.outForDelivery',
  delivered: 'pilot.status.delivered',
  cancelled: 'pilot.status.cancelled',
};

/**
 * PilotStoreOpsScreen — store-operator experience (Phases 2, 6; Gate C Store).
 * Orders + full item detail + canonical status transitions. Server re-authorizes
 * every RPC (operator_user_id / admin); this screen is surface only.
 */
export const PilotStoreOpsScreen = memo(function PilotStoreOpsScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, OrderDetailPayload>>({});
  const [sellUnits, setSellUnits] = useState<Record<string, 'unit' | 'kg'>>({});
  const [delivered, setDelivered] = useState<Record<string, string>>({});
  const [settleResult, setSettleResult] = useState<SettlementResult | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  // Pending admin/operator debt decision (00124 probe): populated when the
  // server returns insufficient_balance with zero mutations. The dialog
  // below offers ACCEPT_DEBT / REJECT; the server re-validates everything.
  const [pendingDecision, setPendingDecision] = useState<{
    orderId: string;
    items: DeliveredActual[];
    available: number;
    total: number;
    shortfall: number;
    // True when opened from a confirmed-order readiness probe: figures are
    // shown, but ACCEPT/REJECT stay hidden — execution remains gated by the
    // server transition/authorization (preparing first).
    probeOnly: boolean;
  } | null>(null);
  // Family names for the order rows (admin lists; display-only, no RPC change).
  const [familyNames, setFamilyNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedStatus, setFeedStatus] = useState<PilotRealtimeFeedStatus>('idle');
  const feedRef = useRef<ReturnType<typeof createPilotOrderRealtime> | null>(null);

  const loadStores = useCallback(async () => {
    const ss = await fetchMyStores();
    setStores(ss);
    setStoreId((prev) => prev || ss[0]?.id || '');
  }, []);

  // Deep-link entry (e.g. AdminOrders "open in store ops"): navigation params
  // are display hints only — every RPC below re-authorizes server-side, so an
  // unknown/forbidden store or order id simply loads nothing.
  const deepLinkConsumed = useRef(false);
  useEffect(() => {
    if (deepLinkConsumed.current) return;
    deepLinkConsumed.current = true;
    if (routeParams.storeId) setStoreId(routeParams.storeId);
    if (routeParams.orderId) setExpanded(routeParams.orderId);
  }, [routeParams]);

  // Family names for the order rows. Served by the B3 least-privilege RPC
  // `pilot_store_order_families`: the server derives the families from this
  // store's own orders, so the screen passes no family ids. One request per
  // order load, not per order.
  useEffect(() => {
    let alive = true;
    if (!storeId) {
      setFamilyNames({});
      return () => {
        alive = false;
      };
    }
    fetchStoreOrderFamilies(storeId)
      .then((families) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const f of families) {
          map[f.id] = locale === 'ar' && f.name_ar ? f.name_ar : f.name;
        }
        setFamilyNames(map);
      })
      .catch(() => {
        if (alive) setFamilyNames({});
      });
    return () => {
      alive = false;
    };
  }, [storeId, orders, locale]);

  useEffect(() => {
    let alive = true;
    if (authState.status !== 'authenticated' && authState.status !== 'anonymous') return;
    loadStores()
      .catch(() => alive && setError('STORE_LOAD_FAILED'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [authState.status, loadStores]);

  useEffect(() => {
    if (!storeId) {
      setOrders([]);
      return;
    }
    void fetchStoreOrders(storeId)
      .then(setOrders)
      .catch(() => setError('ORDER_LOAD_FAILED'));
  }, [storeId]);

  // Catalog units (kg vs unit) for the selected store, so delivered quantities
  // are entered in the same unit the customer bought. Display-only lookup.
  useEffect(() => {
    if (!storeId) {
      setSellUnits({});
      return;
    }
    let alive = true;
    void fetchStoreProducts(storeId)
      .then((products) => {
        if (!alive) return;
        const map: Record<string, 'unit' | 'kg'> = {};
        for (const p of products as Array<PilotProduct & { sell_unit?: string | null }>) {
          map[p.id] = p.sell_unit === 'kg' ? 'kg' : 'unit';
        }
        setSellUnits(map);
      })
      .catch(() => {
        if (alive) setSellUnits({});
      });
    return () => {
      alive = false;
    };
  }, [storeId]);

  // Realtime subscription — live order updates for the selected store.
  useEffect(() => {
    if (!storeId || authState.status === 'unauthenticated') return;
    const feed = createPilotOrderRealtime({
      table: 'orders',
      filter: `store_id=eq.${storeId}`,
      channelPrefix: 'pilot-store-ops',
      onPayload: () => {
        void fetchStoreOrders(storeId).then(setOrders).catch(() => {});
      },
      onStatus: setFeedStatus,
      onPollFetch: async () => {
        const refreshed = await fetchStoreOrders(storeId);
        setOrders(refreshed);
      },
    });
    feedRef.current = feed;
    feed.start();
    return () => { feed.stop(); feedRef.current = null; };
  }, [storeId, authState.status]);

  const toggleDetail = useCallback(async (orderId: string) => {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    try {
      if (!detail[orderId]) {
        const d = await fetchOrderDetail(orderId);
        setDetail((prev) => ({ ...prev, [orderId]: d }));
        setDelivered((prev) => {
          const next = { ...prev };
          for (const it of d.items) {
            if (next[it.id] === undefined) next[it.id] = String(it.quantity);
          }
          return next;
        });
      }
      setExpanded(orderId);
    } catch {
      setError('DETAIL_FAILED');
    }
  }, [expanded, detail]);

  // Admin-owned fulfillment (Gate V1.4, Vegetables Pilot): explicit whitelist
  // advance via pilot_admin_advance_order — never binds a courier.
  const advance = useCallback(
    async (orderId: string, toStatus: AdminAdvanceStatus) => {
      try {
        await advanceStoreOrder(orderId, toStatus);
        setMessage('STATUS_UPDATED');
        setError(null);
        setExpanded(null);
        if (storeId) setOrders(await fetchStoreOrders(storeId));
      } catch {
        setError('STATUS_FAILED');
      }
    },
    [storeId],
  );

  // Admin queue actions per status. `preparing` is displayed as ready-for-handoff
  // (DB value stays preparing — no enum change); delivered is an explicit
  // admin marking AFTER the external handoff (and after settlement, which the
  // settle action below performs while still preparing).
  const adminQueueActions = (status: string): Array<{ to: AdminAdvanceStatus; labelKey: string }> => {
    switch (status) {
      case 'pending':
        return [
          { to: 'confirmed', labelKey: 'pilot.confirmOrder' },
          { to: 'cancelled', labelKey: 'pilot.cancelOrder' },
        ];
      case 'confirmed':
        return [
          { to: 'preparing', labelKey: 'pilot.startPreparing' },
          { to: 'cancelled', labelKey: 'pilot.cancelOrder' },
        ];
      case 'preparing':
        return [{ to: 'delivered', labelKey: 'pilot.markDelivered' }];
      default:
        return [];
    }
  };

  const unitOf = useCallback(
    (catalogRef: string | null): 'unit' | 'kg' => (catalogRef && sellUnits[catalogRef] === 'kg' ? 'kg' : 'unit'),
    [sellUnits],
  );

  const unitLabel = useCallback(
    (unit: 'unit' | 'kg') => t(unit === 'kg' ? ('pilot.unit.kg' as TranslationKey) : ('pilot.unit.unit' as TranslationKey)),
    [t],
  );

  // The ONE settlement path: submit actual quantities; the server records them,
  // transitions to delivered, posts the family PURCHASE and returns the totals.
  const settle = useCallback(
    async (orderId: string) => {
      // Settle execution is only meaningful at out_for_delivery (the only
      // state the transition matrix permits settling from). The button is
      // hidden elsewhere; this guard covers stale expanded state. Unknown
      // orders fall through — the server remains the authority.
      const target = orders.find((o) => o.id === orderId);
      if (target && target.status !== 'out_for_delivery') return;
      const d = detail[orderId];
      if (!d) return;
      const items: DeliveredActual[] = [];
      for (const it of d.items) {
        const qty = Number(delivered[it.id] ?? String(it.quantity));
        if (!Number.isFinite(qty) || qty < 0) {
          setError('DELIVERED_INVALID');
          return;
        }
        items.push({ id: it.id, delivered_quantity: qty });
      }
      setSettling(orderId);
      setError(null);
      setMessage(null);
      setSettleResult(null);
      setPendingDecision(null);
      try {
        const result = await settleFamilyOrder(orderId, items);
        if (result.status === 'insufficient_balance') {
          // Probe response: zero mutations server-side. Open the admin /
          // operator decision dialog with the server-computed figures.
          setPendingDecision({
            orderId,
            items,
            available: Number(result.available_balance ?? 0),
            total: Number(result.order_total ?? result.final_total ?? 0),
            shortfall: Number(result.shortfall ?? 0),
            probeOnly: false,
          });
          return;
        }
        setSettleResult(result);
        setMessage('SETTLE_OK');
        setExpanded(null);
        if (storeId) setOrders(await fetchStoreOrders(storeId));
      } catch (e) {
        const code = (e as Error).message;
        setError(code === 'ORDER_ALREADY_SETTLED' || code === 'TRANSITION_NOT_ALLOWED' ? code : 'SETTLE_FAILED');
      } finally {
        setSettling(null);
      }
    },
    [detail, delivered, storeId, orders],
  );

  // Settlement-readiness probe for confirmed orders (additive affordance).
  // Runs the NORMAL probe with no items: zero-mutation by server contract.
  // On insufficient balance it opens the decision dialog in probe-only mode
  // (figures visible, no ACCEPT/REJECT execution from this state). Any other
  // outcome means the balance covers the order — the admin advances to
  // preparing to settle through the normal path.
  const checkReadiness = useCallback(async (orderId: string) => {
    setSettling(orderId);
    setError(null);
    setMessage(null);
    setPendingDecision(null);
    try {
      const result = await settleFamilyOrder(orderId, []);
      if (result.status === 'insufficient_balance') {
        setPendingDecision({
          orderId,
          items: [],
          available: Number(result.available_balance ?? 0),
          total: Number(result.order_total ?? result.final_total ?? 0),
          shortfall: Number(result.shortfall ?? 0),
          probeOnly: true,
        });
        return;
      }
      setMessage('SETTLE_READY_TO_ADVANCE');
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'TRANSITION_NOT_ALLOWED' || code === 'ORDER_ALREADY_SETTLED') {
        // Covered-but-unsettleable from confirmed (or already settled):
        // balance is fine, the order simply must advance first.
        setMessage('SETTLE_READY_TO_ADVANCE');
      } else {
        setError(code === 'PERMISSION_DENIED' ? 'SETTLE_DENIED' : 'SETTLE_FAILED');
      }
    } finally {
      setSettling(null);
    }
  }, []);
  // Debt decision execution (00124 ACCEPT_DEBT / REJECT). The server
  // re-validates balance, authorization, and idempotency under the family
  // lock; a moved balance surfaces a fresh probe instead of executing.
  const decideSettle = useCallback(
    async (decision: Extract<SettlementDecision, 'ACCEPT_DEBT' | 'REJECT'>) => {
      if (!pendingDecision) return;
      const { orderId, items } = pendingDecision;
      // Same OFD-only scoping as settle(): a dialog left open across a
      // status change must not execute. Unknown orders fall through to the
      // server, which remains the authority.
      const target = orders.find((o) => o.id === orderId);
      if (target && target.status !== 'out_for_delivery') {
        setPendingDecision(null);
        return;
      }
      setSettling(orderId);
      setError(null);
      setMessage(null);
      try {
        const result = await settleFamilyOrder(
          orderId,
          decision === 'REJECT' ? [] : items,
          decision === 'REJECT' ? 'INSUFFICIENT_BALANCE' : '',
          decision,
        );
        if (result.status === 'insufficient_balance') {
          setPendingDecision({
            orderId,
            items,
            available: Number(result.available_balance ?? 0),
            total: Number(result.order_total ?? result.final_total ?? 0),
            shortfall: Number(result.shortfall ?? 0),
            probeOnly: false,
          });
          return;
        }
        setPendingDecision(null);
        if (decision === 'REJECT') {
          setSettleResult(null);
          setMessage('SETTLE_REJECTED');
        } else {
          setSettleResult(result);
          setMessage('SETTLE_DEBT_ACCEPTED');
        }
        setExpanded(null);
        if (storeId) setOrders(await fetchStoreOrders(storeId));
        void notifySettlePush(orderId, decision === 'REJECT' ? 'settle_rejected' : 'settle_accepted');
      } catch (e) {
        const code = (e as Error).message;
        setError(
          code === 'ORDER_ALREADY_SETTLED' || code === 'TRANSITION_NOT_ALLOWED'
            ? code
            : code === 'PERMISSION_DENIED'
              ? 'SETTLE_DENIED'
              : 'SETTLE_FAILED',
        );
      } finally {
        setSettling(null);
      }
    },
    [pendingDecision, storeId, orders],
  );

  // Debt decisions are admin/store-operator only (server-enforced; the UI
  // merely hides the buttons for anyone else). Operators qualify through
  // their own store list; couriers never see the buttons.
  const viewerRole = authState.user?.role;
  const canDecideSettle =
    viewerRole === 'admin' ||
    viewerRole === 'super_admin' ||
    stores.some((s) => s.id === storeId);

  const labelStyle = { color: colors.textMuted, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const name = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);

  if (authState.status !== 'authenticated' && authState.status !== 'anonymous') {
    return (
      <Screen>
        <Stack gap="lg">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.storeOpsTitle')}</h1>
          <Divider />
          <span style={labelStyle}>{t('pilot.signInRequired')}</span>
          <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })} style={{ width: '100%' }}>
            {t('pilot.signIn')}
          </Button>
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.storeOpsTitle')}</h1>
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

        {settleResult && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{t('pilot.settlementTitle' as TranslationKey)}</span>
            <Flex justify="space-between" align="center" style={{ marginTop: 6 }}>
              <span style={mutedStyle}>{t('pilot.subtotal')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{Number(settleResult.final_subtotal).toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
            <Flex justify="space-between" align="center">
              <span style={mutedStyle}>{t('pilot.deliveryFee')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{Number(settleResult.delivery_fee).toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
            <Flex justify="space-between" align="center">
              <span style={labelStyle}>{t('pilot.orderTotal')}</span>
              <span style={{ color: colors.text, fontWeight: 700 }}>{Number(settleResult.final_total).toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
            {settleResult.balance_after !== null && (
              <Flex justify="space-between" align="center">
                <span style={labelStyle}>{t('pilot.balanceLabel' as TranslationKey)}</span>
                <span style={{ color: colors.text, fontWeight: 700 }}>{Number(settleResult.balance_after).toFixed(2)} {t('pilot.currency')}</span>
              </Flex>
            )}
            {settleResult.debt_remaining !== null && settleResult.debt_remaining > 0 && (
              <Flex justify="space-between" align="center">
                <span style={{ color: colors.danger, fontWeight: 700 }}>{t('pilot.outstandingDebts' as TranslationKey)}</span>
                <span style={{ color: colors.danger, fontWeight: 700 }}>{Number(settleResult.debt_remaining).toFixed(2)} {t('pilot.currency')}</span>
              </Flex>
            )}
          </div>
        )}

        {pendingDecision && (
          <div style={{ border: `1px solid ${colors.danger}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            <span style={{ color: colors.danger, fontWeight: 700, fontSize: '0.9rem' }}>{t('pilot.settleInsufficientTitle' as TranslationKey)}</span>
            <Flex justify="space-between" align="center" style={{ marginTop: 6 }}>
              <span style={mutedStyle}>{t('pilot.settleAvailableBalance' as TranslationKey)}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{pendingDecision.available.toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
            <Flex justify="space-between" align="center">
              <span style={mutedStyle}>{t('pilot.settleOrderTotal' as TranslationKey)}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{pendingDecision.total.toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
            <Flex justify="space-between" align="center">
              <span style={labelStyle}>{t('pilot.settleShortfall' as TranslationKey)}</span>
              <span style={{ color: colors.danger, fontWeight: 700 }}>{pendingDecision.shortfall.toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
            {pendingDecision.probeOnly ? (
              <>
                <span style={{ ...mutedStyle, marginTop: 8 }}>{t('pilot.settleAdvanceFirstHint' as TranslationKey)}</span>
                <Flex gap="md" style={{ marginTop: 8 }}>
                  <Button variant="secondary" onClick={() => setPendingDecision(null)} disabled={settling !== null}>
                    {t('common.cancel' as TranslationKey)}
                  </Button>
                </Flex>
              </>
            ) : canDecideSettle ? (
              <Flex gap="md" style={{ marginTop: 8 }}>
                <Button onClick={() => void decideSettle('ACCEPT_DEBT')} disabled={settling !== null}>
                  {t('pilot.settleAcceptDebt' as TranslationKey)}
                </Button>
                <Button variant="secondary" onClick={() => void decideSettle('REJECT')} disabled={settling !== null}>
                  {t('pilot.settleRejectOrder' as TranslationKey)}
                </Button>
                <Button variant="secondary" onClick={() => setPendingDecision(null)} disabled={settling !== null}>
                  {t('common.cancel' as TranslationKey)}
                </Button>
              </Flex>
            ) : (
              <span style={{ ...mutedStyle, marginTop: 8 }}>{t('pilot.settleNeedsAdminDecision' as TranslationKey)}</span>
            )}
          </div>
        )}

        {loading ? (
          <span style={labelStyle}>{t('pilot.loading')}</span>
        ) : stores.length === 0 ? (
          <span style={labelStyle}>{t('pilot.noStores')}</span>
        ) : (
          <>
            <label style={labelStyle}>{t('pilot.store')}</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label={t('pilot.store')}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`,
                background: colors.bgCard, color: colors.text, fontSize: '0.9rem',
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {name(s.name, s.name_ar)}
                </option>
              ))}
            </select>

            <Divider />

            {orders.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noStoreOrders')}</span>
            ) : (
              orders.map((o) => {
                const oDetail = expanded === o.id ? detail[o.id] : undefined;
                return (
                <div key={o.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
                  <Flex justify="space-between" align="center" gap="md">
                    <div>
                      <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{o.order_number}</div>
                      <span style={mutedStyle}>
                        {o.customer_name} · {o.total.toFixed(2)} {t('pilot.currency')}
                        {o.family_id != null && familyNames[o.family_id] != null
                          ? ` · ${familyNames[o.family_id]}`
                          : ''}
                      </span>
                      <span style={mutedStyle}>
                        {t('pilot.status')}: {t((STATUS_LABELS[o.status] ?? 'pilot.status.' + o.status) as TranslationKey)}
                      </span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => void toggleDetail(o.id)}>
                      {expanded === o.id ? t('pilot.hideDetails') : t('pilot.showDetails')}
                    </Button>
                  </Flex>

                  {expanded === o.id && oDetail && (
                    <Stack gap="sm" style={{ marginTop: 8 }}>
                      <span style={mutedStyle}>
                        {oDetail.order.customer_name}
                        {oDetail.order.customer_phone ? ` · ${oDetail.order.customer_phone}` : ''}
                        {oDetail.order.zone_name ? ` · ${oDetail.order.zone_name}` : ''}
                      </span>
                      {oDetail.order.address && <span style={mutedStyle}>{t('pilot.address')}: {oDetail.order.address}</span>}
                      {oDetail.items.map((it) => {
                        const unit = unitOf(it.catalog_ref);
                        // Settlement is money-only (actuals + PURCHASE) and runs
                        // at out_for_delivery: the only state whose settle
                        // execution the transition matrix permits.
                        const canSettle = o.status === 'out_for_delivery';
                        return (
                          <div key={it.id}>
                            <Flex justify="space-between" align="center">
                              <span style={{ color: colors.text, fontSize: '0.82rem' }}>
                                {it.name ?? it.catalog_ref} — {t('pilot.requestedLabel' as TranslationKey)}: {String(it.quantity)} {unitLabel(unit)}
                              </span>
                              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{Number(it.line_total).toFixed(2)} {t('pilot.currency')}</span>
                            </Flex>
                            {canSettle && (
                              <Flex justify="space-between" align="center" gap="sm" style={{ marginTop: 4 }}>
                                <span style={mutedStyle}>{t('pilot.deliveredLabel' as TranslationKey)}</span>
                                <Flex align="center" gap="sm" style={{ maxWidth: 180 }}>
                                  <Input
                                    type="number"
                                    min="0"
                                    step={unit === 'kg' ? '0.001' : '1'}
                                    value={delivered[it.id] ?? String(it.quantity)}
                                    onChange={(e) => setDelivered((prev) => ({ ...prev, [it.id]: e.target.value }))}
                                    aria-label={t('pilot.deliveredLabel' as TranslationKey)}
                                  />
                                  <span style={mutedStyle}>{unitLabel(unit)}</span>
                                </Flex>
                              </Flex>
                            )}
                          </div>
                        );
                      })}
                      <Divider />
                      <Flex justify="space-between" align="center">
                        <span style={labelStyle}>{t('pilot.subtotal')}</span>
                        <span style={{ color: colors.text, fontWeight: 700 }}>{Number(oDetail.order.subtotal).toFixed(2)} {t('pilot.currency')}</span>
                      </Flex>
                      <Flex justify="space-between" align="center">
                        <span style={labelStyle}>{t('pilot.deliveryFee')}</span>
                        <span style={labelStyle}>{Number(oDetail.order.delivery_fee).toFixed(2)} {t('pilot.currency')}</span>
                      </Flex>
                      <Flex justify="space-between" align="center">
                        <span style={{ color: colors.text, fontWeight: 700 }}>{t('pilot.orderTotal')}</span>
                        <span style={{ color: colors.text, fontWeight: 700 }}>{Number(oDetail.order.total).toFixed(2)} {t('pilot.currency')}</span>
                      </Flex>
                      <Flex gap="sm" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                        {(o.status === 'out_for_delivery') && (
                          <Button variant="primary" size="sm" disabled={settling === o.id} onClick={() => void settle(o.id)}>
                            {settling === o.id ? t('pilot.settling' as TranslationKey) : t('pilot.settleAndDeliver' as TranslationKey)}
                          </Button>
                        )}
                        {o.status === 'preparing' && (
                          <span style={{ ...labelStyle, color: colors.successText }}>
                            {t('pilot.readyForHandoff')}
                          </span>
                        )}
                        {adminQueueActions(o.status).map((a) => (
                          <Button key={a.to} variant="primary" size="sm" onClick={() => void advance(o.id, a.to)}>
                            {t(a.labelKey as TranslationKey)}
                          </Button>
                        ))}
                        {o.status === 'confirmed' && (
                          <Button variant="secondary" size="sm" disabled={settling === o.id} onClick={() => void checkReadiness(o.id)}>
                            {t('pilot.settleCheckReadiness' as TranslationKey)}
                          </Button>
                        )}
                      </Flex>
                    </Stack>
                  )}
                </div>
              );
            })
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
});
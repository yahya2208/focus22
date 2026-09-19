import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { Flex } from '../../design-system/components/Flex';
import { useAuth } from '../../core/auth/AuthProvider';
import { fetchMyStores, fetchStoreProducts, type Store, type PilotProduct } from '../../services/neighborhood-service';
import {
  fetchStoreOrders,
  updateStoreOrderStatus,
  storeActionsFor,
  settleFamilyOrder,
  type DeliveredActual,
  type PilotOrder,
  type PilotOrderStatus,
  type SettlementResult,
} from '../../services/order-service';
import { fetchOrderDetail, type OrderDetailPayload } from '../../services/courier-service';
import {
  createPilotOrderRealtime,
  type PilotRealtimeFeedStatus,
} from '../../services/pilot-realtime-service';
import type { TranslationKey } from '../../i18n';

/**
 * PilotStoreOpsScreen — store-operator experience (Phases 2, 6; Gate C Store).
 * Orders + full item detail + canonical status transitions. Server re-authorizes
 * every RPC (operator_user_id / admin); this screen is surface only.
 */
export const PilotStoreOpsScreen = memo(function PilotStoreOpsScreen() {
  const dispatch = useAppDispatch();
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

  const act = useCallback(
    async (orderId: string, status: PilotOrderStatus) => {
      try {
        await updateStoreOrderStatus(orderId, status);
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
      const d = detail[orderId];
      if (!d) return;
      const items: DeliveredActual[] = [];
      for (const it of d.items) {
        const qty = Number(delivered[it.id] ?? String(it.quantity));
        if (!Number.isFinite(qty) || qty <= 0) {
          setError('DELIVERED_INVALID');
          return;
        }
        items.push({ id: it.id, delivered_quantity: qty });
      }
      setSettling(orderId);
      setError(null);
      setMessage(null);
      setSettleResult(null);
      try {
        const result = await settleFamilyOrder(orderId, items);
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
    [detail, delivered, storeId],
  );

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
                      </span>
                      <span style={mutedStyle}>
                        {t('pilot.status')}: {o.status}
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
                        {o.status === 'out_for_delivery' && (
                          <Button variant="primary" size="sm" disabled={settling === o.id} onClick={() => void settle(o.id)}>
                            {settling === o.id ? t('pilot.settling' as TranslationKey) : t('pilot.settleAndDeliver' as TranslationKey)}
                          </Button>
                        )}
                        {storeActionsFor(o.status).map((a) => (
                          <Button key={a.status} variant="primary" size="sm" onClick={() => void act(o.id, a.status)}>
                            {t(a.labelKey as TranslationKey)}
                          </Button>
                        ))}
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
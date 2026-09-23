/**
 * PilotMyOrdersScreen — family order history as product cards (V1.6).
 * Data logic unchanged: list from pilot_my_orders, live status via
 * FamilyOrderTimeline, balance from pilot_my_account (server-computed).
 * No raw statuses, no actor roles, no UUIDs, no technical timestamps.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useAuth } from '../../core/auth/AuthProvider';
import { useAppDispatch } from '../../store/navigation';
import {
  fetchMyOrders,
  fetchFamilyOrderItems,
  mergeRealtimeOrderPayload,
  type CustomerOrderSummary,
} from '../../services/order-tracking-service';
import {
  createPilotOrderRealtime,
  type PilotRealtimeFeedStatus,
} from '../../services/pilot-realtime-service';
import { fetchMyAccount, type PilotAccount } from '../../services/pilot-account-service';
import { useCart } from '../../core/cart/CartContext';
import { normalizeQuantityUnit, clampQuantity } from '../../core/cart/quantity';
import { InventoryService } from '../../services/inventory-service';
import type { TranslationKey } from '../../i18n';
import { FamilyOrderTimeline, stepIndexForStatus } from './family/FamilyOrderTimeline';
import { FamilyBalanceCard } from './family/FamilyBalanceCard';

const STATUS_PILL: Record<string, string> = {
  pending: 'pilot.stepReceived',
  confirmed: 'pilot.stepConfirmed',
  preparing: 'pilot.stepPreparing',
  out_for_delivery: 'pilot.readyForHandoff',
  delivered: 'pilot.stepDelivered',
  cancelled: 'pilot.orderCancelled',
};

const PILL_DOT: Record<string, string> = {
  pending: 'info',
  confirmed: 'info',
  preparing: 'warning',
  out_for_delivery: 'accent',
  delivered: 'success',
  cancelled: 'danger',
};

export const PilotMyOrdersScreen = memo(function PilotMyOrdersScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();
  const { addLine } = useCart();

  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<PilotRealtimeFeedStatus>('idle');
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<PilotAccount | null>(null);

  const feedRef = useRef<ReturnType<typeof createPilotOrderRealtime> | null>(null);

  // Family account summary (Gate A) — balance is server-computed
  // (SUM(ledger.amount)); debts are display-only tracking. Never summed here.
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let alive = true;
    void fetchMyAccount()
      .then((a) => alive && setAccount(a))
      .catch(() => alive && setAccount(null));
    return () => {
      alive = false;
    };
  }, [authState.status]);

  const loadOrders = useCallback(async () => {
    const list = await fetchMyOrders();
    setOrders(list);
    setStale(false);
  }, []);

  // Initial fetch + realtime subscription
  useEffect(() => {
    let alive = true;
    if (authState.status !== 'authenticated' && authState.status !== 'anonymous') return;
    if (!authState.user?.id) return;

    const feed = createPilotOrderRealtime({
      table: 'orders',
      filter: `user_id=eq.${authState.user.id}`,
      channelPrefix: 'pilot-my-orders',
      onPayload: (payload) => {
        if (!alive) return;
        setOrders((prev) => mergeRealtimeOrderPayload(prev, payload));
      },
      onStatus: (next) => {
        if (!alive) return;
        setFeedStatus(next);
      },
      staleAfterMs: 45_000,
      onPollFetch: async () => {
        if (!alive) return;
        await loadOrders();
      },
    });
    feedRef.current = feed;

    loadOrders()
      .catch(() => alive && setError('ORDER_LOAD_FAILED'))
      .finally(() => alive && setLoading(false));

    feed.start();

    return () => {
      alive = false;
      feed.stop();
      feedRef.current = null;
    };
  }, [authState.status, authState.user?.id, loadOrders]);

  // Poll stale indicator (every 10s check feed health)
  useEffect(() => {
    if (feedStatus !== 'fallback' && feedStatus !== 'connecting') {
      setStale(false);
      return;
    }
    const id = setInterval(() => {
      setStale(feedRef.current?.isStale() ?? false);
    }, 10_000);
    return () => clearInterval(id);
  }, [feedStatus]);

  const toggleDetails = useCallback((orderId: string) => {
    setExpandedId((cur) => (cur === orderId ? null : orderId));
  }, []);

  const [repeatNote, setRepeatNote] = useState<string | null>(null);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);

  // Repeat-to-cart: copy PRODUCTS + QUANTITIES ONLY into the cart. Prices are
  // display snapshots — submit re-resolves authoritatively from the catalog.
  // Unavailable lines are skipped with a notice, never blocking the rest.
  // Cancelled orders are never repeatable (server rejects them too).
  const repeatOrder = useCallback(
    async (order: CustomerOrderSummary) => {
      if (order.status === 'cancelled' || repeatingId != null) return;
      setRepeatingId(order.order_id);
      setRepeatNote(null);
      try {
        const lines = await fetchFamilyOrderItems(order.order_id);
        const catalog = InventoryService.getExchangeableDevices();
        const skipped: string[] = [];
        for (const line of lines) {
          const ref = (line.catalog_ref ?? '').trim();
          const live = ref !== '' ? catalog.find((r) => r.id === ref) : undefined;
          if (live == null) {
            skipped.push(line.name || ref);
            continue;
          }
          const unit = normalizeQuantityUnit(line.unit);
          const qty = clampQuantity(line.quantity, live.quantity, unit);
          if (qty <= 0) {
            skipped.push(line.name || ref);
            continue;
          }
          addLine({
            catalogRef: live.id,
            domain: 'produce',
            category: 'produce',
            brand: live.brand,
            model: live.model,
            displayUnitPrice: live.sellPrice ?? line.unit_price,
            stock: live.quantity,
            unit,
            quantity: qty,
          });
        }
        if (skipped.length > 0) {
          setRepeatNote(`${t('pilot.repeatSkipped')}: ${skipped.join('، ')}`);
        }
        dispatch({ type: 'NAVIGATE', screen: 'pilot-checkout' });
      } catch {
        setRepeatNote(t('pilot.repeatFailed'));
      } finally {
        setRepeatingId(null);
      }
    },
    [addLine, dispatch, t, repeatingId],
  );

  const isRtl = locale === 'ar';

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(isRtl ? 'ar-SA' : undefined); }
    catch { return s; }
  };

  const dotColor = (tone: string) => {
    switch (tone) {
      case 'success':
        return colors.success;
      case 'warning':
        return colors.warning;
      case 'danger':
        return colors.danger;
      case 'accent':
        return colors.accent;
      default:
        return colors.info;
    }
  };

  if (authState.status !== 'authenticated' && authState.status !== 'anonymous') {
    return (
      <Screen>
        <Flex justify="center" align="center" style={{ minHeight: '60vh' }}>
          <p>{t('pilot.error.NEEDS_AUTHENTICATION' as TranslationKey)}</p>
        </Flex>
      </Screen>
    );
  }

  return (
    <Screen maxWidth="560px" bottomPad="6rem">
      <Stack gap="lg">
        <h2 style={{ margin: 0, color: colors.text, fontSize: '1.3rem', fontWeight: 800 }}>
          {t('pilot.myOrdersTitle' as TranslationKey)}
        </h2>

        {account?.linked === true && (
          <FamilyBalanceCard
            account={account}
            recentOps={orders.slice(0, 2).map((o) => ({
              id: o.order_id,
              label: `${t('pilot.vegOrder')} #${o.order_number}`,
              total: o.total,
            }))}
          />
        )}
        {!account?.linked && account && authState.status === 'authenticated' ? (
          <p style={{ fontSize: '0.9em', color: colors.textSecondary }}>
            {t('pilot.notLinkedToFamily' as TranslationKey)}
          </p>
        ) : null}

        {stale && (
          <div style={{ color: colors.warning, fontSize: '0.85em' }}>
            {t('pilot.staleIndicator' as TranslationKey)}
          </div>
        )}

        {error && <p style={{ color: colors.danger }}>{t(error as TranslationKey)}</p>}

        {loading && <p>{t('pilot.loading' as TranslationKey)}</p>}

        {!loading && orders.length === 0 && (
          <p>{t('pilot.myOrdersEmpty' as TranslationKey)}</p>
        )}

        {repeatNote != null && (
          <p style={{ color: colors.warning, fontSize: '0.78rem', margin: '0.4rem 0 0' }}>
            {repeatNote}
          </p>
        )}

        {orders.map((order) => {
          const pillKey = STATUS_PILL[order.status] ?? 'pilot.stepReceived';
          const tone = PILL_DOT[order.status] ?? 'info';
          const expanded = expandedId === order.order_id;
          return (
            <div
              key={order.order_id}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 22,
                padding: '1rem 1.1rem',
                background: colors.bgCard,
              }}
            >
              <Flex justify="space-between" align="center" gap="md">
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: colors.text, fontWeight: 800, fontSize: '1rem' }}>
                    {`${t('pilot.vegOrder')} #${order.order_number}`}
                  </div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    📅 {formatDate(order.created_at)}
                    {order.item_count > 0 ? ` · ${order.item_count} ${t('pilot.itemsLabel' as TranslationKey)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'end', flexShrink: 0 }}>
                  <div style={{ color: colors.text, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {order.total.toLocaleString()} {t('pilot.currency' as TranslationKey)}
                  </div>
                  <div style={{ marginTop: '0.3rem' }}>
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        fontSize: '0.75rem', fontWeight: 800, color: colors.text,
                        background: colors.bgInput, border: `1px solid ${colors.border}`,
                        borderRadius: '9999px', padding: '0.25rem 0.7rem',
                      }}
                    >
                      <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor(tone) }} />
                      {t(pillKey as TranslationKey)}
                    </span>
                  </div>
                </div>
              </Flex>

              <Button
                variant="ghost"
                size="sm"
                style={{ marginTop: '0.6rem' }}
                onClick={() => toggleDetails(order.order_id)}
              >
                {expanded
                  ? t('pilot.hideDetails' as TranslationKey)
                  : t('pilot.orderDetails')}
              </Button>
              {order.status !== 'cancelled' && order.item_count > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: '0.6rem', marginInlineStart: '0.5rem' }}
                  disabled={repeatingId != null}
                  onClick={() => void repeatOrder(order)}
                >
                  {t('pilot.reorder')}
                </Button>
              )}

              {expanded && (
                <div style={{ marginTop: '0.75rem', borderTop: `1px dashed ${colors.borderLight}`, paddingTop: '0.75rem' }}>
                  <FamilyOrderTimeline status={order.status} />
                  {stepIndexForStatus(order.status) < 0 && order.status !== 'cancelled' ? (
                    <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>
                      {t('pilot.tracking' as TranslationKey)}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </Stack>
    </Screen>
  );
});

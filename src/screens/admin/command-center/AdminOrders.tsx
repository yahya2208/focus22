import { memo, useMemo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { useAppDispatch } from '../../../store/navigation';
import type { TranslationKey } from '../../../i18n';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Select } from '../../../design-system/components/Select';
import { Flex } from '../../../design-system/components/Flex';
import { GOLD, LUX_RADIUS } from './tokens';
import { formatDZD } from './KPIGrid';
import { PILOT_ORDER_STATUSES, type PilotOrder } from '../../../services/order-service';
import type { FamilyGroup, Store } from '../../../services/neighborhood-service';
import type { OrdersWorkspace } from './hooks/useOrdersWorkspace';
import type { OrderDetailWorkspace } from './hooks/useOrderDetail';

const card = (border: string, bgCard: string): React.CSSProperties => ({
  border: `1px solid ${border}`,
  borderRadius: LUX_RADIUS,
  padding: '1.1rem 1.2rem',
  background: bgCard,
  minWidth: 0,
});

const sectionTitle = (color: string): React.CSSProperties => ({
  color,
  fontSize: '0.78rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
});

const DASH = '—';

function formatServerMoney(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? formatDZD(amount) : DASH;
}

function formatServerQuantity(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? String(value) : DASH;
}

function textOrDash(value: unknown): string {
  if (value === null || value === undefined) return DASH;
  const text = String(value).trim();
  return text ? text : DASH;
}

/**
 * Independent Orders workspace (G2.3).
 *
 * Read-only by construction. It renders one store's server-provided orders,
 * lazy order detail, and the server-provided status timeline. It contains no
 * status, preparation, delivery, actual-quantity, settlement, or inventory
 * control.
 *
 * Money rules enforced here:
 * - subtotal, delivery fee, and total are displayed exactly as the server
 *   provided them. They are never recomputed, summed, or relabeled.
 * - Ordered item quantities and server line totals are displayed as ordered
 *   facts. Delivered actuals have no admin read path and are never shown.
 * - Missing optional facts render "—". A missing value never becomes zero.
 */
export const AdminOrders = memo(function AdminOrders({
  orders: w,
  detail: d,
  stores,
  storeId,
  onStoreChange,
  families,
}: {
  orders: OrdersWorkspace;
  detail: OrderDetailWorkspace;
  stores: readonly Store[];
  storeId: string;
  onStoreChange: (storeId: string) => void;
  families: readonly FamilyGroup[];
}) {
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const tk = (k: string) => t(k as TranslationKey);

  const familyNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const family of families) {
      names.set(family.id, locale === 'ar' && family.name_ar ? family.name_ar : family.name);
    }
    return names;
  }, [families, locale]);

  const selected = useMemo(
    () => w.orders.find((order) => order.id === d.selectedOrderId) ?? null,
    [w.orders, d.selectedOrderId],
  );
  const detailedOrder = d.detail?.order ?? null;
  const status = selected?.status ?? detailedOrder?.status ?? null;

  const familyNameFor = (order: PilotOrder | null) => {
    if (!order?.family_id) return null;
    return familyNameById.get(order.family_id) ?? null;
  };

  const orderRow = (order: PilotOrder) => {
    const active = order.id === d.selectedOrderId;
    const familyName = familyNameFor(order);
    return (
      <button
        key={order.id}
        type="button"
        onClick={() => d.openOrder(order.id)}
        aria-pressed={active}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'start',
          padding: '0.7rem 0.85rem',
          marginBottom: '0.5rem',
          borderRadius: 12,
          border: active ? `1px solid ${GOLD}` : `1px solid ${colors.border}`,
          background: 'transparent',
          color: colors.text,
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        <Flex justify="space-between" align="center" gap="sm">
          <span style={{ fontWeight: 700, color: active ? GOLD : colors.text }}>{textOrDash(order.order_number)}</span>
          <span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>{textOrDash(order.status)}</span>
        </Flex>
        <span style={{ display: 'block', color: colors.textSecondary, fontSize: '0.78rem', marginTop: '0.3rem' }}>
          {textOrDash(order.customer_name)}
          {order.family_id ? ` · ${familyName ?? DASH}` : ''}
        </span>
        <span
          style={{
            display: 'block',
            color: colors.text,
            fontSize: '0.82rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            marginTop: '0.25rem',
          }}
        >
          {formatServerMoney(order.total)}
        </span>
        <span style={{ display: 'block', color: colors.textMuted, fontSize: '0.72rem', marginTop: '0.15rem' }}>
          {textOrDash(order.created_at)}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: colors.text }}>{tk('cc.navOrders')}</h2>
        <p style={{ margin: '0.3rem 0 0', color: colors.textSecondary, fontSize: '0.85rem' }}>{tk('cc.ordIntro')}</p>
      </div>

      {w.feedStatus === 'fallback' && (
        <div style={{ marginBottom: '1rem' }}>
          <span style={{ color: colors.warning, fontSize: '0.8rem' }}>{tk('pilot.staleIndicator')}</span>
        </div>
      )}

      <div style={card(colors.border, colors.bgCard)}>
        <div style={sectionTitle(GOLD)}>{tk('cc.ordTitle')}</div>
        <div style={{ color: colors.textSecondary, fontSize: '0.76rem', marginBottom: '0.6rem' }}>
          {tk('cc.ordMoneyNote')}
        </div>

        <div style={{ marginBottom: '0.7rem' }}>
          <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '0.3rem' }}>
            {tk('cc.ordStoreLabel')}
          </div>
          <Select
            options={stores.map((store) => ({
              value: store.id,
              label: locale === 'ar' && store.name_ar ? store.name_ar : store.name,
            }))}
            value={storeId}
            onChange={(e) => onStoreChange(e.target.value)}
            aria-label={tk('cc.ordStoreLabel')}
          />
        </div>

        <Flex gap="sm" align="center" style={{ flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <Input
            value={w.query}
            onChange={(e) => w.setQuery(e.target.value)}
            placeholder={tk('cc.ordSearchPlaceholder')}
            aria-label={tk('cc.ordSearchPlaceholder')}
          />
          <select
            value={w.statusFilter}
            onChange={(e) => w.setStatusFilter(e.target.value as typeof w.statusFilter)}
            aria-label={tk('cc.ordStatusLabel')}
            style={{
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              padding: '0.4rem 0.6rem',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
            }}
          >
            <option value="ALL">{tk('cc.ordStatusAll')}</option>
            {PILOT_ORDER_STATUSES.map((orderStatus) => (
              <option key={orderStatus} value={orderStatus}>
                {orderStatus}
              </option>
            ))}
          </select>
        </Flex>

        {w.ordersError && (
          <div style={{ marginBottom: '0.7rem' }}>
            <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tk('pilot.error.ORDER_LOAD_FAILED')}</span>{' '}
            <Button variant="secondary" size="sm" disabled={w.ordersLoading} onClick={() => void w.refreshOrders()}>
              {tk('cc.ordRetry')}
            </Button>
          </div>
        )}

        {w.ordersLoading && w.orderCount === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.loading')}</span>
        ) : stores.length === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.noStores')}</span>
        ) : !storeId ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.ordNoStore')}</span>
        ) : w.orderCount === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.noStoreOrders')}</span>
        ) : w.visibleOrders.length === 0 ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.ordNoMatch')}</span>
        ) : (
          w.visibleOrders.map(orderRow)
        )}
      </div>

      <div style={{ ...card(colors.border, colors.bgCard), marginTop: '1rem' }}>
        <div style={sectionTitle(GOLD)}>{tk('cc.ordTimelineTitle')}</div>
        {!d.selectedOrderId || (!selected && !detailedOrder) ? (
          <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.ordSelectPrompt')}</span>
        ) : (
          <>
            <Flex justify="space-between" align="center" gap="sm" style={{ marginBottom: '0.6rem' }}>
              <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>
                {textOrDash(selected?.order_number ?? detailedOrder?.order_number)}
              </span>
              <Button variant="secondary" size="sm" onClick={() => d.closeDetail()}>
                {tk('cc.ordCloseDetail')}
              </Button>
              {(selected ?? detailedOrder) && storeId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    dispatch({
                      type: 'NAVIGATE',
                      screen: 'pilot-store-ops',
                      params: {
                        storeId,
                        orderId: (selected ?? detailedOrder)?.id ?? '',
                      },
                    })
                  }
                >
                  {tk('cc.ordOpenInStoreOps')}
                </Button>
              ) : null}
            </Flex>

            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              {tk('cc.ordDetailCustomer')}: {textOrDash(selected?.customer_name ?? detailedOrder?.customer_name)}
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              {tk('cc.ordDetailStore')}: {textOrDash(detailedOrder?.store_name ?? null)}
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              {tk('cc.ordDetailZone')}: {textOrDash(detailedOrder?.zone_name ?? null)}
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              {tk('cc.ordDetailCreated')}: {textOrDash(selected?.created_at ?? detailedOrder?.created_at)}
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
              {tk('cc.ordFamily')}:{' '}
              {selected?.family_id ? (familyNameFor(selected) ?? DASH) : tk('cc.ordNoFamily')}
            </div>

            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('pilot.subtotal')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                {formatServerMoney(selected?.subtotal ?? detailedOrder?.subtotal)}
              </span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{tk('pilot.deliveryFee')}</span>
              <span style={{ color: colors.text, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                {formatServerMoney(selected?.delivery_fee ?? detailedOrder?.delivery_fee)}
              </span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.7rem' }}>
              <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700 }}>{tk('pilot.orderTotal')}</span>
              <span style={{ color: colors.text, fontSize: '0.86rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatServerMoney(selected?.total ?? detailedOrder?.total)}
              </span>
            </Flex>
            <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '0.35rem' }}>{textOrDash(status)}</div>

            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '0.8rem 0 0.4rem' }}>
              {tk('cc.ordItemsTitle')}
            </div>
            {d.detailError ? (
              <div style={{ marginBottom: '0.6rem' }}>
                <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tk('pilot.error.DETAIL_FAILED')}</span>{' '}
                <Button variant="secondary" size="sm" disabled={d.detailLoading} onClick={() => d.retryDetail()}>
                  {tk('cc.ordRetry')}
                </Button>
              </div>
            ) : d.detailLoading ? (
              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.loading')}</span>
            ) : !d.detail || d.detail.items.length === 0 ? (
              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('cc.ordNoItems')}</span>
            ) : (
              d.detail.items.map((item) => (
                <Flex key={item.id} justify="space-between" align="center" style={{ padding: '0.25rem 0' }}>
                  <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>
                    {textOrDash(item.name ?? item.catalog_ref)} · {tk('cc.ordOrderedQty')}: {formatServerQuantity(item.quantity)}
                  </span>
                  <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatServerMoney(item.line_total)}
                  </span>
                </Flex>
              ))
            )}

            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 700, margin: '0.8rem 0 0.4rem' }}>
              {tk('cc.ordTimelineTitle')}
            </div>
            {d.timelineError ? (
              <div>
                <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tk('pilot.error.TIMELINE_FAILED')}</span>{' '}
                <Button variant="secondary" size="sm" disabled={d.timelineLoading} onClick={() => d.retryDetail()}>
                  {tk('cc.ordRetry')}
                </Button>
              </div>
            ) : d.timelineLoading ? (
              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.loading')}</span>
            ) : !d.timeline || d.timeline.events.length === 0 ? (
              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{tk('pilot.noTimeline')}</span>
            ) : (
              d.timeline.events.map((event) => (
                <div key={event.id} style={{ color: colors.textSecondary, fontSize: '0.8rem', padding: '0.2rem 0' }}>
                  {textOrDash(event.previous_status)} → {textOrDash(event.new_status)} · {textOrDash(event.event_type)} ·{' '}
                  {textOrDash(event.created_at)}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
});

/**
 * PilotFamilyPurchasesScreen — family repeat-purchase hub (GATE C4).
 *
 * Two server-authoritative surfaces in one screen:
 *   1. "مشتريات عائلتنا" — the family shared saved basket. Add/update/remove
 *      rows server-side; price/stock/unit are the live v_public_listings values
 *      returned by the RPC. "Add all to cart" is a client-side cart action only:
 *      it never creates an order, never debits the balance, and never touches
 *      the ledger — the canonical order still begins at checkout.
 *   2. Family purchase history (pilot_family_orders) — orders scoped to the
 *      caller's family server-side, not to a single user.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useCart } from '../../core/cart/CartContext';
import { useAuth } from '../../core/auth/AuthProvider';
import { produceUnitLabel } from '../../domains/listings';
import { allowsDecimalQuantity, formatQuantity, minQuantity, quantityStep } from '../../core/cart/quantity';
import {
  fetchFamilySavedItems,
  updateFamilySavedItem,
  removeFamilySavedItem,
  clearFamilySavedItems,
  fetchFamilyOrders,
  type FamilySavedItem,
  type FamilyOrder,
} from '../../services/pilot-family-service';
import type { TranslationKey } from '../../i18n';

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'pilot.status.confirmed',
  preparing: 'pilot.status.preparing',
  out_for_delivery: 'pilot.status.outForDelivery',
  delivered: 'pilot.status.delivered',
  cancelled: 'pilot.status.cancelled',
  settled: 'pilot.status.delivered',
};

function QuantityField({
  value,
  unit,
  max,
  onCommit,
}: {
  value: number;
  unit: string | null | undefined;
  max: number;
  onCommit: (next: number) => void;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState(() => formatQuantity(value, unit));
  useEffect(() => {
    setDraft(formatQuantity(value, unit));
  }, [value, unit]);
  const commit = () => {
    const parsed = Number(draft);
    onCommit(Number.isFinite(parsed) ? parsed : value);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      step={quantityStep(unit)}
      min={minQuantity(unit)}
      max={max}
      value={draft}
      aria-label="quantity"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      style={{ width: 76, padding: '4px 6px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text }}
    />
  );
}

export const PilotFamilyPurchasesScreen = memo(function PilotFamilyPurchasesScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { addLine, setQuantity: setCartQuantity } = useCart();
  const { state: authState, service: { signInAsGuest } } = useAuth();

  const [saved, setSaved] = useState<FamilySavedItem[]>([]);
  const [orders, setOrders] = useState<FamilyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const isRtl = locale === 'ar';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, o] = await Promise.all([fetchFamilySavedItems(), fetchFamilyOrders()]);
      setSaved(s);
      setOrders(o);
    } catch {
      setError('FAMILY_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const ensureAuth = useCallback(async (): Promise<boolean> => {
    if (authState.status === 'authenticated') return true;
    try {
      await signInAsGuest();
      return true;
    } catch {
      setError('NEEDS_AUTHENTICATION');
      return false;
    }
  }, [authState.status, signInAsGuest]);

  const handleQuantityChange = useCallback(
    async (item: FamilySavedItem, next: number) => {
      const ok = await ensureAuth();
      if (!ok) return;
      try {
        await updateFamilySavedItem(item.catalog_ref, next);
        setSaved((prev) => prev.map((s) => (s.catalog_ref === item.catalog_ref ? { ...s, quantity: next } : s)));
      } catch {
        setError('SAVED_FAILED');
      }
    },
    [ensureAuth],
  );

  const handleRemove = useCallback(
    async (item: FamilySavedItem) => {
      const ok = await ensureAuth();
      if (!ok) return;
      try {
        await removeFamilySavedItem(item.catalog_ref);
        setSaved((prev) => prev.filter((s) => s.catalog_ref !== item.catalog_ref));
      } catch {
        setError('SAVED_FAILED');
      }
    },
    [ensureAuth],
  );

  const handleClear = useCallback(async () => {
    const ok = await ensureAuth();
    if (!ok) return;
    try {
      await clearFamilySavedItems();
      setSaved([]);
      setConfirmClear(false);
      setMessage('SAVED_CLEARED');
    } catch {
      setError('SAVED_CLEAR_FAILED');
    }
  }, [ensureAuth]);

  // Client-side cart population only — no order, no balance, no ledger.
  const handleAddAllToCart = useCallback(() => {
    saved.forEach((item) => {
      if (!item.available || item.stock == null || item.stock <= 0) return;
      addLine({
        catalogRef: item.catalog_ref,
        domain: 'produce',
        category: 'produce',
        brand: item.name,
        model: '',
        displayUnitPrice: item.unit_price ?? null,
        stock: item.stock,
        unit: item.unit as 'kg' | undefined,
        quantity: item.quantity,
      });
    });
    dispatch({ type: 'NAVIGATE', screen: 'pilot-checkout' });
  }, [saved, addLine, dispatch]);

  const setLineQuantity = useCallback(
    (catalogRef: string, quantity: number) => setCartQuantity(catalogRef, quantity),
    [setCartQuantity],
  );

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleDateString(isRtl ? 'ar-SA' : undefined);
    } catch {
      return s;
    }
  };

  const money = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));

  if (authState.status !== 'authenticated') {
    return (
      <Screen>
        <Flex justify="center" align="center" style={{ minHeight: '60vh' }}>
          <p>{t('pilot.error.NEEDS_AUTHENTICATION' as TranslationKey)}</p>
        </Flex>
      </Screen>
    );
  }

  const labelStyle = { color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;

  return (
    <Screen>
      <Stack gap="md" style={{ padding: 16 }}>
        <Flex justify="space-between" align="center">
          <div>
            <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.familyBasketTitle' as TranslationKey)}</h1>
            <span style={labelStyle}>{t('pilot.familyBasketSubtitle' as TranslationKey)}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-storefront' })}>
            {t('pilot.backToStorefront' as TranslationKey)}
          </Button>
        </Flex>

        <Divider />

        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{t(`pilot.error.${error}` as TranslationKey)}</span>}
        {message && <span style={{ color: colors.info, fontSize: '0.85rem' }}>{t(`pilot.msg.${message}` as TranslationKey)}</span>}

        {loading ? (
          <span style={labelStyle}>{t('pilot.loading' as TranslationKey)}</span>
        ) : saved.length === 0 ? (
          <p style={{ fontSize: '0.9em', color: colors.textSecondary }}>{t('pilot.familyBasketEmpty' as TranslationKey)}</p>
        ) : (
          <>
            <Flex justify="space-between" align="center">
              <span style={labelStyle}>
                {t('pilot.familyBasketTitle' as TranslationKey)} ({String(saved.length)})
              </span>
              {confirmClear ? (
                <Flex gap="sm" align="center">
                  <Button variant="danger" size="sm" onClick={() => void handleClear()}>
                    {t('pilot.familyBasketClear' as TranslationKey)}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                    {t('pilot.hideDetails' as TranslationKey)}
                  </Button>
                </Flex>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
                  {t('pilot.familyBasketClear' as TranslationKey)}
                </Button>
              )}
            </Flex>

            <Stack gap="sm">
              {saved.map((item) => (
                <div key={item.catalog_ref} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
                  <Flex justify="space-between" align="center">
                    <div>
                      <strong style={{ color: colors.text }}>{item.name}</strong>
                      {item.available ? null : (
                        <span style={{ marginInlineStart: 8, color: colors.danger, fontSize: '0.8em' }}>
                          {t('pilot.stockLabel' as TranslationKey)}: 0
                        </span>
                      )}
                    </div>
                    <span style={{ color: colors.text, fontSize: '0.85em' }}>
                      {money(item.unit_price)} {t('pilot.currency' as TranslationKey)}
                      {item.unit ? ` / ${produceUnitLabel(item.unit as 'kg' | 'piece')}` : ''}
                    </span>
                  </Flex>
                  <Flex justify="space-between" align="center" style={{ marginTop: 6 }}>
                    <Flex align="center" gap="sm">
                      {allowsDecimalQuantity(item.unit) ? (
                        <>
                          <QuantityField
                            value={item.quantity}
                            unit={item.unit}
                            max={item.stock ?? item.quantity}
                            onCommit={(next) => void handleQuantityChange(item, next)}
                          />
                          {item.unit ? produceUnitLabel(item.unit as 'kg' | 'piece') : ''}
                        </>
                      ) : (
                        <>
                          <QuantityField
                            value={item.quantity}
                            unit={item.unit}
                            max={item.stock ?? item.quantity}
                            onCommit={(next) => void handleQuantityChange(item, next)}
                          />
                          {item.unit ? produceUnitLabel(item.unit as 'kg' | 'piece') : ''}
                        </>
                      )}
                    </Flex>
                    <Flex gap="sm" align="center">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!item.available || item.stock == null || item.stock <= 0}
                        onClick={() => {
                          addLine({
                            catalogRef: item.catalog_ref,
                            domain: 'produce',
                            category: 'produce',
                            brand: item.name,
                            model: '',
                            displayUnitPrice: item.unit_price ?? null,
                            stock: item.stock ?? item.quantity,
                            unit: item.unit as 'kg' | undefined,
                            quantity: item.quantity,
                          });
                          setLineQuantity(item.catalog_ref, item.quantity);
                          dispatch({ type: 'NAVIGATE', screen: 'pilot-checkout' });
                        }}
                      >
                        {t('pilot.addToCart' as TranslationKey)}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleRemove(item)}>
                        {t('pilot.removeSavedItem' as TranslationKey)}
                      </Button>
                    </Flex>
                  </Flex>
                </div>
              ))}
            </Stack>

            <Button variant="primary" disabled={saved.length === 0} onClick={handleAddAllToCart} style={{ width: '100%' }}>
              {t('pilot.addAllToCart' as TranslationKey)} ({String(saved.length)})
            </Button>
          </>
        )}

        <Divider />
        <span style={labelStyle}>{t('pilot.ourFamilyOrders' as TranslationKey)}</span>
        {orders.length === 0 ? (
          <p style={{ fontSize: '0.9em', color: colors.textSecondary }}>{t('pilot.familyOrdersEmpty' as TranslationKey)}</p>
        ) : (
          <Stack gap="sm">
            {orders.map((order) => (
              <div key={order.order_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
                <Flex justify="space-between" align="center">
                  <strong style={{ color: colors.text }}>{order.order_number}</strong>
                  <span style={{ color: colors.accent, fontWeight: 600, fontSize: '0.9em' }}>
                    {t((STATUS_LABELS[order.status] ?? 'pilot.status.' + order.status) as TranslationKey)}
                  </span>
                </Flex>
                <Flex justify="space-between" align="center" style={{ marginTop: 4 }}>
                  <span style={{ color: colors.textSecondary, fontSize: '0.85em' }}>
                    {formatDate(order.created_at)}
                  </span>
                  <span style={{ color: colors.text, fontSize: '0.9em' }}>
                    {money(order.total)} {t('pilot.currency' as TranslationKey)}
                  </span>
                </Flex>
                <Stack gap="sm" style={{ marginTop: 8 }}>
                  {order.items.map((line, i) => (
                    <Flex key={i} justify="space-between" align="center" style={{ fontSize: '0.85em' }}>
                      <span style={{ color: colors.text }}>
                        {line.name}
                        <span style={{ marginInlineStart: 6, color: colors.textSecondary }}>
                          × {String(line.quantity)}
                          {line.unit ? ` ${produceUnitLabel(line.unit as 'kg' | 'piece')}` : ''}
                        </span>
                      </span>
                      <span style={{ color: colors.text }}>{money(line.line_total)}</span>
                    </Flex>
                  ))}
                </Stack>
              </div>
            ))}
          </Stack>
        )}

        <Divider />
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-my-orders' })}>
          {t('pilot.reviewMyOrders' as TranslationKey)}
        </Button>
      </Stack>
    </Screen>
  );
});
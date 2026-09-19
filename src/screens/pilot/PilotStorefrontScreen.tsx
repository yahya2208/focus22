import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Select } from '../../design-system/components/Select';
import { Flex } from '../../design-system/components/Flex';
import { useCart, type CartDomain } from '../../core/cart/CartContext';
import { useAuth } from '../../core/auth/AuthProvider';
import { normalizeQuantityUnit } from '../../core/cart/quantity';
import { saveFamilyItem } from '../../services/pilot-family-service';
import type { TranslationKey } from '../../i18n';
import { produceUnitLabel, type ProduceUnit } from '../../domains/listings';
import { track } from '../../core/telemetry';
import {
  fetchActiveNeighborhoods,
  fetchActiveStores,
  fetchStoreProducts,
  type Neighborhood,
  type Store,
  type PilotProduct,
} from '../../services/neighborhood-service';

export function pilotDomain(category: string): CartDomain {
  return category === 'produce' || category === 'car' || category === 'property'
    ? category
    : 'phone';
}

/**
 * Pilot Storefront — Phase 1-4 browse surface for the Neighborhood Pilot.
 * Public-only reads (anonymous-safe RPCs). Add-to-cart keeps the canonical
 * cart model (catalogRef = inventory_items.id); the DB order happens through
 * `PilotCheckoutScreen` (Gate D), never here.
 */
export const PilotStorefrontScreen = memo(function PilotStorefrontScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { addLine, itemCount } = useCart();
  const { state: authState, service: { signInAsGuest } } = useAuth();

  const categoryFilter = routeParams.category === 'produce' ? 'produce' : null;
  const produceMode = categoryFilter === 'produce';

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [products, setProducts] = useState<PilotProduct[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedRefs, setSavedRefs] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    fetchActiveNeighborhoods()
      .then((ns) => {
        if (!alive) return;
        setNeighborhoods(ns);
        const first = ns[0];
        if (first) {
          setNeighborhoodId(first.id);
          void track({ event: 'neighborhood_view', entityType: 'neighborhood', entityId: first.id });
        }
      })
      .catch(() => alive && setError('LOAD_FAILED'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!neighborhoodId) return;
    setStores([]);
    setStoreId('');
    setProducts([]);
    void fetchActiveStores(neighborhoodId)
      .then((ss) => {
        setStores(ss);
        const first = ss[0];
        if (first) setStoreId(first.id);
      })
      .catch(() => setError('LOAD_FAILED'));
  }, [neighborhoodId]);

  useEffect(() => {
    if (!storeId) {
      setProducts([]);
      return;
    }
    void track({ event: 'store_view', entityType: 'store', entityId: storeId });
    void fetchStoreProducts(storeId).then(setProducts).catch(() => setError('LOAD_FAILED'));
  }, [storeId]);

  const addToCart = useCallback(
    (p: PilotProduct) => {
      const domain = pilotDomain(p.category);
      addLine({
        catalogRef: p.id,
        domain,
        category: domain,
        brand: p.brand,
        model: p.model,
        displayUnitPrice: p.sell_price,
        stock: p.quantity,
        unit: normalizeQuantityUnit(p.unit),
        quantity: 1,
      });
    },
    [addLine],
  );

  const handleSaveForFamily = useCallback(
    async (p: PilotProduct) => {
      if (authState.status !== 'authenticated') {
        try {
          await signInAsGuest();
        } catch {
          return;
        }
      }
      setSaving((cur) => ({ ...cur, [p.id]: true }));
      try {
        await saveFamilyItem(p.id, 1);
        setSavedRefs((cur) => new Set(cur).add(p.id));
      } catch {
        setError('SAVE_FAILED');
      } finally {
        setSaving((cur) => {
          const next = { ...cur };
          delete next[p.id];
          return next;
        });
      }
    },
    [authState.status, signInAsGuest],
  );

  const buyable = useMemo(
    () =>
      products.filter(
        (p) =>
          p.quantity > 0 &&
          p.status !== 'out_of_stock' &&
          (categoryFilter == null || p.category === categoryFilter),
      ),
    [products, categoryFilter],
  );

  const labelStyle = { color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const cardStyle = { color: colors.text, fontWeight: 700, margin: '0.4rem 0' } as const;
  const name = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <div>
            <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>
              {t(produceMode ? 'pilot.storefrontVegetablesTitle' : 'pilot.storefrontTitle')}
            </h1>
            <span style={labelStyle}>
              {t(produceMode ? 'pilot.storefrontVegetablesSubtitle' : 'pilot.storefrontSubtitle')}
            </span>
          </div>
          <Flex align="center" gap="sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-family-purchases' })}
            >
              {t('pilot.familyBasketTitle' as TranslationKey)}
            </Button>
            <Button
              variant="primary"
              disabled={itemCount === 0}
              onClick={() =>
                dispatch({
                  type: 'NAVIGATE',
                  screen: 'pilot-checkout',
                  params: {
                    storeId: storeId ?? '',
                  },
                })
              }
            >
              {`${t('pilot.cart')}${itemCount > 0 ? ` (${String(itemCount)})` : ''}`}
            </Button>
          </Flex>
        </Flex>

        <Divider />

        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{t('pilot.loadFailed')}</span>}

        {loading ? (
          <span style={labelStyle}>{t('pilot.loading')}</span>
        ) : (
          <>
            <label style={labelStyle}>{t('pilot.neighborhood')}</label>
            {neighborhoods.length === 0 ? (
              <span style={labelStyle}>{t('pilot.emptyNeighborhoods')}</span>
            ) : (
              <Select
                options={neighborhoods.map((n) => ({ value: n.id, label: name(n.name, n.name_ar) }))}
                value={neighborhoodId}
                onChange={(e) => setNeighborhoodId(e.target.value)}
                aria-label={t('pilot.neighborhood')}
              />
            )}

            {stores.length > 0 && (
              <>
                <label style={labelStyle}>{t('pilot.store')}</label>
                <Select
                  options={stores.map((s) => ({ value: s.id, label: name(s.name, s.name_ar) }))}
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  aria-label={t('pilot.store')}
                />
              </>
            )}

            <Divider />

            {buyable.length === 0 ? (
              <span style={labelStyle}>{t('pilot.emptyProducts')}</span>
            ) : (
              <Flex gap="md">
                {buyable.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 12,
                      padding: 12,
                      background: colors.bgCard,
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedProduct((cur) => (cur === p.id ? null : p.id))}
                  >
                    <div style={{ fontWeight: 700, color: colors.text, fontSize: '0.95rem' }}>
                      {[p.brand, p.model].filter(Boolean).join(' ')}
                    </div>
                    {p.condition ? <span style={labelStyle}>{p.condition}</span> : null}
                    <div style={cardStyle}>
                      {p.sell_price != null
                        ? `${p.sell_price.toFixed(2)} ${t('pilot.currency')}${p.unit ? ` / ${produceUnitLabel(p.unit as ProduceUnit)}` : ''}`
                        : '—'}
                    </div>
                    <span style={labelStyle}>
                      {t('pilot.stockLabel')}: {String(p.quantity)}
                      {p.unit ? ` ${produceUnitLabel(p.unit as ProduceUnit)}` : ''}
                    </span>
                    {expandedProduct === p.id && (
                      <div style={{ padding: '6px 0 10px' }}>
                        {p.description ? (
                          <span style={labelStyle}>{p.description}</span>
                        ) : null}
                        {p.city ? <span style={mutedStyle}>{t('pilot.city')}: {p.city}</span> : null}
                        {p.source_key ? <span style={mutedStyle}>{t('pilot.source')}: {p.source_key}</span> : null}
                        <span style={mutedStyle}>{t('pilot.detailsHint')}</span>
                      </div>
                    )}
                    <Button
                      variant="primary"
                      disabled={p.quantity <= 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(p);
                      }}
                      style={{ width: '100%', marginTop: 8 }}
                    >
                      {t('pilot.addToCart')}
                    </Button>
                    {produceMode && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={saving[p.id] === true}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSaveForFamily(p);
                        }}
                        style={{ width: '100%', marginTop: 8 }}
                      >
                        {savedRefs.has(p.id)
                          ? t('pilot.savedForFamily')
                          : t('pilot.saveForFamily')}
                      </Button>
                    )}
                  </div>
                ))}
              </Flex>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
});
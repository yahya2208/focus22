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
import { formatQuantity, normalizeQuantityUnit, quantityStep } from '../../core/cart/quantity';
import {
  PRODUCE_QTY_STEP,
  isProduceLine,
  produceStepDown,
} from '../../core/cart/produce-quantity';
import { useInventoryImages } from '../../hooks/useInventoryImages';
import { ProduceArtwork, resolveProduceArtKey } from './ProduceArtwork';
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

const STEPPER_BTN: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  fontWeight: 800,
  fontSize: '1.15rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

/**
 * Bucket-backed image for NON-produce cards only. Produce cards render
 * <ProduceArtwork> and never consult `inventory_images` (phones keep their
 * own gallery path untouched elsewhere).
 */
function StorefrontImage({
  recordId,
  fallbackEmoji,
  alt,
}: {
  recordId: string;
  fallbackEmoji: string;
  alt: string;
}) {
  const images = useInventoryImages(recordId, []);
  const primary = images[0];
  if (!primary) {
    return (
      <span aria-hidden="true" style={{ fontSize: '2.6rem', lineHeight: 1 }}>
        {fallbackEmoji}
      </span>
    );
  }
  return (
    <img
      src={primary}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/**
 * Family produce card (additive — non-produce modes keep every old capability):
 * 4:3 art area (tap = add 1kg first, +0.5kg merge after), name, price/kg,
 * live-quantity stepper once in cart. Produce renders <ProduceArtwork>
 * (no images dependency); other domains use the bucket-backed image.
 */
function ProduceCard({
  p,
  produceMode,
  onAdd,
  onSave,
  saved,
  saving,
}: {
  p: PilotProduct;
  produceMode: boolean;
  onAdd: (p: PilotProduct) => void;
  onSave: (p: PilotProduct) => void;
  saved: boolean;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { getLine, setQuantity, removeLine } = useCart();
  const [expanded, setExpanded] = useState(false);

  const line = getLine(p.id);
  const title = [p.brand, p.model].filter(Boolean).join(' ');
  const isProduce = pilotDomain(p.category) === 'produce';
  // Deterministic placeholder per domain (never a broken-image icon).
  const placeholderEmoji =
    pilotDomain(p.category) === 'produce'
      ? '🥬'
      : pilotDomain(p.category) === 'car'
        ? '🚗'
        : pilotDomain(p.category) === 'property'
          ? '🏠'
          : '📱';
  // Scoped produce rule: kg-produce lines step 0.5 and minus-at-0.5 removes.
  // Every other domain/unit keeps the generic clamp behavior.
  const kgProduce = line != null && isProduceLine(line) && line.unit === 'kg';

  const stepDown = () => {
    if (line == null) return;
    if (kgProduce) {
      const next = produceStepDown(line.quantity);
      if (next.action === 'remove') removeLine(line.catalogRef);
      else setQuantity(line.catalogRef, next.quantity);
      return;
    }
    setQuantity(line.catalogRef, line.quantity - quantityStep(line.unit));
  };

  const stepUp = () => {
    if (line == null) return;
    if (kgProduce) setQuantity(line.catalogRef, line.quantity + PRODUCE_QTY_STEP);
    else setQuantity(line.catalogRef, line.quantity + quantityStep(line.unit));
  };

  const labelStyle = { color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;

  return (
    <div
      style={{
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: 22,
        padding: 12,
        background: `linear-gradient(180deg, ${colors.bgCard} 0%, ${colors.bg} 100%)`,
        boxShadow: '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        cursor: 'pointer',
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={() => setExpanded((cur) => !cur)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd(p);
        }}
        aria-label={t('pilot.addToCart')}
        style={{
          display: 'block',
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            aspectRatio: '4 / 3',
            borderRadius: 16,
            overflow: 'hidden',
            background: `radial-gradient(circle at 50% 36%, ${colors.success}16 0%, transparent 68%), linear-gradient(180deg, ${colors.bgInput} 0%, ${colors.bg} 100%)`,
            border: `1px solid ${colors.glassBorder}`,
            boxShadow: 'inset 0 2px 14px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isProduce ? (
            <ProduceArtwork artKey={resolveProduceArtKey(p.source_key, p.model_id)} />
          ) : (
            <StorefrontImage recordId={p.id} fallbackEmoji={placeholderEmoji} alt={title} />
          )}
        </div>
      </button>
      <div style={{ fontWeight: 700, color: colors.text, fontSize: '0.95rem', marginTop: '0.6rem' }}>
        {title}
      </div>
      {/* Price + stock stay on unbreakable lines (never split into characters). */}
      <div style={{ color: colors.text, fontWeight: 800, margin: '0.45rem 0 0.1rem', whiteSpace: 'nowrap', wordBreak: 'keep-all', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' }}>
        {p.sell_price != null
          ? `${p.sell_price.toFixed(2)} ${t('pilot.currency')}${p.unit ? ` / ${produceUnitLabel(p.unit as ProduceUnit)}` : ''}`
          : '—'}
      </div>
      <span style={{ ...labelStyle, whiteSpace: 'nowrap', wordBreak: 'keep-all' }}>
        {t('pilot.stockLabel')}: {String(p.quantity)}
        {p.unit ? ` ${produceUnitLabel(p.unit as ProduceUnit)}` : ''}
      </span>
      {line != null ? (
        <Flex align="center" justify="center" gap="sm" style={{ marginTop: '0.6rem', border: `1px solid ${colors.glassBorder}`, borderRadius: 999, padding: '4px 6px', background: 'rgba(0,0,0,0.18)' }}>
          <button
            type="button"
            aria-label="decrease"
            onClick={(e) => {
              e.stopPropagation();
              stepDown();
            }}
            style={{ ...STEPPER_BTN, border: `1px solid ${colors.glassBorder}`, background: 'transparent', color: colors.text }}
          >
            −
          </button>
          <span style={{ minWidth: '4.5rem', textAlign: 'center', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatQuantity(line.quantity, line.unit)}
            {line.unit ? ` ${produceUnitLabel(line.unit as ProduceUnit)}` : ''}
          </span>
          <button
            type="button"
            aria-label="increase"
            onClick={(e) => {
              e.stopPropagation();
              stepUp();
            }}
            style={{ ...STEPPER_BTN, border: `1px solid ${colors.glassBorder}`, background: 'transparent', color: colors.text }}
          >
            +
          </button>
        </Flex>
      ) : (
        <Button
          variant="primary"
          disabled={p.quantity <= 0}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(p);
          }}
          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 8 }}
        >
          {t('pilot.addToCart')}
        </Button>
      )}
      {expanded && (
        <div style={{ padding: '6px 0 10px' }}>
          {p.condition ? <span style={labelStyle}>{p.condition}</span> : null}
          {p.description ? <span style={labelStyle}>{p.description}</span> : null}
          {p.city ? <span style={mutedStyle}>{t('pilot.city')}: {p.city}</span> : null}
          {p.source_key ? <span style={mutedStyle}>{t('pilot.source')}: {p.source_key}</span> : null}
          <span style={mutedStyle}>{t('pilot.detailsHint')}</span>
        </div>
      )}
      {produceMode && (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            onSave(p);
          }}
          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 8 }}
        >
          {saved ? t('pilot.savedForFamily') : t('pilot.saveForFamily')}
        </Button>
      )}
    </div>
  );
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
  const { addLine, getLine, itemCount } = useCart();
  const { state: authState, service: { signInAsGuest } } = useAuth();

  const categoryFilter = routeParams.category === 'produce' ? 'produce' : null;
  const produceMode = categoryFilter === 'produce';

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [products, setProducts] = useState<PilotProduct[]>([]);
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
        // Habitual quantity = the customer's current cart line for this
        // product (00105 stores the usual amount verbatim, never clamped to
        // stock). Falls back to the first-add quantity when not in cart.
        await saveFamilyItem(p.id, getLine(p.id)?.quantity ?? 1);
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
    [authState.status, signInAsGuest, getLine],
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
            {/* Family mode: auto-selected first neighborhood/store, so the
                operational selectors (and their divider) stay hidden. */}
            {neighborhoods.length === 0 ? (
              <span style={labelStyle}>{t('pilot.emptyNeighborhoods')}</span>
            ) : !produceMode ? (
              <>
                <label style={labelStyle}>{t('pilot.neighborhood')}</label>
                <Select
                  options={neighborhoods.map((n) => ({ value: n.id, label: name(n.name, n.name_ar) }))}
                  value={neighborhoodId}
                  onChange={(e) => setNeighborhoodId(e.target.value)}
                  aria-label={t('pilot.neighborhood')}
                />
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
              </>
            ) : null}

            {buyable.length === 0 ? (
              <span style={labelStyle}>{t('pilot.emptyProducts')}</span>
            ) : (
              <>
                {/* Wrapping grid: every card keeps its own column width, so no
                    card content can squeeze into or overlap its neighbor. */}
                <div
                  data-testid="produce-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '16px',
                    width: '100%',
                  }}
                >
                  {buyable.map((p) => (
                    <ProduceCard
                      key={p.id}
                      p={p}
                      produceMode={produceMode}
                      onAdd={addToCart}
                      onSave={(item) => void handleSaveForFamily(item)}
                      saved={savedRefs.has(p.id)}
                      saving={saving[p.id] === true}
                    />
                  ))}
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={itemCount === 0}
                  onClick={() =>
                    dispatch({
                      type: 'NAVIGATE',
                      screen: 'pilot-checkout',
                      params: { storeId: storeId ?? '' },
                    })
                  }
                  style={{ width: '100%', minHeight: '52px', marginTop: '1rem' }}
                >
                  {`${t('pilot.cart')}${itemCount > 0 ? ` (${String(itemCount)})` : ''}`}
                </Button>
              </>
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
});
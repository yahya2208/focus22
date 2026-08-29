import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { Button } from '../../design-system/components/Button';
import { Toast } from '../../design-system/components/Toast';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import { ProductImageGallery } from '../../components/showroom/ProductImageGallery';
import { PhoneGallery, USE_NEW_GALLERY } from '../../components/showroom/phone-gallery';
import { ContactOwnerAction } from '../../components/showroom/ContactOwnerAction';
import { OrderForm, toOrderable, type DeliveryCustomerDraft } from '../../components/delivery/OrderForm';
import { ProductNotFound } from '../../components/showroom/ProductNotFound';
import { SimilarPhones } from '../../components/showroom/SimilarPhones';
import { useProductDetails } from '../../hooks/useProductDetails';
import { useSimilarPhones } from '../../hooks/useSimilarPhones';
import { useServerViewCounter } from '../../hooks/useServerViewCounter';
import { usePhoneViewCounts } from '../../hooks/usePhoneViewCounts';
import { useInventoryImages } from '../../hooks/useInventoryImages';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { useFavorites } from '../../hooks/useFavorites';
import { useCart } from '../../core/cart/CartContext';
import { sendContactOwnerWhatsApp } from '../../services/whatsapp-service';
import { recordIntent } from '../../services/intent-tracking';
import { buildAppUrl } from '../../core/base-path';
import type { InventoryRecord } from '../../services/inventory-service';

/** F-102 — the product-details surface keeps the `phone-details` placement key. */
export const PRODUCT_DETAILS_AD_PLACEMENT = 'phone-details' as const;

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
};

const formatDate = (iso: string, locale: string): string => {
  try {
    return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
};

/**
 * Phone Details — the listing page (§3.2) + not-available branch (§3.3).
 * Lazy-loaded, id via routeParams, record re-read from InventoryService.
 * Header: back · share · favorite(لاحقاً). BATCH 3: exactly ONE contact CTA
 * («تواصل مع صاحب الإعلان») — FOCUS is a mediator only; WhatsApp is opened
 * exclusively from this page, never from the ad itself. Similar-phones
 * carousel pushes NAVIGATE phone-details (stack preserved).
 */
export const ProductDetailsScreen = memo(function ProductDetailsScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale, dir } = useTranslation();
  const colors = useThemeColors();

  const deviceId = routeParams.device;
  const { device, notFound } = useProductDetails(deviceId);
  const similar = useSimilarPhones(device);
  // Keep useServerViewCounter for its side-effect (fires recordPhoneView).
  // The displayed count comes from the server via usePhoneViewCounts.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { count: _views } = useServerViewCounter(deviceId, 'detail_view', { autoStart: true });
  const { counts: serverCounts, refetch: refetchViews } = usePhoneViewCounts(deviceId ? [deviceId] : []);
  const serverViews = deviceId ? (serverCounts[deviceId]?.total_views ?? 0) : 0;

  // Re-fetch after the view event fires (2s) + buffer, so the UI shows the updated server count
  const refetchedRef = useRef(false);
  useEffect(() => {
    if (!deviceId || refetchedRef.current) return;
    refetchedRef.current = true;
    const timer = setTimeout(refetchViews, 2500);
    return () => clearTimeout(timer);
  }, [deviceId, refetchViews]);
  const whatsapp = useWhatsApp();
  const favorites = useFavorites();
  const images = useInventoryImages(device?.id, device?.images ?? []);
  const cart = useCart();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Delivery order (00050). Opening the form never creates an account (P3);
  // the draft is preserved so returning from sign-in keeps the entered data.
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderQty, setOrderQty] = useState(1);
  const [orderDraft, setOrderDraft] = useState<DeliveryCustomerDraft | null>(null);

  const handleBack = useCallback(() => {
    dispatch({ type: 'BACK' });
  }, [dispatch]);

  const handleShare = useCallback(async () => {
    const url = buildAppUrl(`#/phone-details?device=${deviceId}`);
    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${device?.brand ?? ''} ${device?.model ?? ''}`.trim(), url });
        shared = true;
      } catch {
        shared = false;
      }
    }
    if (!shared) {
      await copyToClipboard(url);
      setToast({ message: t('phoneDetails.shareCopied'), type: 'success' });
    }
  }, [device, deviceId, t]);

  const handleFavorite = useCallback(() => {
    favorites.save();
  }, [favorites]);

  const handleContact = useCallback(() => {
    if (!device) return;
    try {
      recordIntent({ kind: 'whatsapp_intent', ctaType: 'inquiry', placement: 'phone-details', deviceId: device.id });
    } catch {
      // fire-and-forget — WhatsApp continues regardless
    }
    const message = sendContactOwnerWhatsApp(device);
    whatsapp.send(message, { action: 'inquiry', deviceId: device.id });
  }, [device, whatsapp]);

  const handleSimilarSelect = useCallback(
    (next: InventoryRecord) => {
      dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: next.id } });
    },
    [dispatch],
  );

  const handleOpenOrder = useCallback(() => {
    if (!device || device.quantity <= 0) return;
    setOrderDraft(null);
    setOrderQty(1);
    setOrderOpen(true);
  }, [device]);

  const handleAddToCart = useCallback(() => {
    if (!device || device.quantity <= 0) return;
    const orderable = toOrderable(device);
    cart.addLine({
      catalogRef: orderable.id,
      domain: 'phone',
      category: 'phone',
      brand: orderable.brand,
      model: orderable.model,
      displayUnitPrice: orderable.unitPrice,
      stock: orderable.stock,
      image: images[0],
      pricePeriod: 'sale',
      quantity: orderQty,
    });
    dispatch({ type: 'NAVIGATE', screen: 'cart' });
  }, [device, cart, images, orderQty, dispatch]);

  // Go to the existing sign-in flow. The order draft has already been lifted
  // into state, so re-opening the form restores the entered data.
  const handleRequestSignIn = useCallback(() => {
    setOrderOpen(false);
    dispatch({ type: 'NAVIGATE', screen: 'login' });
  }, [dispatch]);

  const handleOrderDraftChange = useCallback((next: DeliveryCustomerDraft) => {
    setOrderDraft(next);
  }, []);

  const handleOrderClose = useCallback(() => {
    setOrderOpen(false);
  }, []);

  if (notFound) {
    return (
      <Screen ariaLabel="Phone details — not available">
        <Stack gap="lg">
          <ProductNotFound onBack={handleBack} />
          <SimilarPhones devices={similar} onSelect={handleSimilarSelect} />
        </Stack>
      </Screen>
    );
  }

  if (!device) return null;

  const specs: Array<{ label: string; value: string }> = [
    { label: t('phoneDetails.company'), value: device.brand },
    { label: t('phoneDetails.model'), value: device.model },
    { label: t('phoneDetails.storage'), value: device.storage },
    ...(device.ram ? [{ label: t('phoneDetails.ram'), value: device.ram }] : []),
    ...(device.color ? [{ label: t('phoneDetails.color'), value: device.color }] : []),
    { label: t('phoneDetails.condition'), value: device.condition === 'New' ? t('showroom.conditionNew') : t('showroom.conditionUsed') },
    ...(device.batteryHealth != null ? [{ label: t('phoneDetails.battery'), value: `${device.batteryHealth}%` }] : []),
    ...(device.warranty ? [{ label: t('phoneDetails.warranty'), value: device.warranty }] : []),
  ];

  const headerBtn: React.CSSProperties = {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    borderRadius: '12px',
    padding: '0.55rem 0.8rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.8rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
  };

  return (
    <Screen ariaLabel={`Phone details — ${device.brand} ${device.model}`} bottomPad="6rem">
      <Stack gap="lg">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <button type="button" data-action="details-back" onClick={handleBack} style={headerBtn}>
            {dir === 'rtl' ? '→' : '←'} {t('phoneDetails.title')}
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" data-action="share" aria-label={t('phoneDetails.share')} onClick={handleShare} style={headerBtn}>
              ⤴ {t('phoneDetails.share')}
            </button>
            <button type="button" data-action="favorite" aria-label={t('phoneDetails.favorite')} onClick={handleFavorite} style={headerBtn}>
              ♥ {t('phoneDetails.favorite')}
            </button>
            <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={headerBtn}>
              🏠 الرئيسية
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'cart' })}
              style={{ ...headerBtn, position: 'relative' }}
              aria-label={t('cart.title')}
            >
              🛒
              {cart.itemCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', insetInlineEnd: '-4px',
                  background: colors.accent, color: colors.bgCard, borderRadius: '999px',
                  minWidth: '16px', height: '16px', fontSize: '0.6rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <Card variant="glass" padding="lg">
          <Stack gap="md">
            {USE_NEW_GALLERY ? (
              <PhoneGallery images={images} name={`${device.brand} ${device.model}`} />
            ) : (
              <ProductImageGallery images={images} name={`${device.brand} ${device.model}`} />
            )}

            {USE_NEW_GALLERY && (
              <button
                type="button"
                onClick={() => dispatch({
                  type: 'NAVIGATE', screen: 'showroom',
                  params: { feed: 'true', device: deviceId ?? '' },
                })}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: '12px',
                  border: `1px solid ${colors.border}`, background: 'transparent',
                  color: colors.textSecondary, fontWeight: 700, fontSize: '0.78rem',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ▶ Browse all phones
              </button>
            )}

            <div>
              <h1 style={{ margin: 0, color: colors.text, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3 }}>
                {device.brand} {device.model}
              </h1>
              <div style={{ color: colors.textMuted, fontSize: '0.8rem', marginTop: '0.15rem' }}>
                {[...new Set([device.variant, device.ram, device.storage].filter(Boolean))].join(' · ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                {device.sellPrice != null && (
                  <span style={{ color: colors.accent, fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {device.sellPrice.toLocaleString()} د.ج
                  </span>
                )}
                <span
                  style={{
                    fontSize: '0.62rem', fontWeight: 800,
                    color: device.quantity > 0 ? colors.success : colors.danger,
                    background: device.quantity > 0 ? colors.successBg : colors.dangerBg,
                    padding: '2px 8px', borderRadius: '999px',
                  }}
                >
                  {device.quantity > 0 ? t('showroom.available') : t('showroom.outOfStock')}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: '0.6rem', color: colors.textMuted, fontSize: '0.72rem' }}>
                {device.city && <span>📍 {device.city}</span>}
                <span>📅 {t('phoneDetails.dateAdded')}: {formatDate(device.createdAt, locale)}</span>
                {serverViews > 0 && <span>👁 {serverViews} {t('phoneDetails.views')}</span>}
              </div>
            </div>

            <Divider />

            <ContactOwnerAction device={device} onContact={handleContact} />

            {device.quantity > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: '14px',
                padding: '0.65rem 0.8rem', marginTop: '0.4rem',
              }}>
                <div style={{ fontSize: '0.78rem', color: colors.textSecondary, fontWeight: 700 }}>
                  {t('delivery.quantity')}
                  <span style={{ display: 'block', color: colors.textMuted, fontWeight: 600, fontSize: '0.68rem', marginTop: '0.1rem' }}>
                    {t('delivery.subtotal')}: {(device.sellPrice ?? 0) * orderQty} د.ج
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    aria-label="decrease"
                    disabled={orderQty <= 1}
                    onClick={() => setOrderQty((q) => Math.max(1, q - 1))}
                    style={{ ...headerBtn, padding: '0.4rem 0.7rem' }}
                  >
                    −
                  </button>
                  <span style={{ minWidth: '1.6rem', textAlign: 'center', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
                    {orderQty}
                  </span>
                  <button
                    type="button"
                    aria-label="increase"
                    disabled={orderQty >= device.quantity}
                    onClick={() => setOrderQty((q) => Math.min(device.quantity, q + 1))}
                    style={{ ...headerBtn, padding: '0.4rem 0.7rem' }}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {device.quantity > 0 && (
              <Button variant="primary" size="lg" fullWidth onClick={handleAddToCart} style={{ marginTop: '0.5rem' }}>
                🛒 {t('cart.addToCart')}
              </Button>
            )}

            {device.quantity > 0 && (
              <Button variant="success" size="lg" fullWidth onClick={handleOpenOrder} style={{ marginTop: '0.5rem' }}>
                🛵 {t('delivery.orderButton')} — {t('cart.buyNow')}
              </Button>
            )}
          </Stack>
        </Card>

        {device.description ? (
          <Card variant="glass" padding="lg">
            <h2 style={{ margin: '0 0 0.5rem', color: colors.text, fontSize: '0.95rem', fontWeight: 800 }}>
              {t('phoneDetails.description')}
            </h2>
            <p style={{ margin: 0, color: colors.textSecondary, fontSize: '0.82rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {device.description}
            </p>
          </Card>
        ) : null}

        <Card variant="glass" padding="lg">
          <h2 style={{ margin: '0 0 0.75rem', color: colors.text, fontSize: '0.95rem', fontWeight: 800 }}>
            {t('phoneDetails.specs')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 0.9rem' }}>
            {specs.map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.76rem' }}>
                <span style={{ color: colors.textMuted }}>{row.label}</span>
                <span style={{ color: colors.text, fontWeight: 700, textAlign: 'end' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <AdContactBanner placement={PRODUCT_DETAILS_AD_PLACEMENT} />

        <SimilarPhones devices={similar} onSelect={handleSimilarSelect} />

        <button type="button" onClick={handleBack} style={{ ...headerBtn, width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
          {dir === 'rtl' ? '→' : '←'} {t('phoneDetails.title')}
        </button>
      </Stack>

      {orderOpen && (
        <OrderForm
          open={orderOpen}
          item={toOrderable(device)}
          initialQuantity={orderQty}
          draft={orderDraft ?? undefined}
          onClose={handleOrderClose}
          onDraftChange={handleOrderDraftChange}
          onRequestSignIn={handleRequestSignIn}
        />
      )}

      {favorites.showToast && (
        <div style={{ position: 'fixed', insetInline: '1rem', bottom: '1.25rem', zIndex: 999 }}>
          <Toast type="info" message={`♥ ${t('phoneDetails.favoriteSoon')}`} onDismiss={favorites.dismissToast} />
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', insetInline: '1rem', bottom: '1.25rem', zIndex: 999 }}>
          <Toast type="success" message={toast.message} onDismiss={() => setToast(null)} />
        </div>
      )}
    </Screen>
  );
});

export default ProductDetailsScreen;

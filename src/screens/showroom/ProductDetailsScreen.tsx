import { memo, useCallback, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { Toast } from '../../design-system/components/Toast';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import { ProductImageGallery } from '../../components/showroom/ProductImageGallery';
import { ProductActionBar } from '../../components/showroom/ProductActionBar';
import { ProductNotFound } from '../../components/showroom/ProductNotFound';
import { SimilarPhones } from '../../components/showroom/SimilarPhones';
import { useProductDetails } from '../../hooks/useProductDetails';
import { useSimilarPhones } from '../../hooks/useSimilarPhones';
import { useViewCounter } from '../../hooks/useViewCounter';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { useFavorites } from '../../hooks/useFavorites';
import { sendPhoneActionWhatsApp, type PhoneActionId } from '../../services/whatsapp-service';
import { recordIntent } from '../../services/intent-tracking';
import { buildAppUrl } from '../../core/base-path';
import type { InventoryRecord } from '../../services/inventory-service';

const ACTION_IDS: readonly PhoneActionId[] = ['buy', 'exchange', 'installment', 'inquiry'];

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
 * Phone Details — the Phase 3B full sales page (§3.2) + not-available branch
 * (§3.3). Lazy-loaded, id via routeParams, record re-read from InventoryService.
 * Header: back · share · favorite(لاحقاً). Exactly 4 WhatsApp actions (no بيع).
 * Similar-phones carousel pushes NAVIGATE phone-details (stack preserved).
 */
export const ProductDetailsScreen = memo(function ProductDetailsScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale, dir } = useTranslation();
  const colors = useThemeColors();

  const deviceId = routeParams.device;
  const { device, notFound } = useProductDetails(deviceId);
  const similar = useSimilarPhones(device);
  const { count: views } = useViewCounter(deviceId);
  const whatsapp = useWhatsApp();
  const favorites = useFavorites();

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

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

  const handleAction = useCallback(
    (action: PhoneActionId) => {
      if (!device) return;
      try {
        recordIntent({ kind: 'whatsapp_intent', ctaType: action, placement: 'phone-details', deviceId: device.id });
      } catch {
        // fire-and-forget — WhatsApp continues regardless
      }
      const message = sendPhoneActionWhatsApp(action, device);
      whatsapp.send(message, { action, deviceId: device.id });
    },
    [device, whatsapp],
  );

  const handleSimilarSelect = useCallback(
    (next: InventoryRecord) => {
      dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: next.id } });
    },
    [dispatch],
  );

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
    { label: t('phoneDetails.ram'), value: device.ram },
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
          </div>
        </div>

        <Card variant="glass" padding="lg">
          <Stack gap="md">
            <ProductImageGallery images={device.images ?? []} name={`${device.brand} ${device.model}`} />

            <div>
              <h1 style={{ margin: 0, color: colors.text, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3 }}>
                {device.brand} {device.model}
              </h1>
              <div style={{ color: colors.textMuted, fontSize: '0.8rem', marginTop: '0.15rem' }}>
                {device.variant} · {device.ram} · {device.storage}
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
                {views > 0 && <span>👁 {views} {t('phoneDetails.views')}</span>}
              </div>
            </div>

            <Divider />

            <ProductActionBar actions={ACTION_IDS} device={device} onSelect={handleAction} />
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
      </Stack>

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

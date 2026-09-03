import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { ProductImageGallery } from '../../components/showroom/ProductImageGallery';
import { ProductNotFound } from '../../components/showroom/ProductNotFound';
import { ContactListingAction } from '../../components/showroom/ContactListingAction';
import { getPublicListing, listingImageUrl } from '../../services/listing-service';
import { buildListingContactMessage } from '../../services/whatsapp-service';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { track } from '../../core/telemetry';
import { useCart } from '../../core/cart/CartContext';
import type { ListingRecord } from '../../domains/listings';
import {
  ensureAdminListingPresenters,
  getRequiredListingPresenter,
  listingLabel,
  listingDeepLink,
  produceUnitLabel,
} from '../../domains/listings';

const navBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border, rgba(128,128,128,0.2))',
  color: 'var(--text-secondary, rgba(255,255,255,0.7))',
  borderRadius: '10px',
  padding: '0.45rem 0.75rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.78rem',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
};

/**
 * P8.5/B1 — public car/property details (`#/listing-details?id=<uuid>`).
 *
 * Data comes ONLY from `getPublicListing(id)` (v_public_listings) and the
 * category presenter registry — never InventoryService / v_public_inventory.
 *
 * B1 makes the screen ACTIONABLE:
 *   • Contact (cars + properties) — mediator WhatsApp via the presenter's
 *     pre-authored `contact(viewRecord, deepLink)` payload + `useWhatsApp`.
 *   • Request Cart (cars/produce ONLY, sale) — add to cart → cart → WhatsApp
 *     request card. Properties stay contact/lead-only (rent/high-ticket ≠
 *     cart products).
 * Deliberately NOT in this phase: view counter, similar listings, analytics.
 */
export const ListingDetailsScreen = memo(function ListingDetailsScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, dir } = useTranslation();
  const colors = useThemeColors();
  const whatsapp = useWhatsApp();
  const cart = useCart();

  const id = routeParams.id ?? '';
  const [record, setRecord] = useState<ListingRecord | null | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setRecord(null);
      return;
    }
    let alive = true;
    setRecord(undefined);
    setError('');
    getPublicListing(id)
      .then((row) => {
        if (alive) {
          setRecord(row);
          if (row) void track({ event: 'listing_view_detail', entityType: 'listing', entityId: row.id });
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setRecord(null);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const backArrow = dir === 'rtl' ? '→' : '←';

  // Presenters are registered once per session by the admin surface too;
  // calling here keeps the details screen self-sufficient (idempotent).
  ensureAdminListingPresenters();

  const categoryKey =
    record?.category === 'car'
      ? 'showroom.catCars'
      : record?.category === 'property'
        ? 'showroom.catProperties'
        : record?.category === 'produce'
          ? 'showroom.catProduce'
          : null;

  // P8.6/D1: a deep link may point at ANY inventory id. Phones have no
  // presenter yet (P8.7) and must never crash this screen — they degrade to
  // the standard not-found surface exactly like missing/unpublished ids.
  const viewRecord = record && record.category !== 'phone' ? record : null;

  const presenter = viewRecord ? getRequiredListingPresenter(viewRecord.category) : null;

  // Request Cart — cars and produce are cart-able (single-unit cars, whole-unit
  // produce); properties are contact/lead ONLY.
  const orderable = !!viewRecord && (viewRecord.category === 'car' || viewRecord.category === 'produce') && presenter !== null;

  const handleContact = useCallback(() => {
    if (!viewRecord || !presenter) return;
    const info = presenter.contact(viewRecord, listingDeepLink(viewRecord.id));
    whatsapp.send(buildListingContactMessage(info), { action: 'inquiry' });
    void track({
      event: 'listing_contact',
      entityType: 'listing',
      entityId: viewRecord.id,
      properties: { method: 'whatsapp' },
    });
  }, [viewRecord, presenter, whatsapp]);

  // Add-to-cart for orderable domains. Cars: single-unit sale. Produce:
  // whole-unit sale with real stock, so multiple units are allowed and the
  // unit travels on the line. Property monthly rentals never enter the cart —
  // they stay contact/lead-only.
  const handleAddToCart = useCallback(() => {
    if (!viewRecord || !presenter) return;
    if (viewRecord.category !== 'car' && viewRecord.category !== 'produce') return;
    if (viewRecord.price.period === 'monthly') return;
    const card = presenter.card(viewRecord);
    const firstImage = viewRecord.images[0];
    if (viewRecord.category === 'produce') {
      cart.addLine({
        catalogRef: viewRecord.id,
        domain: 'produce',
        category: 'produce',
        brand: card.title,
        model: card.subtitle,
        displayUnitPrice: viewRecord.price.amount,
        stock: viewRecord.quantity,
        unit: viewRecord.unit ?? undefined,
        image: firstImage ? listingImageUrl(firstImage) : undefined,
        pricePeriod: 'sale',
        quantity: 1,
      });
    } else {
      cart.addLine({
        catalogRef: viewRecord.id,
        domain: 'car',
        category: 'car',
        brand: card.title,
        model: card.subtitle,
        displayUnitPrice: viewRecord.price.amount,
        stock: 1,
        image: firstImage ? listingImageUrl(firstImage) : undefined,
        pricePeriod: 'sale',
        quantity: 1,
      });
    }
    dispatch({ type: 'NAVIGATE', screen: 'cart' });
    void track({
      event: 'listing_add_to_cart',
      entityType: 'listing',
      entityId: viewRecord.id,
      properties: { qty: 1 },
    });
  }, [viewRecord, presenter, cart, dispatch]);

  return (
    <Screen ariaLabel="Listing details" bottomPad="6rem">
      <Stack gap="lg">
        <button
          type="button"
          onClick={() => dispatch({ type: 'BACK' })}
          style={{ ...navBtn, borderColor: colors.border, color: colors.textSecondary }}
        >
          {backArrow} {t('showroom.back')}
        </button>

        {record === undefined ? (
          <div role="status" style={{ textAlign: 'center', color: colors.textSecondary, fontSize: '0.85rem', padding: '2rem 0' }}>
            جارٍ التحميل…
          </div>
        ) : viewRecord === null && !error ? (
          <ProductNotFound onBack={() => dispatch({ type: 'BACK' })} />
        ) : error !== '' ? (
          <div
            role="alert"
            style={{
              padding: '1rem',
              borderRadius: '12px',
              background: colors.bgCard,
              border: `1px solid ${colors.border}`,
              color: colors.text,
              fontSize: '0.82rem',
            }}
          >
            ⚠ تعذر تحميل الإعلان: {error}
          </div>
        ) : viewRecord && presenter ? (
          <>
            <ProductImageGallery images={viewRecord.images.map(listingImageUrl)} name={presenter.card(viewRecord).title} entityId={viewRecord.id} />

            <Card variant="glass" padding="lg">
              <Stack gap="sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  {categoryKey && (
                    <span
                      style={{
                        background: colors.glass,
                        border: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: '999px',
                      }}
                    >
                      {t(categoryKey as never)}
                    </span>
                  )}
                  <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{viewRecord.city}</span>
                </div>

                <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem', fontWeight: 800 }}>
                  {presenter.card(viewRecord).title}
                </h1>
                {presenter.card(viewRecord).subtitle !== '' && (
                  <p style={{ margin: 0, color: colors.textSecondary, fontSize: '0.82rem' }}>
                    {presenter.card(viewRecord).subtitle}
                  </p>
                )}

                {viewRecord.price.amount != null && (
                  <div style={{ color: colors.accent, fontWeight: 800, fontSize: '1.2rem' }}>
                    {viewRecord.price.amount.toLocaleString('en-US')} د.ج
                    {viewRecord.unit != null
                      ? ` / ${produceUnitLabel(viewRecord.unit)}`
                      : viewRecord.price.period === 'monthly'
                        ? ' / شهر'
                        : ''}
                  </div>
                )}
                {viewRecord.price.amount == null && (
                  <div style={{ color: colors.textMuted, fontWeight: 700, fontSize: '0.85rem' }}>
                    {listingLabel(
                      viewRecord.price.period === 'monthly'
                        ? 'listings.price.monthly'
                        : 'listings.price.sale',
                    )}
                  </div>
                )}

                {viewRecord.description !== '' && (
                  <p style={{ margin: 0, color: colors.textSecondary, fontSize: '0.8rem', lineHeight: 1.6 }}>
                    {viewRecord.description}
                  </p>
                )}
              </Stack>
            </Card>

            {presenter.specRows(viewRecord).length > 0 && (
              <Card variant="glass" padding="lg">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {presenter.specRows(viewRecord).map((row) => (
                    <div
                      key={`${row.labelKey}:${row.value}`}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}
                    >
                      <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>
                        {listingLabel(row.labelKey)}
                      </span>
                      <span style={{ color: colors.text, fontSize: '0.8rem', fontWeight: 600 }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Stack gap="sm" style={{ marginTop: '0.25rem' }}>
              {orderable && (
                <button
                  type="button"
                  data-action="add-to-cart-listing"
                  aria-label={`🛒 ${t('cart.addToCart')}`}
                  onClick={handleAddToCart}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.85rem 1rem',
                    background: 'var(--accent, #3b82f6)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                  }}
                >
                  <span aria-hidden>🛒</span>
                  <span>{t('cart.addToCart')}</span>
                </button>
              )}
              <ContactListingAction
                label={presenter.card(viewRecord).title}
                onContact={handleContact}
              />
            </Stack>
          </>
        ) : null}
      </Stack>
    </Screen>
  );
});

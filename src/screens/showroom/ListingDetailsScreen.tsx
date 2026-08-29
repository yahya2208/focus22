import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { ProductImageGallery } from '../../components/showroom/ProductImageGallery';
import { ProductNotFound } from '../../components/showroom/ProductNotFound';
import { ContactListingAction } from '../../components/showroom/ContactListingAction';
import { OrderForm, toListingOrderable, type DeliveryCustomerDraft } from '../../components/delivery/OrderForm';
import { getPublicListing, listingImageUrl } from '../../services/listing-service';
import { buildListingContactMessage } from '../../services/whatsapp-service';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { useCart } from '../../core/cart/CartContext';
import type { ListingRecord } from '../../domains/listings';
import {
  ensureAdminListingPresenters,
  getRequiredListingPresenter,
  listingLabel,
  listingDeepLink,
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
 *   • Order (cars ONLY) — reuse OrderForm with a neutral `OrderableProduct`;
 *     server is authoritative over price/stock via migration 00052. Properties
 *     stay contact/lead-only (rent/high-ticket ≠ delivery sale).
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
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<DeliveryCustomerDraft | null>(null);

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
        if (alive) setRecord(row);
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
        : null;

  // P8.6/D1: a deep link may point at ANY inventory id. Phones have no
  // presenter yet (P8.7) and must never crash this screen — they degrade to
  // the standard not-found surface exactly like missing/unpublished ids.
  const viewRecord = record && record.category !== 'phone' ? record : null;

  const presenter = viewRecord ? getRequiredListingPresenter(viewRecord.category) : null;

  // B1 — cars are physically orderable (single-unit sale, server-authoritative
  // price/stock via 00052); properties are contact/lead ONLY.
  const orderable = !!viewRecord && viewRecord.category === 'car' && presenter !== null;

  const handleContact = useCallback(() => {
    if (!viewRecord || !presenter) return;
    const info = presenter.contact(viewRecord, listingDeepLink(viewRecord.id));
    whatsapp.send(buildListingContactMessage(info), { action: 'inquiry' });
  }, [viewRecord, presenter, whatsapp]);

  const handleOpenOrder = useCallback(() => {
    if (!viewRecord || !presenter) return;
    setOrderDraft(null);
    setOrderOpen(true);
  }, [viewRecord, presenter]);

  const handleOrderClose = useCallback(() => {
    setOrderOpen(false);
  }, []);

  const handleOrderDraftChange = useCallback((next: DeliveryCustomerDraft) => {
    setOrderDraft(next);
  }, []);

  // Add-to-cart for cars ONLY (single-unit, sale). Property monthly rentals
  // never enter the cart — they stay contact/lead-only.
  const handleAddToCart = useCallback(() => {
    if (!viewRecord || !presenter || viewRecord.category !== 'car') return;
    if (viewRecord.price.period === 'monthly') return;
    const card = presenter.card(viewRecord);
    const firstImage = viewRecord.images[0];
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
    dispatch({ type: 'NAVIGATE', screen: 'cart' });
  }, [viewRecord, presenter, cart, dispatch]);

  // Go to the existing sign-in flow; the order draft has been lifted into
  // state so re-opening restores the entered data.
  const handleRequestSignIn = useCallback(() => {
    setOrderOpen(false);
    dispatch({ type: 'NAVIGATE', screen: 'login' });
  }, [dispatch]);

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
            <ProductImageGallery images={viewRecord.images.map(listingImageUrl)} name={presenter.card(viewRecord).title} />

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
                    {viewRecord.price.period === 'monthly' ? ' / شهر' : ''}
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
              {orderable && viewRecord.price.period === 'sale' && (
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
              {orderable && (
                <button
                  type="button"
                  data-action="order-listing"
                  aria-label={`🛒 ${t('listingDetails.actions.order')}`}
                  onClick={handleOpenOrder}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.85rem 1rem',
                    background: 'var(--success, #10b981)',
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
                  <span>{t('listingDetails.actions.order')}</span>
                </button>
              )}
              <ContactListingAction
                label={presenter.card(viewRecord).title}
                onContact={handleContact}
              />
            </Stack>
          </>
        ) : null}

        {orderOpen && viewRecord && presenter && (
          <OrderForm
            open={orderOpen}
            item={toListingOrderable(viewRecord)}
            draft={orderDraft ?? undefined}
            onClose={handleOrderClose}
            onDraftChange={handleOrderDraftChange}
            onRequestSignIn={handleRequestSignIn}
          />
        )}
      </Stack>
    </Screen>
  );
});

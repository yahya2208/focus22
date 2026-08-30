import { memo, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Grid, Stack } from '../../design-system/layout';
import { layout } from '../../design-system/tokens';
import { Card } from '../../design-system/components/Card';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import {
  ensureCategoriesLoaded,
  getCategoryBySlug,
  getCategoryLabel,
  getCategoryDescription,
  getCategoryParent,
  getChildren,
  subscribeCategories,
} from '../../services/categories-service';
import {
  ensureDeliveryLoaded,
  getDeliveryZones,
  estimateDelivery,
  type DeliveryEstimate,
} from '../../services/delivery-service';
import { getCategoryThemePreset } from '../../core/categories/themes';
import type { Category } from '../../core/categories/types';
import { InventoryService, type InventoryRecord } from '../../services/inventory-service';
import { useInventoryImages } from '../../hooks/useInventoryImages';
import { resolveDefaultGameEntry } from '../../challenge/active-challenge-resolver';
import {
  getCategoryMembers,
  startCategoryProductsRealtime,
  subscribeCategoryProducts,
  getCategoryProductsInvalidation,
} from '../../services/category-products-service';
import { getPublicListing } from '../../services/listing-service';
import {
  listingDeepLink,
  toPublicCardModel,
  type PublicListingCardModel,
} from '../../domains/listings/publicCard';
import { ensureAdminListingPresenters } from '../../domains/listings';
import { PublicListingCard } from '../../components/showroom/listings/PublicListingCard';

function CategoryProductCard({ device, accent, onOpen }: {
  device: InventoryRecord;
  accent: string;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  const images = useInventoryImages(device.id, device.images ?? []);
  const primary = images[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'right', padding: 0, margin: 0,
        border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'transparent',
      }}
    >
      <div style={{
        borderRadius: '18px', background: colors.glass, border: `1px solid ${colors.glassBorder}`,
        overflow: 'hidden', boxShadow: `0 8px 28px rgba(0,0,0,0.28)`,
        transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <div style={{
          aspectRatio: '4 / 3',
          background: `linear-gradient(150deg, ${colors.bgCard} 0%, ${colors.bg} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {primary ? (
            <img
              src={primary}
              alt={`${device.brand} ${device.model}`}
              loading="lazy"
              decoding="async"
              width={480}
              height={360}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span style={{ fontSize: '2.2rem', opacity: 0.55 }}>📱</span>
          )}
        </div>
        <div style={{ padding: '0.65rem 0.7rem 0.75rem' }}>
          <div style={{ color: accent, fontWeight: 700, fontSize: '0.7rem', marginBottom: '0.1rem' }}>
            {device.brand}
          </div>
          <div style={{ color: colors.text, fontWeight: 600, fontSize: '0.78rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {device.model}
          </div>
          <div style={{ color: colors.textMuted, fontSize: '0.66rem', marginTop: '0.15rem' }}>
            {device.variant}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700,
              color: device.quantity > 3 ? colors.success : colors.warning,
              background: device.quantity > 3 ? colors.successBg : colors.warningBg,
              padding: '1px 6px', borderRadius: '999px',
            }}>
              {device.quantity > 0 ? `متوفر (${device.quantity})` : 'نفد'}
            </span>
            {device.sellPrice != null && (
              <span style={{ color: colors.textSecondary, fontWeight: 700, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
                {device.sellPrice.toLocaleString()} د.ج
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function DeliveryPill({ category }: { category: Category }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);

  useEffect(() => {
    let cancelled = false;
    const zone = getDeliveryZones()[0];
    if (!zone) return;
    estimateDelivery(zone.id, 0).then((value) => {
      if (!cancelled) setEstimate(value);
    });
    return () => { cancelled = true; };
  }, [category.id]);

  if (!estimate?.available) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      fontSize: '0.72rem', fontWeight: 700, color: colors.successText,
      background: colors.successBg, padding: '4px 10px', borderRadius: '999px',
    }}>
      🛵 {t('delivery.estimate').replace('{min}', String(estimate.minutesMin)).replace('{max}', String(estimate.minutesMax))}
    </span>
  );
}

export const CategoryScreen = memo(function CategoryScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const slug = (routeParams.slug ?? '').toLowerCase();

  const [category, setCategory] = useState<Category | undefined>(() =>
    slug ? getCategoryBySlug(slug) : undefined,
  );
  const [membersLoading, setMembersLoading] = useState(false);
  const [phoneDevices, setPhoneDevices] = useState<InventoryRecord[]>([]);
  const [listingCards, setListingCards] = useState<PublicListingCardModel[]>([]);
  const [membersRev, setMembersRev] = useState(() => getCategoryProductsInvalidation());

  useEffect(() => {
    ensureCategoriesLoaded().catch(() => {});
    ensureDeliveryLoaded().catch(() => {});
    startCategoryProductsRealtime();
    return subscribeCategories(() => setCategory(slug ? getCategoryBySlug(slug) : undefined));
  }, [slug]);

  // Live-refresh members when admin changes category_products membership.
  useEffect(() => {
    return subscribeCategoryProducts(() => setMembersRev(getCategoryProductsInvalidation()));
  }, []);

  // Resolve the category's ASSIGNED products into renderable members.
  useEffect(() => {
    if (!category) {
      setPhoneDevices([]);
      setListingCards([]);
      return;
    }
    ensureAdminListingPresenters();
    let cancelled = false;
    setMembersLoading(true);
    getCategoryMembers(category.id)
      .then(async (rows) => {
        if (cancelled) return;

        const stock = InventoryService.getExchangeableDevices();
        setPhoneDevices(
          rows
            .filter((m) => m.domain === 'phone')
            .map((m) => stock.find((d) => d.id === m.productId))
            .filter((d): d is InventoryRecord => !!d),
        );

        const listingMembers = rows.filter((m) => m.domain === 'car' || m.domain === 'property' || m.domain === 'produce');
        const cards: PublicListingCardModel[] = [];
        for (const m of listingMembers) {
          try {
            const record = await getPublicListing(m.productId);
            if (record) cards.push(toPublicCardModel(record));
          } catch {
            /* skip a member whose detail fails to load */
          }
        }
        if (!cancelled) setListingCards(cards);
      })
      .catch(() => {
        if (!cancelled) {
          setPhoneDevices([]);
          setListingCards([]);
        }
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category?.id, membersRev]);

  useEffect(() => {
    setCategory(slug ? getCategoryBySlug(slug) : undefined);
  }, [slug]);

  const parentChain = useMemo(() => {
    const chain: Category[] = [];
    let cursor: Category | undefined = category;
    while (cursor?.parentId) {
      cursor = getCategoryParent(cursor);
      if (cursor && !chain.some((c) => c.id === cursor!.id)) chain.unshift(cursor);
      else break;
    }
    return chain;
  }, [category]);

  const children = useMemo(() => {
    return category ? getChildren(category.id) : [];
  }, [category]);

  const theme = category ? getCategoryThemePreset(category.theme) : null;

  if (!category || !category.isActive) {
    return (
      <Screen ariaLabel={t('category.notFound')} maxWidth={layout.containerMax}>
        <Stack gap="lg" align="center" style={{ paddingTop: '3rem' }}>
          <span style={{ fontSize: '3rem' }}>🗂</span>
          <p style={{ color: colors.text, fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            {t('category.notFound')}
          </p>
          <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
            {t('category.notFoundHint')}
          </p>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>
            {t('category.backToHome')}
          </Button>
        </Stack>
      </Screen>
    );
  }

  const label = getCategoryLabel(category, locale);
  const description = getCategoryDescription(category, locale);
  const accent = theme!.accent;

  const openPhone = (device: InventoryRecord) => {
    dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: device.id } });
  };

  const openListing = (deepLink: string) => {
    const id = deepLink.replace(listingDeepLink(''), '');
    if (id) dispatch({ type: 'NAVIGATE', screen: 'listing-details', params: { id } });
  };

  const openGame = () => {
    const target = resolveDefaultGameEntry();
    target.then((resolved) => {
      if (resolved === 'challenge-page') {
        dispatch({ type: 'NAVIGATE', screen: 'challenge-page' });
      } else {
        dispatch({ type: 'SELECT_GAME', gameMode: 'reaction-light' });
        dispatch({ type: 'NAVIGATE', screen: 'countdown' });
      }
    });
  };

  return (
    <Screen ariaLabel={label} maxWidth={layout.containerMaxFluid} bottomPad="6rem">
      <Stack gap="lg">
        {/* Breadcrumb */}
        <Flex gap="sm" align="center" wrap>
          <button
            type="button"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: colors.textMuted, fontSize: '0.75rem', fontFamily: 'inherit',
            }}
          >
            {t('category.breadcrumbHome')}
          </button>
          {parentChain.map((parent) => (
            <span key={parent.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}>›</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'REPLACE', screen: 'category', params: { slug: parent.slug } })}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: colors.textMuted, fontSize: '0.75rem', fontFamily: 'inherit',
                }}
              >
                {getCategoryLabel(parent, locale)}
              </button>
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}>›</span>
            <span style={{ color: accent, fontSize: '0.75rem', fontWeight: 700 }}>{label}</span>
          </span>
        </Flex>

        {/* Hero cover */}
        <div style={{
          borderRadius: '22px', overflow: 'hidden', position: 'relative',
          background: theme!.gradient, padding: '1.5rem 1.5rem 1.4rem',
          boxShadow: `0 16px 48px rgba(0,0,0,0.35)`,
        }}>
          <Flex align="flex-start" justify="space-between" gap="md" wrap>
            <Flex align="center" gap="sm" wrap>
              <span role="img" aria-hidden="true" style={{ fontSize: '2.2rem', lineHeight: 1 }}>{category.icon}</span>
              <span style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.01em' }}>
                {label}
              </span>
            </Flex>
            {category.deliveryAvailable && <DeliveryPill category={category} />}
          </Flex>
          {description && (
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', margin: '0.75rem 0 0', maxWidth: '520px', lineHeight: 1.55 }}>
              {description}
            </p>
          )}
        </div>

        {/* Subcategories */}
        {children.length > 0 && (
          <div>
            <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, margin: '0 0 0.75rem' }}>
              {t('category.subcategories')}
            </p>
            <Grid minColumnWidth="140px" gap="md">
              {children.map((child) => (
                <Card
                  key={child.id}
                  variant="interactive"
                  padding="lg"
                  onClick={() => dispatch({ type: 'REPLACE', screen: 'category', params: { slug: child.slug } })}
                  style={{ textAlign: 'center', border: '1px solid transparent' }}
                >
                  <span role="img" aria-hidden="true" style={{ fontSize: '1.6rem', display: 'block', marginBottom: '0.4rem' }}>
                    {child.icon}
                  </span>
                  <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 600 }}>
                    {getCategoryLabel(child, locale)}
                  </span>
                </Card>
              ))}
            </Grid>
          </div>
        )}

        {/* Display mode content */}
        {(category.displayMode === 'phones' || category.displayMode === 'storefront') && (
          <div>
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.75rem' }}>
              <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, margin: 0 }}>
                {t('category.products')}
              </p>
              {category.displayMode === 'phones' && (
                <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'showroom' })}>
                  {t('category.browseAll')} →
                </Button>
              )}
            </Flex>
            {membersLoading ? (
              <Card variant="outlined" padding="lg">
                <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>
                  {t('category.empty')}
                </p>
              </Card>
            ) : phoneDevices.length > 0 || listingCards.length > 0 ? (
              <Stack gap="lg">
                {phoneDevices.length > 0 && (
                  <Grid minColumnWidth="150px" gap="md">
                    {phoneDevices.map((device) => (
                      <CategoryProductCard
                        key={device.id}
                        device={device}
                        accent={accent}
                        onOpen={() => openPhone(device)}
                      />
                    ))}
                  </Grid>
                )}
                {listingCards.length > 0 && (
                  <Grid minColumnWidth="170px" gap="md">
                    {listingCards.map((model) => (
                      <PublicListingCard key={model.deepLink} model={model} onSelect={openListing} />
                    ))}
                  </Grid>
                )}
              </Stack>
            ) : (
              <Card variant="outlined" padding="lg">
                <div style={{ textAlign: 'center' }}>
                  <span role="img" aria-hidden="true" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.4rem' }}>
                    {category.displayMode === 'storefront' ? '🛍' : '📦'}
                  </span>
                  <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0 }}>
                    {category.displayMode === 'storefront'
                      ? t('category.storefrontComingSoon')
                      : t('category.empty')}
                  </p>
                </div>
              </Card>
            )}
          </div>
        )}

        {category.displayMode === 'games' && (
          <div>
            <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, margin: '0 0 0.75rem' }}>
              {t('category.games')}
            </p>
            <Grid minColumnWidth="150px" gap="md">
              <Card
                variant="interactive"
                padding="xl"
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'tic-tac-toe-intro' })}
                style={{
                  textAlign: 'center',
                  background: getCategoryThemePreset('playful').gradient,
                  border: 'none',
                }}
              >
                <span role="img" aria-hidden="true" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>⭕</span>
                <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 800 }}>{t('ticTacToe.title')}</span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem', display: 'block', marginTop: '0.3rem' }}>
                  {t('category.playNow')}
                </span>
              </Card>
              <Card
                variant="interactive"
                padding="xl"
                onClick={openGame}
                style={{
                  textAlign: 'center',
                  background: theme!.gradient,
                  border: 'none',
                }}
              >
                <span role="img" aria-hidden="true" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>⚡</span>
                <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 800 }}>{t('home.startTest')}</span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem', display: 'block', marginTop: '0.3rem' }}>
                  {t('category.playNow')}
                </span>
              </Card>
            </Grid>
          </div>
        )}
      </Stack>
    </Screen>
  );
});
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { track } from '../../core/telemetry';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Grid } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { PhoneShowroom } from '../../components/showroom/PhoneShowroom';
import { ReelsFeed, USE_NEW_GALLERY } from '../../components/showroom/phone-gallery';
import { ShowroomControls } from '../../components/showroom/ShowroomControls';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import { ListingCategoryTabs } from '../../components/showroom/listings/ListingCategoryTabs';
import { PublicListingCard } from '../../components/showroom/listings/PublicListingCard';
import { InventoryService } from '../../services/inventory-service';
import type { InventoryRecord } from '../../services/inventory-service';
import { getInventoryReady, subscribeCentralInventory } from '../../services/inventory-central-service';
import { searchListings } from '../../services/listing-service';
import type { ListingRecord } from '../../domains/listings';
import { toPublicCardModel } from '../../domains/listings';
import { ensureAdminListingPresenters } from '../../domains/listings';
import type { ShowroomCategory } from '../../hooks/useShowroomState';
import { useShowroomState, filterAndSortDevices } from '../../hooks/useShowroomState';
import { useScrollPreservation } from '../../hooks/useScrollPreservation';
import { useSearchAnalytics } from '../../hooks/useSearchAnalytics';
import { getRuntimeSetting } from '../../core/config/runtime-settings';

/** P8.5 MVP pagination — fixed first page, no pager UI (approved scope). */
const PUBLIC_LISTINGS_PAGE_LIMIT = 48;

/** F-102 — the Showroom listing surface has its own unique ad placement key. */
export const SHOWROOM_AD_PLACEMENT = 'showroom' as const;

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

export const ShowroomScreen = memo(function ShowroomScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, dir } = useTranslation();
  const colors = useThemeColors();
  const [devices, setDevices] = useState<InventoryRecord[]>([]);
  const [ready, setReady] = useState<boolean>(() => getInventoryReady());
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedDeviceId, setFeedDeviceId] = useState<string | undefined>(undefined);
  // ── P8.5 public listings (car/property) state ────────────────────────────
  const [publicListings, setPublicListings] = useState<ListingRecord[] | null>(null);
  const [publicError, setPublicError] = useState('');
  const { state, update } = useShowroomState();
  useScrollPreservation(devices.length > 0 && !feedOpen);

  // ── Phone search analytics (Phase 1) ──────────────────────────────────────
  const { recordSearch, linkSelection } = useSearchAnalytics('showroom');

  useEffect(() => {
    return subscribeCentralInventory(() => setReady(getInventoryReady()));
  }, []);

  useEffect(() => {
    if (ready) setDevices(InventoryService.getExchangeableDevices());
  }, [ready]);

  const category: ShowroomCategory = state.category ?? 'phone';

  // ── P8.5 car/property fetch: debounced server-side search (search + sort
  // only; advanced filters are P8.8). Errors surface visibly — never hidden.
  useEffect(() => {
    if (category === 'phone') return;
    ensureAdminListingPresenters();
    let alive = true;
    setPublicListings(null);
    setPublicError('');
    const timer = setTimeout(() => {
      searchListings({
        category,
        query: state.query,
        sort: state.sort,
        limit: getRuntimeSetting('marketplace.listing_page_limit', PUBLIC_LISTINGS_PAGE_LIMIT),
        offset: 0,
      })
        .then((page) => {
          if (alive) setPublicListings(page.items);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          setPublicError(e instanceof Error ? e.message : String(e));
          setPublicListings([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [category, state.query, state.sort, state]);

  const handleCategoryChange = useCallback(
    (next: ShowroomCategory) => {
      update({ category: next });
    },
    [update],
  );

  // Auto-open feed if navigated with ?feed=true&device=X
  useEffect(() => {
    if (routeParams.feed === 'true') {
      setFeedDeviceId(routeParams.device);
      setFeedOpen(true);
    }
  }, [routeParams.feed, routeParams.device]);

  const visible = filterAndSortDevices(devices, state);

  // Debounced search recording: record a meaningful search after 400ms of inactivity.
  // Avoids recording every keystroke; deduplicates identical queries server-side.
  // P8.5: analytics stay a PHONE-surface concern — neutral tabs never record.
  useEffect(() => {
    if (category !== 'phone') return;
    recordSearch(state.query, visible.length);
  }, [category, state.query, visible.length, recordSearch]);

  // Telemetry (T3.1): `category_search` — records ONLY `has_result`, never the
  // raw query text. Debounced so keystrokes don't spam; fires only once a real,
  // non-empty search is (reasonably) settled.
  const searchTrackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const q = state.query.trim();
    if (searchTrackRef.current) clearTimeout(searchTrackRef.current);
    if (q === '') return;
    searchTrackRef.current = setTimeout(() => {
      void track({ event: 'category_search', entityType: 'category', entityId: state.category, properties: { has_result: visible.length > 0 } });
    }, 400);
    return () => {
      if (searchTrackRef.current) clearTimeout(searchTrackRef.current);
    };
  }, [state.query, state.category, visible.length]);

  const handleSelect = useCallback((device: InventoryRecord) => {
    // Link selection to originating search event if available
    linkSelection(device.id);
    dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: device.id } });
  }, [dispatch, linkSelection]);

  const handleListingSelect = useCallback(
    (deepLink: string) => {
      const id = deepLink.replace('#/listing-details?id=', '');
      if (id) dispatch({ type: 'NAVIGATE', screen: 'listing-details', params: { id } });
    },
    [dispatch],
  );

  const handleFeedSelect = useCallback((deviceId: string) => {
    // The feed renders the filtered (search-result) set, so a feed pick is a
    // search selection too — link it like grid card picks.
    linkSelection(deviceId);
    setFeedOpen(false);
    dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: deviceId } });
  }, [dispatch, linkSelection]);

  const handleFeedClose = useCallback(() => {
    setFeedOpen(false);
    setFeedDeviceId(undefined);
  }, []);

  const backArrow = dir === 'rtl' ? '→' : '←';

  return (
    <Screen ariaLabel="Used phones showroom" bottomPad="6rem">
      <Stack gap="lg">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <button type="button" onClick={() => dispatch({ type: 'BACK' })} style={{ ...navBtn, borderColor: colors.border, color: colors.textSecondary }}>
            {backArrow} {t('showroom.back')}
          </button>
          <button type="button" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ ...navBtn, borderColor: colors.border, color: colors.textSecondary }}>
            🏠 الرئيسية
          </button>
        </div>

        <Card variant="glass" padding="lg" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.6rem', marginBottom: '0.5rem' }}>🏬</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            {t('showroom.title')}
          </h1>
          <p style={{ fontSize: '0.82rem', margin: '0.3rem 0 0', opacity: 0.7 }}>
            {t('showroom.subtitle')}
          </p>
        </Card>

        <AdContactBanner placement={SHOWROOM_AD_PLACEMENT} />

        {/* P8.5 — category awareness; 'phone' stays the default surface. */}
        <ListingCategoryTabs value={category} onChange={handleCategoryChange} />

        {/* state is a module-level singleton mutated in place; memo(ShowroomControls)
            needs a fresh identity to re-render when its content changes. */}
        <ShowroomControls
          devices={devices}
          state={{ ...state }}
          onChange={update}
          variant={category === 'phone' ? 'phones' : 'neutral'}
        />

        {category === 'phone' ? (
          <>
            {USE_NEW_GALLERY && visible.length > 0 && (
              <button
                type="button"
                onClick={() => { setFeedDeviceId(undefined); setFeedOpen(true); }}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: '14px',
                  border: 'none', background: colors.accent, color: '#000',
                  fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.5rem',
                }}
              >
                ▶ Browse all phones
              </button>
            )}

            <Grid columns={1} gap="md">
              <PhoneShowroom
                devices={visible}
                emptyText={!ready ? 'جارٍ تحميل الهواتف…' : t('showroom.empty')}
                onSelect={handleSelect}
              />
            </Grid>
          </>
        ) : publicError !== '' ? (
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
            ⚠ تعذر تحميل الإعلانات: {publicError}
          </div>
        ) : publicListings === null ? (
          <div role="status" style={{ textAlign: 'center', color: colors.textSecondary, fontSize: '0.85rem', padding: '2rem 0' }}>
            جارٍ التحميل…
          </div>
        ) : publicListings.length === 0 ? (
          <div role="status" style={{ textAlign: 'center', color: colors.textSecondary, fontSize: '0.85rem', padding: '2rem 0' }}>
            {t('showroom.empty')}
          </div>
        ) : (
          <Grid columns={1} gap="md">
            {publicListings.map((listing) => {
              const model = toPublicCardModel(listing);
              return (
                <PublicListingCard key={listing.id} model={model} onSelect={handleListingSelect} />
              );
            })}
          </Grid>
        )}

        <button type="button" onClick={() => dispatch({ type: 'BACK' })} style={{ ...navBtn, borderColor: colors.border, color: colors.textSecondary, width: '100%', justifyContent: 'center' }}>
          {backArrow} {t('showroom.back')}
        </button>
      </Stack>

      {feedOpen && (
        <ReelsFeed
          devices={visible}
          initialDeviceId={feedDeviceId}
          onSelectDevice={handleFeedSelect}
          onClose={handleFeedClose}
        />
      )}
    </Screen>
  );
});

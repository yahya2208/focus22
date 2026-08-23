import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Grid } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { PhoneShowroom } from '../../components/showroom/PhoneShowroom';
import { ReelsFeed, USE_NEW_GALLERY } from '../../components/showroom/phone-gallery';
import { ShowroomControls } from '../../components/showroom/ShowroomControls';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';
import { InventoryService } from '../../services/inventory-service';
import type { InventoryRecord } from '../../services/inventory-service';
import { getInventoryReady, subscribeCentralInventory } from '../../services/inventory-central-service';
import { useShowroomState, filterAndSortDevices } from '../../hooks/useShowroomState';
import { useScrollPreservation } from '../../hooks/useScrollPreservation';
import { useSearchAnalytics } from '../../hooks/useSearchAnalytics';

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
  useEffect(() => {
    recordSearch(state.query, visible.length);
  }, [state.query, visible.length, recordSearch]);

  const handleSelect = useCallback((device: InventoryRecord) => {
    // Link selection to originating search event if available
    linkSelection(device.id);
    dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: device.id } });
  }, [dispatch, linkSelection]);

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

        {/* state is a module-level singleton mutated in place; memo(ShowroomControls)
            needs a fresh identity to re-render when its content changes. */}
        <ShowroomControls devices={devices} state={{ ...state }} onChange={update} />

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

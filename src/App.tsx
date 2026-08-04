import { useEffect, lazy, Suspense } from 'react';
import { AppProvider, useAppState, useAppDispatch } from './store/navigation';
import { ThemeProvider } from './design-system/use-theme';
import { SettingsProvider } from './hooks/useSettings';
import { TranslationProvider, useTranslation } from './hooks/useTranslation';
import { AuthProvider } from './core/auth/AuthProvider';
import { PersistenceProvider } from './core/supabase/PersistenceProvider';
import { useThemeSync } from './hooks/useThemeSync';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import type { ScreenName } from './store/navigation';
import { useThemeColors } from './hooks/useThemeColors';
import { AppShell } from './components/layout/AppShell';
import { parseDeepLinkFromCurrentUrl } from './core/qr/deeplink';
import { hasCampaign } from './core/qr/campaign';
import { getGlobalTelemetry } from './core/telemetry';
import { setupSessionTelemetry } from './core/telemetry';
import { runSilentCalibration } from './core/calibration/silent';
import { updateSettings } from './core/config/settings';
import focusIcon from './assets/brand/focus-icon.svg';

// Small/critical screens — lazy loaded to reduce initial bundle size
const LibraryScreen = lazy(() => import('./screens/library/LibraryScreen').then(m => ({ default: m.LibraryScreen })));
const IntroScreen = lazy(() => import('./screens/intro/IntroScreen').then(m => ({ default: m.IntroScreen })));
const CalibrationScreen = lazy(() => import('./screens/calibration/CalibrationScreen').then(m => ({ default: m.CalibrationScreen })));
const CountdownScreen = lazy(() => import('./screens/countdown/CountdownScreen').then(m => ({ default: m.CountdownScreen })));
const GameIntroScreen = lazy(() => import('./screens/game-intro/GameIntroScreen').then(m => ({ default: m.GameIntroScreen })));
const HistoryScreen = lazy(() => import('./screens/history/HistoryScreen').then(m => ({ default: m.HistoryScreen })));
const SettingsScreen = lazy(() => import('./screens/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const AboutScreen = lazy(() => import('./screens/about/AboutScreen').then(m => ({ default: m.AboutScreen })));
const LandingScreen = lazy(() => import('./screens/landing/LandingScreen').then(m => ({ default: m.LandingScreen })));
const ShareScreen = lazy(() => import('./screens/share/ShareScreen').then(m => ({ default: m.ShareScreen })));
const RegisterScreen = lazy(() => import('./screens/register/RegisterScreen').then(m => ({ default: m.RegisterScreen })));
const ConsentScreen = lazy(() => import('./screens/consent/ConsentScreen').then(m => ({ default: m.ConsentScreen })));
const PreGameMessageScreen = lazy(() => import('./screens/message/PreGameMessageScreen').then(m => ({ default: m.PreGameMessageScreen })));
const LoginScreen = lazy(() => import('./screens/auth/LoginScreen').then(m => ({ default: m.LoginScreen })));
const AdminSetupScreen = lazy(() => import('./screens/auth/AdminSetupScreen').then(m => ({ default: m.AdminSetupScreen })));
const AccessDeniedScreen = lazy(() => import('./screens/auth/AccessDeniedScreen').then(m => ({ default: m.AccessDeniedScreen })));
const AchievementsScreen = lazy(() => import('./screens/achievements/AchievementsScreen').then(m => ({ default: m.AchievementsScreen })));
const StickerStudioScreen = lazy(() => import('./screens/stickers/StickerStudioScreen').then(m => ({ default: m.StickerStudioScreen })));
const StickerScanHandler = lazy(() => import('./screens/stickers/StickerScanHandler').then(m => ({ default: m.StickerScanHandler })));
const RepairHomeScreen = lazy(() => import('./screens/repair/RepairHomeScreen').then(m => ({ default: m.RepairHomeScreen })));
const RepairDiagnosticsScreen = lazy(() => import('./screens/repair/RepairDiagnosticsScreen').then(m => ({ default: m.RepairDiagnosticsScreen })));
const RepairPersonnelScreen = lazy(() => import('./screens/repair/RepairPersonnelScreen').then(m => ({ default: m.RepairPersonnelScreen })));
const DesignSystemPlayground = lazy(() => import('./screens/design-system-playground/DesignSystemPlayground').then(m => ({ default: m.DesignSystemPlayground })));
import { ResearchConsole } from './research-console/ResearchConsole';

// Large screens — lazy loaded to reduce initial bundle size
const HomeScreen = lazy(() => import('./screens/home/HomeScreen').then(m => ({ default: m.HomeScreen })));
const GameScreen = lazy(() => import('./screens/game/GameScreen').then(m => ({ default: m.GameScreen })));
const ResultsScreen = lazy(() => import('./screens/results/ResultsScreen').then(m => ({ default: m.ResultsScreen })));
const CoachScreen = lazy(() => import('./screens/coach/CoachScreen').then(m => ({ default: m.CoachScreen })));
const PhoneServicesScreen = lazy(() => import('./screens/phone-services/PhoneServicesScreen').then(m => ({ default: m.PhoneServicesScreen })));
const RepairRequestScreen = lazy(() => import('./screens/repair/RepairRequestScreen').then(m => ({ default: m.RepairRequestScreen })));
const RepairTrackingScreen = lazy(() => import('./screens/repair/RepairTrackingScreen').then(m => ({ default: m.RepairTrackingScreen })));
const RepairAdminDashboard = lazy(() => import('./screens/repair/RepairAdminDashboard').then(m => ({ default: m.RepairAdminDashboard })));
const RepairCourierScreen = lazy(() => import('./screens/repair/RepairCourierScreen').then(m => ({ default: m.RepairCourierScreen })));
const RepairCustomerHistory = lazy(() => import('./screens/repair/RepairCustomerHistory').then(m => ({ default: m.RepairCustomerHistory })));
const StickerAnalyticsScreen = lazy(() => import('./screens/stickers/StickerAnalyticsScreen').then(m => ({ default: m.StickerAnalyticsScreen })));
const ShowroomScreen = lazy(() => import('./screens/showroom/ShowroomScreen').then(m => ({ default: m.ShowroomScreen })));
const BusinessIntelligenceCenter = lazy(() => import('./business-intelligence/BusinessIntelligenceCenter').then(m => ({ default: m.BusinessIntelligenceCenter })));

const screens: Record<ScreenName, React.ComponentType> = {
  home: HomeScreen,
  library: LibraryScreen,
  intro: IntroScreen,
  calibration: CalibrationScreen,
  countdown: CountdownScreen,
  game: GameScreen,
  'game-intro': GameIntroScreen,
  results: ResultsScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
  about: AboutScreen,
  landing: LandingScreen,
  share: ShareScreen,
  register: RegisterScreen,
  consent: ConsentScreen,
  message: PreGameMessageScreen,
  research: ResearchConsole,
  'business-intelligence': BusinessIntelligenceCenter,
  coach: CoachScreen,
  login: LoginScreen,
  'admin-setup': AdminSetupScreen,
  'access-denied': AccessDeniedScreen,
  'phone-services': PhoneServicesScreen,
  achievements: AchievementsScreen,
  'repair-home': RepairHomeScreen,
  'repair-request': RepairRequestScreen,
  'repair-tracking': RepairTrackingScreen,
  'repair-admin': RepairAdminDashboard,
  'repair-courier': RepairCourierScreen,
  'repair-customer-history': RepairCustomerHistory,
  'repair-diagnostics': RepairDiagnosticsScreen,
  'repair-personnel': RepairPersonnelScreen,
  'sticker-studio': StickerStudioScreen,
  'sticker-analytics': StickerAnalyticsScreen,
  'sticker-scan': StickerScanHandler,
  'showroom': ShowroomScreen,
  'design-system-playground': DesignSystemPlayground,
};

function HtmlSync() {
  const { locale, dir } = useTranslation();
  const colors = useThemeColors();
  useThemeSync();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
  }, [locale, dir, colors.bg]);

  return null;
}

function InitialRoute() {
  const dispatch = useAppDispatch();
  const { currentScreen } = useAppState();

  useEffect(() => {
    if (currentScreen !== 'home') return;

    const path = window.location.pathname;
    const search = window.location.search;
    const fullPath = path + search;

    const shortCodeMatch = fullPath.match(/\/c\/([a-zA-Z0-9]{6})/);
    if (shortCodeMatch) {
      const shortCode = shortCodeMatch[1]!;

      import('./core/supabase/data-service').then(({ getDataService }) => {
        const ds = getDataService();
        ds.getCampaignByShortCode(shortCode).then((campaign) => {
          if (campaign?.id) {
            updateSettings({ language: 'ar' });
            const telemetry = getGlobalTelemetry();
            telemetry.setCampaignId(campaign.id);
            telemetry.track('qr_scanned', { campaign_id: campaign.id });
            telemetry.flush();
            dispatch({ type: 'START_QR_FLOW', campaignId: campaign.id });
            import('./core/qr/campaign').then(({ createCampaignStore }) => {
              createCampaignStore().recordScan(campaign.id!).catch(() => {});
            });
          } else { /* campaign not found */ }
        }).catch(() => {});
      }).catch(() => {});
      return;
    }

    const deepLink = parseDeepLinkFromCurrentUrl();
    const telemetry = getGlobalTelemetry();
    const hasQrParams = hasCampaign(deepLink.campaign) || deepLink.referralCode;

    if (deepLink.isValid && hasQrParams) {
      telemetry.setCampaignId(deepLink.campaign.campaign ?? deepLink.campaign.source ?? null);
      telemetry.track('qr_scanned', {
        source: deepLink.campaign.source,
        campaign: deepLink.campaign.campaign,
        referrer: deepLink.referralCode,
      });

      dispatch({ type: 'START_QR_FLOW' });
      return;
    }

    runSilentCalibration().then((profile) => {
      if (profile) {
        dispatch({ type: 'SET_CALIBRATION', profile });
      }
    });
  }, [currentScreen, dispatch]);

  return null;
}

function ScreenFallback() {
  const colors = useThemeColors();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: colors.text, background: colors.bg, flexDirection: 'column', gap: '1rem' }}>
      <img
        src={focusIcon}
        alt="FOCUS"
        width={72}
        height={72}
        draggable={false}
        style={{ borderRadius: '18px', boxShadow: `0 8px 32px ${colors.accentGlow}`, animation: 'pulse 1.6s ease-in-out infinite' }}
      />
      <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.14em', color: colors.textMuted }}>FOCUS</span>
    </div>
  );
}

function ScreenRouter() {
  const { currentScreen } = useAppState();

  let content: React.ReactNode;

  if (currentScreen === 'research') {
    content = (
      <ProtectedRoute requiredResource="scientific" requiredAction="read">
        <ResearchConsole />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'business-intelligence') {
    content = (
      <ProtectedRoute requiredResource="scientific" requiredAction="read">
        <BusinessIntelligenceCenter />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'repair-admin') {
    content = (
      <ProtectedRoute requiredResource="campaigns" requiredAction="read">
        <RepairAdminDashboard />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'repair-courier') {
    content = (
      <ProtectedRoute requiredResource="campaigns" requiredAction="read">
        <RepairCourierScreen />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'repair-customer-history') {
    content = (
      <ProtectedRoute requiredResource="campaigns" requiredAction="read">
        <RepairCustomerHistory />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'repair-personnel') {
    content = (
      <ProtectedRoute requiredResource="campaigns" requiredAction="read">
        <RepairPersonnelScreen />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'repair-diagnostics') {
    content = (
      <ProtectedRoute requiredResource="campaigns" requiredAction="read">
        <RepairDiagnosticsScreen />
      </ProtectedRoute>
    );
  } else {
    const Screen = screens[currentScreen];
    content = <Screen />;
  }

  return (
    <Suspense fallback={<ScreenFallback />}>
      {content}
    </Suspense>
  );
}

export default function App() {
  useEffect(() => {
    const telemetry = getGlobalTelemetry();
    telemetry.track('app_opened', { source: 'app_mount', timestamp: Date.now() });
    const cleanup = setupSessionTelemetry();
    return cleanup;
  }, []);

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeProvider>
          <TranslationProvider>
            <AuthProvider>
              <AppProvider>
                <PersistenceProvider>
                  <HtmlSync />
                  <InitialRoute />
                  <AppShell><ScreenRouter /></AppShell>
                </PersistenceProvider>
              </AppProvider>
            </AuthProvider>
          </TranslationProvider>
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

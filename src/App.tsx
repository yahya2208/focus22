import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { AppProvider, useAppState, useAppDispatch } from './store/navigation';
import { ThemeProvider } from './design-system/use-theme';
import { SettingsProvider } from './hooks/useSettings';
import { TranslationProvider, useTranslation } from './hooks/useTranslation';
import { AuthProvider, useAuth } from './core/auth/AuthProvider';
import { useThemeSync } from './hooks/useThemeSync';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { isScreenName, type ScreenName } from './store/navigation';
import { useThemeColors } from './hooks/useThemeColors';
import { AppShell } from './components/layout/AppShell';
import { Button } from './components/shared/Button';
import { BackProvider } from './core/navigation/BackProvider';
import { WhatsAppProvider } from './providers/WhatsAppProvider';
import { runSilentCalibration } from './core/calibration/silent';
import { extractCampaignShortCodeFromLocation, lookupCampaign } from './services/campaign-lookup';
import { recordScan } from './services/qr-measurement';
import { setActiveChallengeId } from './challenge/challenge-context';
import { resolveDefaultGameEntry } from './challenge/active-challenge-resolver';
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
const ResearchConsole = lazy(() => import('./research-console/ResearchConsole').then(m => ({ default: m.ResearchConsole })));

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
const ProductDetailsScreen = lazy(() => import('./screens/showroom/ProductDetailsScreen').then(m => ({ default: m.ProductDetailsScreen })));
const BusinessIntelligenceCenter = lazy(() => import('./business-intelligence/BusinessIntelligenceCenter').then(m => ({ default: m.BusinessIntelligenceCenter })));
const CatalogApprovalScreen = lazy(() => import('./screens/admin/CatalogApprovalScreen').then(m => ({ default: m.CatalogApprovalScreen })));
const ChallengeAdminScreen = lazy(() => import('./screens/admin/ChallengeAdminScreen').then(m => ({ default: m.ChallengeAdminScreen })));
const ClaimVerifyScreen = lazy(() => import('./screens/challenge/ClaimVerifyScreen').then(m => ({ default: m.ClaimVerifyScreen })));
const ChallengePageScreen = lazy(() => import('./screens/challenge/ChallengePageScreen').then(m => ({ default: m.ChallengePageScreen })));
const ChallengeWinnerScreen = lazy(() => import('./screens/challenge/ChallengeWinnerScreen').then(m => ({ default: m.ChallengeWinnerScreen })));

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
  'phone-details': ProductDetailsScreen,
  'design-system-playground': DesignSystemPlayground,
  'catalog-approval': CatalogApprovalScreen,
  'challenge-admin': ChallengeAdminScreen,
  'challenge-page': ChallengePageScreen,
  'challenge-winner': ChallengeWinnerScreen,
  'claim-verify': ClaimVerifyScreen,
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

function ChallengeAuthError({
  error,
  onRetry,
  onLogin,
  onBack,
}: {
  error: string;
  onRetry: () => void;
  onLogin: () => void;
  onBack: () => void;
}) {
  const colors = useThemeColors();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', flexDirection: 'column', gap: '1rem',
      padding: '2rem', maxWidth: '400px', margin: '0 auto',
      color: colors.text, background: colors.bg,
    }}>
      <p style={{ color: colors.danger, fontWeight: 600, textAlign: 'center', margin: 0 }}>
        {error}
      </p>
      <p style={{ color: colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
        Could not start the Challenge. Please try again or sign in.
      </p>
      <Button onClick={onRetry}>Retry</Button>
      <Button variant="secondary" onClick={onLogin}>Sign In</Button>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: 'none', border: 'none', color: colors.textMuted,
          fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center',
        }}
      >
        Back to Home
      </button>
    </div>
  );
}

export function InitialRoute() {
  const dispatch = useAppDispatch();
  const { currentScreen } = useAppState();
  const { state: authState, service } = useAuth();
  const initialRoutingHandledRef = useRef(false);
  const detectedChallengeIdRef = useRef<string | null>(null);
  const [challengeAuthPending, setChallengeAuthPending] = useState(false);
  const [challengeAuthError, setChallengeAuthError] = useState<string | null>(null);

  // ── Challenge auth gate ──────────────────────────────────────────────────
  // When a challenge_id is detected, wait for auth to resolve.
  // If unauthenticated, attempt Challenge-scoped guest sign-in.
  // Only navigates to challenge-page once auth is anonymous or authenticated.
  useEffect(() => {
    if (!initialRoutingHandledRef.current) return;
    const challengeId = detectedChallengeIdRef.current;
    if (!challengeId) return;

    if (authState.status === 'loading') return;

    if (authState.status === 'authenticated' || authState.status === 'anonymous') {
      setChallengeAuthPending(false);
      dispatch({ type: 'REPLACE', screen: 'challenge-page' });
      return;
    }

    let cancelled = false;
    setChallengeAuthPending(true);
    setChallengeAuthError(null);
    service.signInAsGuest()
      .then(() => {
        if (!cancelled) {
          setChallengeAuthPending(false);
          dispatch({ type: 'REPLACE', screen: 'challenge-page' });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setChallengeAuthPending(false);
          setChallengeAuthError(
            err instanceof Error ? err.message : 'Failed to initialize guest access',
          );
        }
      });

    return () => { cancelled = true; };
  }, [authState.status, service, dispatch]);

  useEffect(() => {
    if (currentScreen !== 'home') return;

    // Initial-route handling runs ONCE per app load: hash-based deep links
    // (e.g. #/repair-tracking) and silent calibration. QR/campaign attribution
    // was removed in P3 (Stop-Write) — campaign params in the URL are no longer
    // read, so no lookupScanContext / analytics_events / START_QR_FLOW.
    if (initialRoutingHandledRef.current) return;
    initialRoutingHandledRef.current = true;

    const shortCode = extractCampaignShortCodeFromLocation(
      window.location.pathname,
      window.location.search,
    );
    if (shortCode) {
      lookupCampaign(shortCode)
        .then((entry) => {
          if (entry) {
            recordScan(shortCode);
            dispatch({ type: 'REPLACE', screen: 'game-intro' });
          }
        })
        .catch(() => {});
      return;
    }

    // Challenge entry: detect challenge_id from query string or hash params
    const queryChallengeId = new URLSearchParams(window.location.search).get('challenge_id');
    if (queryChallengeId) {
      setActiveChallengeId(queryChallengeId);
      detectedChallengeIdRef.current = queryChallengeId;
      setChallengeAuthPending(true);
      return;
    }

    const hash = window.location.hash;
    if (hash.startsWith('#/')) {
      const rest = hash.slice(2);
      const queryIndex = rest.indexOf('?');
      const screenPart = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
      const queryPart = queryIndex === -1 ? '' : rest.slice(queryIndex + 1);
      const params: Record<string, string> = {};
      if (queryPart) {
        new URLSearchParams(queryPart).forEach((value, key) => {
          params[key] = value;
        });
      }

      // Challenge entry via hash deep link: /#/game?challenge_id=XXX
      if (params.challenge_id) {
        // challenge-winner can resolve its own auth — dispatch directly with params
        if (screenPart === 'challenge-winner') {
          setActiveChallengeId(params.challenge_id);
          dispatch({
            type: 'REPLACE',
            screen: 'challenge-winner',
            params,
          });
          return;
        }
        setActiveChallengeId(params.challenge_id);
        detectedChallengeIdRef.current = params.challenge_id;
        setChallengeAuthPending(true);
        return;
      }

      const target = screenPart === 'repair/track' ? 'repair-tracking' : screenPart;
      if (isScreenName(target) && target !== 'home') {
        // Gate game entry screens through the active challenge resolver.
        // If a playable challenge exists, redirect to challenge-page.
        // Explicit challenge deep links (?challenge_id) are handled above and
        // take priority — they never reach this branch.
        const GAME_ENTRY_SCREENS: ReadonlySet<string> = new Set(['game', 'game-intro', 'countdown']);
        if (GAME_ENTRY_SCREENS.has(target)) {
          resolveDefaultGameEntry().then((resolved) => {
            dispatch({
              type: 'REPLACE',
              screen: resolved,
              params: Object.keys(params).length > 0 ? params : undefined,
            });
          });
          return;
        }

        dispatch({
          type: 'REPLACE',
          screen: target,
          params: Object.keys(params).length > 0 ? params : undefined,
        });
        return;
      }
    }

    runSilentCalibration().then((profile) => {
      if (profile) {
        dispatch({ type: 'SET_CALIBRATION', profile });
      }
    });
  }, [currentScreen, dispatch]);

  if (challengeAuthError) {
    const retryChallengeId = detectedChallengeIdRef.current
      ?? new URLSearchParams(window.location.search).get('challenge_id');
    return (
      <ChallengeAuthError
        error={challengeAuthError}
        onRetry={() => {
          setChallengeAuthError(null);
          detectedChallengeIdRef.current = retryChallengeId;
          setChallengeAuthPending(true);
          authState.status === 'unauthenticated'
            ? service.signInAsGuest()
                .then(() => {
                  dispatch({ type: 'REPLACE', screen: 'challenge-page' });
                })
                .catch((err) => {
                  setChallengeAuthError(
                    err instanceof Error ? err.message : 'Failed to initialize guest access',
                  );
                })
            : dispatch({ type: 'REPLACE', screen: 'challenge-page' });
        }}
        onLogin={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}
        onBack={() => {
          setActiveChallengeId(null);
          detectedChallengeIdRef.current = null;
          dispatch({ type: 'NAVIGATE', screen: 'home' });
        }}
      />
    );
  }

  if (challengeAuthPending) return null;

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
  } else if (currentScreen === 'sticker-studio') {
    content = (
      <ProtectedRoute requiredResource="sticker" requiredAction="write">
        <StickerStudioScreen />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'catalog-approval') {
    content = (
      <ProtectedRoute requiredResource="catalog" requiredAction="write">
        <CatalogApprovalScreen />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'challenge-admin') {
    content = (
      <ProtectedRoute requiredResource="catalog" requiredAction="write">
        <ChallengeAdminScreen />
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
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <ThemeProvider>
          <TranslationProvider>
            <AuthProvider>
              <AppProvider>
                <HtmlSync />
                <InitialRoute />
                <BackProvider>
                  <WhatsAppProvider>
                    <AppShell><ScreenRouter /></AppShell>
                  </WhatsAppProvider>
                </BackProvider>
              </AppProvider>
            </AuthProvider>
          </TranslationProvider>
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

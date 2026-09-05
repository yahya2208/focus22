import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { AppProvider, useAppState, useAppDispatch } from './store/navigation';
import { ThemeProvider } from './design-system/use-theme';
import { SettingsProvider } from './hooks/useSettings';
import { TranslationProvider, useTranslation } from './hooks/useTranslation';
import { AuthProvider, useAuth } from './core/auth/AuthProvider';
import { useThemeSync } from './hooks/useThemeSync';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { isScreenName, useNavigationTelemetry, type ScreenName } from './store/navigation';
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
import { TicTacToeProvider } from './screens/tic-tac-toe/TicTacToeContext';
import { CartProvider } from './core/cart/CartContext';
import { track } from './core/telemetry';
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
const ListingDetailsScreen = lazy(() => import('./screens/showroom/ListingDetailsScreen').then(m => ({ default: m.ListingDetailsScreen })));
const BusinessIntelligenceCenter = lazy(() => import('./business-intelligence/BusinessIntelligenceCenter').then(m => ({ default: m.BusinessIntelligenceCenter })));
const CatalogApprovalScreen = lazy(() => import('./screens/admin/CatalogApprovalScreen').then(m => ({ default: m.CatalogApprovalScreen })));
const ChallengeAdminScreen = lazy(() => import('./screens/admin/ChallengeAdminScreen').then(m => ({ default: m.ChallengeAdminScreen })));
const ClaimVerifyScreen = lazy(() => import('./screens/challenge/ClaimVerifyScreen').then(m => ({ default: m.ClaimVerifyScreen })));
const ChallengePageScreen = lazy(() => import('./screens/challenge/ChallengePageScreen').then(m => ({ default: m.ChallengePageScreen })));
const ChallengeWinnerScreen = lazy(() => import('./screens/challenge/ChallengeWinnerScreen').then(m => ({ default: m.ChallengeWinnerScreen })));
const TicTacToeIntroScreen = lazy(() => import('./screens/tic-tac-toe/TicTacToeIntroScreen').then(m => ({ default: m.TicTacToeIntroScreen })));
const TicTacToeScreen = lazy(() => import('./screens/tic-tac-toe/TicTacToeScreen').then(m => ({ default: m.TicTacToeScreen })));
const TicTacToeResultsScreen = lazy(() => import('./screens/tic-tac-toe/TicTacToeResultsScreen').then(m => ({ default: m.TicTacToeResultsScreen })));
const TttInviteLandingScreen = lazy(() => import('./screens/tic-tac-toe/TttInviteLandingScreen').then(m => ({ default: m.TttInviteLandingScreen })));
const TttMultiplayerScreen = lazy(() => import('./screens/tic-tac-toe/TttMultiplayerScreen').then(m => ({ default: m.TttMultiplayerScreen })));
const CategoryScreen = lazy(() => import('./screens/categories/CategoryScreen').then(m => ({ default: m.CategoryScreen })));
const AdminCategoriesScreen = lazy(() => import('./screens/admin/CategoriesAdminScreen').then(m => ({ default: m.CategoriesAdminScreen })));
const CartScreen = lazy(() => import('./screens/cart/CartScreen').then(m => ({ default: m.CartScreen })));
const RequestScreen = lazy(() => import('./screens/request/RequestScreen').then(m => ({ default: m.RequestScreen })));
const PilotStorefrontScreen = lazy(() => import('./screens/pilot/PilotStorefrontScreen').then(m => ({ default: m.PilotStorefrontScreen })));
const PilotCheckoutScreen = lazy(() => import('./screens/pilot/PilotCheckoutScreen').then(m => ({ default: m.PilotCheckoutScreen })));
const PilotOpsAdminScreen = lazy(() => import('./screens/pilot/PilotOpsAdminScreen').then(m => ({ default: m.PilotOpsAdminScreen })));
const PilotStoreOpsScreen = lazy(() => import('./screens/pilot/PilotStoreOpsScreen').then(m => ({ default: m.PilotStoreOpsScreen })));
const PilotCourierScreen = lazy(() => import('./screens/pilot/PilotCourierScreen').then(m => ({ default: m.PilotCourierScreen })));

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
  'listing-details': ListingDetailsScreen,
  'design-system-playground': DesignSystemPlayground,
  'catalog-approval': CatalogApprovalScreen,
  'challenge-admin': ChallengeAdminScreen,
  'challenge-page': ChallengePageScreen,
  'challenge-winner': ChallengeWinnerScreen,
  'claim-verify': ClaimVerifyScreen,
  'tic-tac-toe-intro': TicTacToeIntroScreen,
  'tic-tac-toe': TicTacToeScreen,
  'tic-tac-toe-results': TicTacToeResultsScreen,
  'ttt-invite-landing': TttInviteLandingScreen,
  'ttt-multiplayer': TttMultiplayerScreen,
  'category': CategoryScreen,
  'admin-categories': AdminCategoriesScreen,
  'cart': CartScreen,
  'request': RequestScreen,
  'pilot-storefront': PilotStorefrontScreen,
  'pilot-checkout': PilotCheckoutScreen,
  'pilot-admin': PilotOpsAdminScreen,
  'pilot-store-ops': PilotStoreOpsScreen,
  'pilot-courier': PilotCourierScreen,
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
  const { currentScreen, navStack } = useAppState();
  const { state: authState, service } = useAuth();
  const initialRoutingHandledRef = useRef(false);
  const detectedChallengeIdRef = useRef<string | null>(null);
  const [challengeAuthPending, setChallengeAuthPending] = useState(false);
  const [challengeAuthError, setChallengeAuthError] = useState<string | null>(null);
  const appOpenedRef = useRef(false);
  const appReadyRef = useRef(false);
  const deepLinkReportedRef = useRef(false);

  // Telemetry (Phase 8A): `screen_view` + `navigation_back` — central and
  // committed, wired at the app orchestration boundary (InitialRoute) where
  // real navigation commits. Fires only after a screen change commits, never
  // during render.
  useNavigationTelemetry(currentScreen, navStack);

  // Telemetry: fire `app_open` once per app load (fire-and-forget, non-blocking).
  useEffect(() => {
    if (appOpenedRef.current) return;
    if (currentScreen !== 'home' && currentScreen !== 'landing' && currentScreen !== 'message') return;
    appOpenedRef.current = true;
    void track({ event: 'app_open' });
  }, [currentScreen]);

  // Telemetry (Phase 8B): `app_ready` — reported once per session, only after
  // the app has booted onto a real screen. Distinct from `app_open` (open = the
  // launch; ready = the app is usable).
  useEffect(() => {
    if (appReadyRef.current) return;
    if (currentScreen !== 'home' && currentScreen !== 'landing' && currentScreen !== 'message') return;
    appReadyRef.current = true;
    void track({ event: 'app_ready' });
  }, [currentScreen]);

  // Telemetry (Phase 8B): `app_background`/`app_foreground` — reported only on
  // real document visibility transitions, never for the initial state.
  useEffect(() => {
    let prev = document.visibilityState;
    const onVisibility = () => {
      const cur = document.visibilityState;
      if (cur === prev) return;
      prev = cur;
      if (cur === 'hidden') void track({ event: 'app_background' });
      else if (cur === 'visible') void track({ event: 'app_foreground' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Telemetry (Phase 8A): `deep_link_open` — reported once when the app is
  // entered via a genuine deep link (a non-home hash route or an explicit
  // challenge code). Never fired for a plain home landing.
  useEffect(() => {
    if (deepLinkReportedRef.current) return;
    const hash = window.location.hash;
    const search = window.location.search;
    const isChallengeQuery = new URLSearchParams(search).get('challenge_id') != null;
    if (hash.startsWith('#/') && hash !== '#/home') {
      deepLinkReportedRef.current = true;
      const rest = hash.slice(2);
      const queryIndex = rest.indexOf('?');
      const screenPart = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
      const params = queryIndex === -1 ? null : new URLSearchParams(rest.slice(queryIndex + 1));
      void track({
        event: 'deep_link_open',
        properties: {
          mode: screenPart === 'challenge-page' || screenPart === 'challenge-winner' ? 'challenge' : 'hash',
          has_code: params ? params.has('challenge_id') : false,
        },
      });
      return;
    }
    if (isChallengeQuery) {
      deepLinkReportedRef.current = true;
      void track({ event: 'deep_link_open', properties: { mode: 'query', has_code: true } });
    }
  }, []);

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
      const hasStoredResult = (() => {
        try {
          const raw = localStorage.getItem('focus_challenge_result');
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          return parsed.challengeId === challengeId;
        } catch { return false; }
      })();
      dispatch({ type: 'REPLACE', screen: hasStoredResult ? 'results' : 'challenge-page', params: { challenge_id: challengeId } });
      return;
    }

    let cancelled = false;
    setChallengeAuthPending(true);
    setChallengeAuthError(null);
    service.signInAsGuest()
      .then(() => {
        if (!cancelled) {
          setChallengeAuthPending(false);
          const hasStoredResult = (() => {
            try {
              const raw = localStorage.getItem('focus_challenge_result');
              if (!raw) return false;
              const parsed = JSON.parse(raw);
              return parsed.challengeId === challengeId;
            } catch { return false; }
          })();
          dispatch({ type: 'REPLACE', screen: hasStoredResult ? 'results' : 'challenge-page', params: { challenge_id: challengeId } });
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

            // Challenge-linked campaign: route deterministically to challenge-page
            // using the explicit challenge_id from the campaign row.
            // No RPC dependency — the link is explicit in the database.
            if (entry.challengeId) {
              setActiveChallengeId(entry.challengeId);
              detectedChallengeIdRef.current = entry.challengeId;
              setChallengeAuthPending(true);
              return;
            }

            // Regular campaign (no linked challenge): normal game flow
            dispatch({ type: 'REPLACE', screen: 'game-intro' });
          }
        })
        .catch(() => {});
      return;
    }

    // Challenge entry: detect challenge_id from query string or hash params
    const queryChallengeId = new URLSearchParams(window.location.search).get('challenge_id');
    if (queryChallengeId) {
      console.log('[P1 ROUTE DEBUG] InitialRoute:', {
        hash: window.location.hash,
        search: window.location.search,
        queryChallengeId,
        resolvedChallengeId: queryChallengeId,
      });
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
        console.log('[P1 ROUTE DEBUG] InitialRoute:', {
          hash: window.location.hash,
          search: window.location.search,
          queryChallengeId: null,
          resolvedChallengeId: params.challenge_id,
        });
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

      // Category deep-links (00050): any slug path — e.g. #/phones,
      // #/fresh-market, #/fresh-market/vegetables — resolves to the DB-driven
      // category screen. Slugs are [a-z0-9]+(-[a-z0-9]+)* path segments; the
      // LAST segment is the category slug (the parent path is the deep link).
      const CATEGORY_SLUG_PATH = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;
      if (target !== 'home' && CATEGORY_SLUG_PATH.test(screenPart)) {
        const slug = screenPart.split('/').pop() ?? screenPart;
        dispatch({
          type: 'REPLACE',
          screen: 'category',
          params: { ...params, slug },
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
          if (authState.status === 'unauthenticated') {
            service.signInAsGuest()
              .then(() => {
                dispatch({ type: 'REPLACE', screen: 'challenge-page', params: { challenge_id: retryChallengeId! } });
              })
              .catch((err) => {
                setChallengeAuthError(
                  err instanceof Error ? err.message : 'Failed to initialize guest access',
                );
              });
          } else {
            dispatch({ type: 'REPLACE', screen: 'challenge-page', params: { challenge_id: retryChallengeId! } });
          }
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
  } else if (currentScreen === 'admin-categories') {
    content = (
      <ProtectedRoute requiredResource="catalog" requiredAction="write">
        <AdminCategoriesScreen />
      </ProtectedRoute>
    );
  } else if (currentScreen === 'pilot-admin') {
    content = (
      <ProtectedRoute requiredResource="catalog" requiredAction="write">
        <PilotOpsAdminScreen />
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
  } else if (currentScreen === 'tic-tac-toe-intro' || currentScreen === 'tic-tac-toe' || currentScreen === 'tic-tac-toe-results') {
    const Screen = screens[currentScreen];
    content = <TicTacToeProvider><Screen /></TicTacToeProvider>;
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
                <CartProvider>
                  <HtmlSync />
                  <InitialRoute />
                  <BackProvider>
                    <WhatsAppProvider>
                      <AppShell><ScreenRouter /></AppShell>
                    </WhatsAppProvider>
                  </BackProvider>
                </CartProvider>
              </AppProvider>
            </AuthProvider>
          </TranslationProvider>
        </ThemeProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { CalibrationProfile } from '../core/calibration';
import type { ScoringResult } from '../core/engine/scoring';
import { getGlobalTelemetry } from '../core/telemetry';

export type ScreenName =
  | 'home'
  | 'library'
  | 'intro'
  | 'calibration'
  | 'countdown'
  | 'game'
  | 'game-intro'
  | 'results'
  | 'history'
  | 'settings'
  | 'about'
  | 'landing'
  | 'share'
  | 'register'
  | 'consent'
  | 'message'
  | 'research'
  | 'business-intelligence'
  | 'coach'
  | 'login'
  | 'admin-setup'
  | 'access-denied'
  | 'phone-services'
  | 'achievements'
  | 'repair-home'
  | 'repair-request'
  | 'repair-tracking'
  | 'repair-admin'
  | 'repair-courier'
  | 'repair-customer-history'
  | 'repair-diagnostics'
  | 'repair-personnel'
  | 'sticker-studio'
  | 'sticker-analytics'
  | 'sticker-scan'
  | 'showroom'
  | 'design-system-playground';

export interface SessionRecord {
  readonly id: string;
  readonly gameMode: string;
  readonly timestamp: number;
  readonly rawRts: readonly number[];
  readonly correctedRts: readonly number[];
  readonly totalRounds: number;
  readonly validRounds: number;
  readonly score: ScoringResult | null;
}

export interface AppState {
  screen: ScreenName;
  currentScreen: ScreenName;
  selectedGame: string | null;
  calibrationProfile: CalibrationProfile | null;
  currentSession: {
    id: string;
    gameMode: string;
  } | null;
  results: {
    rawRts: readonly number[];
    correctedRts: readonly number[];
    calibration: CalibrationProfile;
    totalRounds: number;
    validRounds: number;
    sessionStart?: number;
    sessionEnd?: number;
  } | null;
  sessions: SessionRecord[];
  isQrFlow: boolean;
  campaignId: string | null;
  placementId: string | null;
  navStack: ScreenName[];
  intendedScreen: ScreenName | null;
  sessionRestoredAt?: number;
}

export type NavigationAction =
  | { type: 'NAVIGATE'; screen: ScreenName }
  | { type: 'REPLACE'; screen: ScreenName }
  | { type: 'BACK' }
  | { type: 'SET_INTENDED_SCREEN'; screen: ScreenName | null }
  | { type: 'SELECT_GAME'; gameMode: string }
  | { type: 'SET_CALIBRATION'; profile: CalibrationProfile }
  | { type: 'SET_RESULTS'; results: AppState['results'] }
  | { type: 'SAVE_SESSION' }
  | { type: 'RESET' }
  | { type: 'START_QR_FLOW'; campaignId?: string | null; placementId?: string | null; qrId?: string | null }
  | { type: 'START_SESSION'; sessionId: string; gameMode: string }
  | { type: 'SESSION_SAVED'; sessionId: string };

const MAX_STACK_DEPTH = 50;

export const initialState: AppState = {
  screen: 'home',
  currentScreen: 'home',
  selectedGame: null,
  calibrationProfile: null,
  currentSession: null,
  results: null,
  sessions: [],
  isQrFlow: false,
  campaignId: null,
  placementId: null,
  navStack: ['home'],
  intendedScreen: null,
};

const SCREEN_NAMES: ReadonlySet<string> = new Set<ScreenName>([
  'home',
  'library',
  'intro',
  'calibration',
  'countdown',
  'game',
  'game-intro',
  'results',
  'history',
  'settings',
  'about',
  'landing',
  'share',
  'register',
  'consent',
  'message',
  'research',
  'business-intelligence',
  'coach',
  'login',
  'admin-setup',
  'access-denied',
  'phone-services',
  'achievements',
  'repair-home',
  'repair-request',
  'repair-tracking',
  'repair-admin',
  'repair-courier',
  'repair-customer-history',
  'repair-diagnostics',
  'repair-personnel',
  'sticker-studio',
  'sticker-analytics',
  'sticker-scan',
  'showroom',
  'design-system-playground',
]);

export function isScreenName(value: string): value is ScreenName {
  return SCREEN_NAMES.has(value);
}

export function navigationReducer(state: AppState, action: NavigationAction): AppState {
  switch (action.type) {
    case 'NAVIGATE': {
      const top = state.navStack[state.navStack.length - 1];
      const navStack =
        top === action.screen ? state.navStack : [...state.navStack, action.screen].slice(-MAX_STACK_DEPTH);
      return { ...state, screen: action.screen, currentScreen: action.screen, navStack };
    }
    case 'REPLACE': {
      const navStack =
        state.navStack.length > 0 ? [...state.navStack.slice(0, -1), action.screen] : [action.screen];
      return { ...state, screen: action.screen, currentScreen: action.screen, navStack };
    }
    case 'BACK': {
      if (state.navStack.length <= 1) {
        return { ...state, screen: 'home', currentScreen: 'home' };
      }
      const navStack = state.navStack.slice(0, -1);
      const target = navStack[navStack.length - 1]!;
      return { ...state, screen: target, currentScreen: target, navStack };
    }
    case 'SET_INTENDED_SCREEN':
      return { ...state, intendedScreen: action.screen };
    case 'SELECT_GAME':
      return { ...state, selectedGame: action.gameMode };
    case 'SET_CALIBRATION':
      return { ...state, calibrationProfile: action.profile };
    case 'SET_RESULTS':
      return { ...state, results: action.results };
    case 'START_SESSION':
      return {
        ...state,
        currentSession: { id: action.sessionId, gameMode: action.gameMode },
      };
    case 'SAVE_SESSION': {
      if (!state.results || !state.currentSession) return state;
      const session: SessionRecord = {
        id: state.currentSession.id,
        gameMode: state.currentSession.gameMode,
        timestamp: Date.now(),
        rawRts: state.results.rawRts,
        correctedRts: state.results.correctedRts,
        totalRounds: state.results.totalRounds,
        validRounds: state.results.validRounds,
        score: null,
      };
      return { ...state, sessions: [...state.sessions, session] };
    }
    case 'SESSION_SAVED':
      return { ...state, currentSession: null };
    case 'RESET':
      return { ...initialState };
    case 'START_QR_FLOW':
      return {
        ...initialState,
        screen: 'game-intro',
        currentScreen: 'game-intro',
        isQrFlow: true,
        campaignId: action.campaignId ?? null,
        placementId: action.placementId ?? null,
        navStack: ['home', 'game-intro'],
      };
    default:
      return state;
  }
}

interface NavigationContextValue {
  state: AppState;
  dispatch: React.Dispatch<NavigationAction>;
  navigate: NavigateApi;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export interface NavigateApi {
  push(screen: ScreenName): void;
  replace(screen: ScreenName): void;
  back(): void;
  reset(): void;
  setIntendedScreen(screen: ScreenName | null): void;
}

function emitNavigationAnalytics(prev: AppState, action: NavigationAction): void {
  const telemetry = getGlobalTelemetry();
  switch (action.type) {
    case 'NAVIGATE': {
      if (prev.screen === action.screen) return;
      telemetry.track('navigation_push', { from: prev.screen, to: action.screen });
      telemetry.track('screen_view', { screen: action.screen });
      return;
    }
    case 'REPLACE': {
      if (prev.screen === action.screen) return;
      telemetry.track('navigation_replace', { from: prev.screen, to: action.screen });
      telemetry.track('screen_view', { screen: action.screen });
      return;
    }
    case 'BACK': {
      if (prev.navStack.length <= 1) return;
      const target = prev.navStack[prev.navStack.length - 2];
      if (target === prev.screen) return;
      telemetry.track('navigation_pop', { from: prev.screen, to: target });
      telemetry.track('screen_view', { screen: target });
      return;
    }
    case 'RESET': {
      if (prev.screen === 'home') return;
      telemetry.track('screen_view', { screen: 'home' });
      return;
    }
    case 'START_QR_FLOW': {
      telemetry.track('screen_view', { screen: 'game-intro', via: 'qr' });
      return;
    }
    default:
      return;
  }
}

export function syncUrlWithState(
  state: AppState,
  actionType: NavigationAction['type'] | null = null,
): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  const target = `#/${state.screen}`;
  if (window.location.hash === target) return;
  if (actionType === 'REPLACE') {
    window.history.replaceState({ screen: state.screen }, '', target);
  } else {
    window.history.pushState({ screen: state.screen }, '', target);
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(navigationReducer, initialState);

  const stateRef = useRef(state);
  stateRef.current = state;

  const lastActionTypeRef = useRef<NavigationAction['type'] | null>(null);
  const firstRenderRef = useRef(true);

  const dispatch = useCallback(
    (action: NavigationAction): void => {
      lastActionTypeRef.current = action.type;
      emitNavigationAnalytics(stateRef.current, action);
      rawDispatch(action);
    },
    [rawDispatch],
  );

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    syncUrlWithState(state, lastActionTypeRef.current);
  }, [state]);

  useEffect(() => {
    getGlobalTelemetry().track('screen_view', {
      screen: stateRef.current.screen,
      via: 'initial',
    });
  }, []);

  const navigate = useMemo<NavigateApi>(
    () => ({
      push: (screen) => dispatch({ type: 'NAVIGATE', screen }),
      replace: (screen) => dispatch({ type: 'REPLACE', screen }),
      back: () => dispatch({ type: 'BACK' }),
      reset: () => dispatch({ type: 'RESET' }),
      setIntendedScreen: (screen) => dispatch({ type: 'SET_INTENDED_SCREEN', screen }),
    }),
    [dispatch],
  );

  return (
    <NavigationContext.Provider value={{ state, dispatch, navigate }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppDispatch(): React.Dispatch<NavigationAction> {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx.dispatch;
}

export function useAppState(): AppState {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx.state;
}

export function useNavigate(): NavigateApi {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigate must be used within AppProvider');
  return ctx.navigate;
}

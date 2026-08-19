import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { CalibrationProfile } from '../core/calibration';
import type { ScoringResult } from '../core/engine/scoring';
import { registerAppReset } from '../core/navigation/error-reset';

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
  | 'phone-details'
  | 'design-system-playground'
  | 'catalog-approval'
  | 'challenge-admin'
  | 'claim-verify';

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
  navStack: ScreenName[];
  intendedScreen: ScreenName | null;
  routeParams: Record<string, string>;
  sessionRestoredAt?: number;
}

export type NavigationAction =
  | { type: 'NAVIGATE'; screen: ScreenName; params?: Record<string, string> }
  | { type: 'REPLACE'; screen: ScreenName; params?: Record<string, string> }
  | { type: 'BACK' }
  | { type: 'SET_INTENDED_SCREEN'; screen: ScreenName | null }
  | { type: 'SELECT_GAME'; gameMode: string }
  | { type: 'SET_CALIBRATION'; profile: CalibrationProfile }
  | { type: 'SET_RESULTS'; results: AppState['results'] }
  | { type: 'SAVE_SESSION' }
  | { type: 'RESET' }
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
  navStack: ['home'],
  intendedScreen: null,
  routeParams: {},
};

export const ALL_SCREEN_NAMES: readonly ScreenName[] = [
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
  'phone-details',
  'design-system-playground',
  'catalog-approval',
  'challenge-admin',
  'claim-verify',
];

const SCREEN_NAMES: ReadonlySet<string> = new Set<ScreenName>(ALL_SCREEN_NAMES);

export function isScreenName(value: string): value is ScreenName {
  return SCREEN_NAMES.has(value);
}

export function navigationReducer(state: AppState, action: NavigationAction): AppState {
  switch (action.type) {
    case 'NAVIGATE': {
      const top = state.navStack[state.navStack.length - 1];
      const navStack =
        top === action.screen ? state.navStack : [...state.navStack, action.screen].slice(-MAX_STACK_DEPTH);
      return { ...state, screen: action.screen, currentScreen: action.screen, navStack, routeParams: action.params ?? {} };
    }
    case 'REPLACE': {
      const navStack =
        state.navStack.length > 0 ? [...state.navStack.slice(0, -1), action.screen] : [action.screen];
      return { ...state, screen: action.screen, currentScreen: action.screen, navStack, routeParams: action.params ?? {} };
    }
    case 'BACK': {
      if (state.navStack.length <= 1) {
        return { ...state, screen: 'home', currentScreen: 'home', navStack: ['home'], routeParams: {} };
      }
      const navStack = state.navStack.slice(0, -1);
      const target = navStack[navStack.length - 1]!;
      return { ...state, screen: target, currentScreen: target, navStack, routeParams: {} };
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
      return {
        ...state,
        screen: 'home',
        currentScreen: 'home',
        navStack: ['home'],
        intendedScreen: null,
        routeParams: {},
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
  push(screen: ScreenName, params?: Record<string, string>): void;
  replace(screen: ScreenName, params?: Record<string, string>): void;
  back(): void;
  reset(): void;
  setIntendedScreen(screen: ScreenName | null): void;
}

function syncUrlWithState(
  state: AppState,
  actionType: NavigationAction['type'] | null = null,
): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  const query = new URLSearchParams(state.routeParams).toString();
  const target = query ? `#/${state.screen}?${query}` : `#/${state.screen}`;
  if (window.location.hash === target) return;
  if (actionType === 'REPLACE') {
    window.history.replaceState({ screen: state.screen }, '', target);
  } else {
    window.history.pushState({ screen: state.screen }, '', target);
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(navigationReducer, initialState);

  const lastActionTypeRef = useRef<NavigationAction['type'] | null>(null);
  const firstRenderRef = useRef(true);

  const dispatch = useCallback(
    (action: NavigationAction): void => {
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
    const unregister = registerAppReset(() => {
      dispatch({ type: 'RESET' });
    });
    return unregister;
  }, [dispatch]);

  const navigate = useMemo<NavigateApi>(
    () => ({
      push: (screen, params) => dispatch({ type: 'NAVIGATE', screen, params }),
      replace: (screen, params) => dispatch({ type: 'REPLACE', screen, params }),
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

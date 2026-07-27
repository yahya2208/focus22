import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { CalibrationProfile } from '../core/calibration';
import type { ScoringResult } from '../core/engine/scoring';

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
  | 'coach'
  | 'login'
  | 'admin-setup'
  | 'access-denied'
  | 'phone-services'
  | 'achievements';

export interface SessionRecord {
  readonly id: string;
  readonly gameMode: string;
  readonly timestamp: number;
  readonly rawRts: readonly number[];
  readonly correctedRts: readonly number[];
  readonly score: ScoringResult | null;
}

export interface AppState {
  screen: ScreenName;
  currentScreen: ScreenName;
  selectedGame: string | null;
  calibrationProfile: CalibrationProfile | null;
  sessionResults: unknown | null;
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
}

type NavigationAction =
  | { type: 'NAVIGATE'; screen: ScreenName }
  | { type: 'SELECT_GAME'; gameMode: string }
  | { type: 'SET_CALIBRATION'; profile: CalibrationProfile }
  | { type: 'SET_RESULTS'; results: AppState['results'] }
  | { type: 'SAVE_SESSION' }
  | { type: 'RESET' }
  | { type: 'START_QR_FLOW'; campaignId?: string | null };

const initialState: AppState = {
  screen: 'home',
  currentScreen: 'home',
  selectedGame: null,
  calibrationProfile: null,
  sessionResults: null,
  results: null,
  sessions: [],
  isQrFlow: false,
  campaignId: null,
};

function navigationReducer(state: AppState, action: NavigationAction): AppState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, screen: action.screen, currentScreen: action.screen };
    case 'SELECT_GAME':
      return { ...state, selectedGame: action.gameMode };
    case 'SET_CALIBRATION':
      return { ...state, calibrationProfile: action.profile };
    case 'SET_RESULTS':
      return { ...state, results: action.results };
    case 'SAVE_SESSION': {
      if (!state.results) return state;
      const session: SessionRecord = {
        id: crypto.randomUUID(),
        gameMode: state.selectedGame ?? 'reaction-light',
        timestamp: Date.now(),
        rawRts: state.results.rawRts,
        correctedRts: state.results.correctedRts,
        score: null,
      };
      return { ...state, sessions: [...state.sessions, session] };
    }
    case 'RESET':
      return initialState;
    case 'START_QR_FLOW':
      return { ...initialState, screen: 'game-intro', currentScreen: 'game-intro', isQrFlow: true, campaignId: action.campaignId ?? null };
    default:
      return state;
  }
}

interface NavigationContextValue {
  state: AppState;
  dispatch: React.Dispatch<NavigationAction>;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(navigationReducer, initialState);
  return (
    <NavigationContext.Provider value={{ state, dispatch }}>
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

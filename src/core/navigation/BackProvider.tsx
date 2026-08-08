import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAppDispatch, useAppState, type ScreenName } from '../../store/navigation';
import { devLog } from '../logging';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';
import {
  BackOverlayRegistry,
  nextOverlayId,
  OVERLAY_PRIORITY,
  type BackOverlayHandle,
  type BackOverlayKind,
} from './back-overlays';
import { createBackController } from './back-dispatcher';

interface BackContextValue {
  back(): void;
  registerOverlay(handle: BackOverlayHandle): () => void;
  registerGuard(guard: { id: string; screen: ScreenName; beforeBack(): boolean }): () => void;
}

const NOOP_CONTEXT: BackContextValue = {
  back() {},
  registerOverlay: () => () => {},
  registerGuard: () => () => {},
};

const BackContext = createContext<BackContextValue>(NOOP_CONTEXT);

const DOUBLE_EXIT_WINDOW_MS = 3000;

export function BackProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const colors = useThemeColors();
  const { t } = useTranslation();

  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const registryRef = useRef<BackOverlayRegistry>(null);
  if (!registryRef.current) registryRef.current = new BackOverlayRegistry();

  const [doubleExitArmed, setDoubleExitArmed] = useState(false);
  const doubleExitArmedRef = useRef(doubleExitArmed);
  doubleExitArmedRef.current = doubleExitArmed;
  const doubleExitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const controller = useMemo(
    () =>
      createBackController({
        getStack: () => stateRef.current.navStack,
        getScreen: () => stateRef.current.screen,
        getOverlays: () => registryRef.current?.getOpenByPriority() ?? [],
        getGuards: (screen) =>
          (registryRef.current?.guardsFor(screen) ?? []).map((g) => () => g.beforeBack()),
        dispatch: (action) => dispatchRef.current(action),
        isDoubleExitArmed: () => doubleExitArmedRef.current,
        armDoubleExit: () => {
          if (doubleExitTimerRef.current) clearTimeout(doubleExitTimerRef.current);
          setDoubleExitArmed(true);
          doubleExitTimerRef.current = setTimeout(() => setDoubleExitArmed(false), DOUBLE_EXIT_WINDOW_MS);
        },
        disarmDoubleExit: () => {
          if (doubleExitTimerRef.current) clearTimeout(doubleExitTimerRef.current);
          doubleExitTimerRef.current = undefined;
          setDoubleExitArmed(false);
        },
        onExit: () => {
          try {
            window.close();
          } catch {
            // best-effort; native exit is Phase 5
          }
        },
      }),
    [],
  );

  const back = useCallback(() => {
    controller.back();
  }, [controller]);

  const registerOverlay = useCallback((handle: BackOverlayHandle) => {
    const registry = registryRef.current;
    if (!registry) return () => {};
    return registry.register(handle);
  }, []);

  const registerGuard = useCallback(
    (guard: { id: string; screen: ScreenName; beforeBack(): boolean }) => {
      const registry = registryRef.current;
      if (!registry) return () => {};
      return registry.registerGuard(guard);
    },
    [],
  );

  useEffect(() => {
    if (doubleExitTimerRef.current) clearTimeout(doubleExitTimerRef.current);
  }, []);

  // Browser back / Android WebView hardware back: single popstate -> back() policy.
  useEffect(() => {
    const onPopState = () => {
      const outcome = controller.back();
      devLog('[back]', outcome.outcome, 'screen=', stateRef.current.screen, 'depth=', stateRef.current.navStack.length);
      // When back() did NOT navigate (overlay closed / double-exit toast / guard
      // blocked), the browser already reverted the URL to a stale entry — re-anchor
      // it to the current screen without growing history. Real BACK navigations are
      // synced by the URL-mirror effect after the reducer commits.
      if (outcome.outcome !== 'back') {
        const target = `#/${stateRef.current.screen}`;
        if (window.location.hash !== target) {
          window.history.pushState({ screen: stateRef.current.screen }, '', target);
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [controller]);

  // Guarantee a history entry beneath the current view so every back press
  // (browser + Android hardware) lands inside the SPA and fires popstate.
  useEffect(() => {
    window.history.pushState({ screen: stateRef.current.screen }, '', `#/${stateRef.current.screen}`);
  }, []);

  const value = useMemo<BackContextValue>(
    () => ({ back, registerOverlay, registerGuard }),
    [back, registerOverlay, registerGuard],
  );

  return (
    <BackContext.Provider value={value}>
      {children}
      {doubleExitArmed && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 400,
            background: colors.bgCard,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '0.6rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            animation: 'fadeIn 160ms',
          }}
        >
          {t('back.pressAgainToExit')}
        </div>
      )}
    </BackContext.Provider>
  );
}

export function useBack(): () => void {
  return useContext(BackContext).back;
}

interface UseBackOverlayOptions {
  kind: BackOverlayKind;
  screen?: ScreenName;
  isOpen(): boolean;
  close(): boolean;
}

export function useBackOverlay({ kind, screen, isOpen, close }: UseBackOverlayOptions): void {
  const { registerOverlay } = useContext(BackContext);
  const optsRef = useRef({ isOpen, close });
  optsRef.current = { isOpen, close };
  const idRef = useRef<string | null>(null);
  if (!idRef.current) idRef.current = nextOverlayId();

  useEffect(() => {
    const unregister = registerOverlay({
      id: idRef.current!,
      kind,
      priority: OVERLAY_PRIORITY[kind],
      screen: screen ?? null,
      isOpen: () => optsRef.current.isOpen(),
      close: () => optsRef.current.close(),
    });
    return unregister;
  }, [kind, screen, registerOverlay]);

  return;
}

interface UseBackGuardOptions {
  screen: ScreenName;
  beforeBack(): boolean;
}

export function useBackGuard({ screen, beforeBack }: UseBackGuardOptions): void {
  const { registerGuard } = useContext(BackContext);
  const guardRef = useRef(beforeBack);
  guardRef.current = beforeBack;
  const idRef = useRef<string | null>(null);
  if (!idRef.current) idRef.current = nextOverlayId();

  useEffect(() => {
    const unregister = registerGuard({
      id: idRef.current!,
      screen,
      beforeBack: () => guardRef.current(),
    });
    return unregister;
  }, [screen, registerGuard]);

  return;
}

import type { NavigationAction, ScreenName } from '../../store/navigation';
import type { BackOverlayHandle } from './back-overlays';

export type BackOutcome =
  | { outcome: 'overlay-closed'; kind: string }
  | { outcome: 'guard-blocked'; reason: string }
  | { outcome: 'back' }
  | { outcome: 'double-exit-first' }
  | { outcome: 'exit' };

export interface BackControllerDeps {
  getStack(): readonly ScreenName[];
  getScreen(): ScreenName;
  getOverlays(): readonly BackOverlayHandle[];
  getGuards(screen: ScreenName): readonly (() => boolean)[];
  dispatch(action: NavigationAction): void;
  track(type: string, payload: Record<string, unknown>): void;
  isDoubleExitArmed(): boolean;
  armDoubleExit(): void;
  disarmDoubleExit(): void;
  onExit(): void;
}

/**
 * Back dispatcher implementing the Phase 2.3 back-priority table
 * (the single source of truth, shared with Phase 5):
 *   1 dialog → 2 bottom sheet → 3 modal → 4 stepper → 5 tab →
 *   6 stack BACK → 7 home double-back exit.
 * Always emits `back_pressed`; emits `back_blocked` when a guard blocks.
 */
export function createBackController(deps: BackControllerDeps) {
  return {
    back(): BackOutcome {
      const screen = deps.getScreen();
      const stack = deps.getStack();

      deps.track('back_pressed', { screen, stack_depth: stack.length });

      const open = [...deps.getOverlays()]
        .filter((o) => o.isOpen())
        .sort((a, b) => a.priority - b.priority)[0];
      if (open) {
        const closed = open.close();
        if (!closed) {
          deps.track('back_blocked', { screen, reason: 'overlay-guard' });
          return { outcome: 'guard-blocked', reason: 'overlay-guard' };
        }
        return { outcome: 'overlay-closed', kind: open.kind };
      }

      for (const guard of deps.getGuards(screen)) {
        if (!guard()) {
          deps.track('back_blocked', { screen, reason: 'beforeBack' });
          return { outcome: 'guard-blocked', reason: 'beforeBack' };
        }
      }

      if (stack.length > 1) {
        deps.dispatch({ type: 'BACK' });
        return { outcome: 'back' };
      }

      if (screen === 'home') {
        if (deps.isDoubleExitArmed()) {
          deps.disarmDoubleExit();
          deps.onExit();
          return { outcome: 'exit' };
        }
        deps.armDoubleExit();
        return { outcome: 'double-exit-first' };
      }

      // Cold-loaded single-entry deep link (e.g. #/showroom): back lands on home.
      deps.dispatch({ type: 'BACK' });
      return { outcome: 'back' };
    },
  };
}

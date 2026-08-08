import { describe, it, expect, vi } from 'vitest';
import { createBackController, type BackControllerDeps } from '../../core/navigation/back-dispatcher';
import type { BackOverlayHandle, BackOverlayKind } from '../../core/navigation/back-overlays';
import type { NavigationAction, ScreenName } from '../../store/navigation';

function overlay(kind: BackOverlayKind, isOpen: () => boolean, close: () => boolean = () => true): BackOverlayHandle {
  return { id: kind, kind, priority: kind === 'dialog' ? 1 : 2, screen: 'home', isOpen, close };
}

interface Harness {
  deps: BackControllerDeps;
  back(): ReturnType<ReturnType<typeof createBackController>['back']>;
  actions: NavigationAction[];
  exitCalled: boolean;
}

function makeHarness(overrides: Partial<BackControllerDeps> = {}): Harness {
  const actions: NavigationAction[] = [];
  const stack: ScreenName[] = ['home'];
  const screen: ScreenName = 'home';
  const open = false;
  let armed = false;
  let exitCalled = false;

  const deps: BackControllerDeps = {
    getStack: () => stack,
    getScreen: () => screen,
    getOverlays: () => (open ? [overlay('dialog', () => true)] : []),
    getGuards: () => [],
    dispatch: (action) => actions.push(action),
    isDoubleExitArmed: () => armed,
    armDoubleExit: () => {
      armed = true;
    },
    disarmDoubleExit: () => {
      armed = false;
    },
    onExit: () => {
      exitCalled = true;
    },
    ...overrides,
  };

  return {
    deps,
    back: createBackController(deps).back,
    actions,
    get exitCalled() {
      return exitCalled;
    },
  };
}

describe('back dispatcher (Phase 2) — priority table', () => {
  it('closes an open dialog overlay before navigating', () => {
    const close = vi.fn(() => true);
    const h = makeHarness({
      getOverlays: () => [overlay('dialog', () => true, close)],
      getStack: () => ['home', 'settings'],
      getScreen: () => 'settings',
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'overlay-closed', kind: 'dialog' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(h.actions).toEqual([]);
  });

  it('treats a refused overlay close as back_blocked', () => {
    const h = makeHarness({
      getOverlays: () => [overlay('dialog', () => true, () => false)],
      getStack: () => ['home', 'settings'],
      getScreen: () => 'settings',
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'guard-blocked', reason: 'overlay-guard' });
  });

  it('lets the highest-priority open overlay win when several are open', () => {
    const dialogClose = vi.fn(() => true);
    const modalClose = vi.fn(() => true);
    const h = makeHarness({
      getOverlays: () => [
        { ...overlay('modal', () => true, modalClose), priority: 3 },
        { ...overlay('dialog', () => true, dialogClose), priority: 1 },
      ],
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'overlay-closed', kind: 'dialog' });
    expect(dialogClose).toHaveBeenCalledTimes(1);
    expect(modalClose).not.toHaveBeenCalled();
  });

  it('runs screen guards and blocks back when beforeBack returns false', () => {
    const guard = vi.fn(() => false);
    const h = makeHarness({
      getScreen: () => 'game',
      getStack: () => ['home', 'game-intro', 'game'],
      getGuards: () => [guard],
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'guard-blocked', reason: 'beforeBack' });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(h.actions).toEqual([]);
  });

  it('allows back when all guards pass', () => {
    const guard = vi.fn(() => true);
    const h = makeHarness({
      getScreen: () => 'game',
      getStack: () => ['home', 'game-intro', 'game'],
      getGuards: () => [guard],
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'back' });
    expect(h.actions).toEqual([{ type: 'BACK' }]);
  });

  it('dispatches BACK when the stack has more than one entry', () => {
    const h = makeHarness({
      getStack: () => ['home', 'settings', 'about'],
      getScreen: () => 'about',
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'back' });
    expect(h.actions).toEqual([{ type: 'BACK' }]);
  });

  it('arms the double-exit toast on the first home back press', () => {
    const h = makeHarness({ getStack: () => ['home'], getScreen: () => 'home' });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'double-exit-first' });
    expect(h.actions).toEqual([]);
  });

  it('exits on the second home back press within the window', () => {
    const h = makeHarness({ getStack: () => ['home'], getScreen: () => 'home' });
    h.back();
    const second = h.back();
    expect(second).toEqual({ outcome: 'exit' });
    expect(h.exitCalled).toBe(true);
  });

  it('cold-loaded single-entry deep link falls back to home', () => {
    const h = makeHarness({
      getStack: () => ['showroom'],
      getScreen: () => 'showroom',
    });
    const outcome = h.back();
    expect(outcome).toEqual({ outcome: 'back' });
    expect(h.actions).toEqual([{ type: 'BACK' }]);
  });
});

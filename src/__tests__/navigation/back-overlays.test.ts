import { describe, it, expect } from 'vitest';
import {
  BackOverlayRegistry,
  OVERLAY_PRIORITY,
  nextOverlayId,
  type BackOverlayHandle,
  type BackOverlayKind,
} from '../../core/navigation/back-overlays';

function overlay(partial: Partial<BackOverlayHandle> & { kind: BackOverlayKind }): BackOverlayHandle {
  return {
    id: nextOverlayId(),
    priority: OVERLAY_PRIORITY[partial.kind],
    screen: 'home',
    isOpen: () => false,
    close: () => true,
    ...partial,
  };
}

describe('BackOverlayRegistry (Phase 2)', () => {
  it('priority table matches the documented back-priority table (1..5)', () => {
    expect(OVERLAY_PRIORITY).toEqual({ dialog: 1, bottomsheet: 2, modal: 3, stepper: 4, tab: 5 });
  });

  it('register/unregister add and remove overlay handles', () => {
    const registry = new BackOverlayRegistry();
    const unregister = registry.register(overlay({ id: 'd1', kind: 'dialog' }));
    expect(registry.getAll().map((o) => o.id)).toEqual(['d1']);
    unregister();
    expect(registry.getAll()).toEqual([]);
  });

  it('getOpenByPriority returns only open overlays sorted by priority ascending', () => {
    const registry = new BackOverlayRegistry();
    const dialog = overlay({ id: 'dialog', kind: 'dialog', isOpen: () => true });
    const modal = overlay({ id: 'modal', kind: 'modal', isOpen: () => true });
    const hiddenTab = overlay({ id: 'tab', kind: 'tab', isOpen: () => false });
    registry.register(dialog);
    registry.register(modal);
    registry.register(hiddenTab);

    const open = registry.getOpenByPriority();
    expect(open.map((o) => o.id)).toEqual(['dialog', 'modal']);
  });

  it('getOpenByPriority is stable when multiple overlays share a priority', () => {
    const registry = new BackOverlayRegistry();
    const a = overlay({ id: 'a', kind: 'dialog', isOpen: () => true });
    const b = overlay({ id: 'b', kind: 'dialog', isOpen: () => true });
    registry.register(a);
    registry.register(b);
    expect(registry.getOpenByPriority().map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('guardsFor returns only guards registered for the given screen', () => {
    const registry = new BackOverlayRegistry();
    registry.registerGuard({ id: 'g1', screen: 'game', beforeBack: () => true });
    registry.registerGuard({ id: 'g2', screen: 'results', beforeBack: () => true });
    registry.registerGuard({ id: 'g3', screen: 'game', beforeBack: () => false });
    expect(registry.guardsFor('game').map((g) => g.id)).toEqual(['g1', 'g3']);
    expect(registry.guardsFor('results').map((g) => g.id)).toEqual(['g2']);
    expect(registry.guardsFor('home')).toEqual([]);
  });

  it('clear empties overlays and guards', () => {
    const registry = new BackOverlayRegistry();
    registry.register(overlay({ id: 'd1', kind: 'dialog' }));
    registry.registerGuard({ id: 'g1', screen: 'game', beforeBack: () => true });
    registry.clear();
    expect(registry.getAll()).toEqual([]);
    expect(registry.guardsFor('game')).toEqual([]);
  });

  it('nextOverlayId produces unique ids', () => {
    const a = nextOverlayId();
    const b = nextOverlayId();
    expect(a).not.toBe(b);
  });
});

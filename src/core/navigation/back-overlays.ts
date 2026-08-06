import type { ScreenName } from '../../store/navigation';

export type BackOverlayKind = 'dialog' | 'bottomsheet' | 'modal' | 'stepper' | 'tab';

/** Priority per Phase 2.3 back-priority table. First match wins; lowest number wins. */
export const OVERLAY_PRIORITY: Record<BackOverlayKind, number> = {
  dialog: 1,
  bottomsheet: 2,
  modal: 3,
  stepper: 4,
  tab: 5,
};

export interface BackOverlayHandle {
  readonly id: string;
  readonly kind: BackOverlayKind;
  readonly priority: number;
  readonly screen: ScreenName | null;
  isOpen(): boolean;
  /** true = closed; false = a beforeBack guard blocked the close. */
  close(): boolean;
}

export interface BackGuardHandle {
  readonly id: string;
  readonly screen: ScreenName;
  /** false = blocked (guard handled it — e.g. opened a confirm dialog or navigated). */
  beforeBack(): boolean;
}

let nextId = 0;
export function nextOverlayId(): string {
  nextId += 1;
  return `overlay-${nextId}`;
}

export class BackOverlayRegistry {
  private overlays = new Map<string, BackOverlayHandle>();
  private guards = new Map<string, BackGuardHandle>();

  register(handle: BackOverlayHandle): () => void {
    this.overlays.set(handle.id, handle);
    return () => {
      this.overlays.delete(handle.id);
    };
  }

  registerGuard(guard: BackGuardHandle): () => void {
    this.guards.set(guard.id, guard);
    return () => {
      this.guards.delete(guard.id);
    };
  }

  getAll(): BackOverlayHandle[] {
    return [...this.overlays.values()];
  }

  /** Open overlays sorted by priority (lowest = highest priority per the table). */
  getOpenByPriority(): BackOverlayHandle[] {
    return this.getAll()
      .filter((o) => o.isOpen())
      .sort((a, b) => a.priority - b.priority);
  }

  guardsFor(screen: ScreenName): BackGuardHandle[] {
    return [...this.guards.values()].filter((g) => g.screen === screen);
  }

  clear(): void {
    this.overlays.clear();
    this.guards.clear();
  }
}

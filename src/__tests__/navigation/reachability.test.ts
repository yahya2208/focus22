import { describe, it, expect } from 'vitest';
import { ALL_SCREEN_NAMES } from '../../store/navigation';
import { EDGES, assertNoOrphans, assertNoDeadEnds, isEdgeComplete } from '../../core/navigation/reachability';
import { BACK_MATRIX } from '../../core/navigation/back-matrix';
import type { ScreenName } from '../../store/navigation';

describe('reachability invariant (Phase 3A)', () => {
  it('every ScreenName has an EDGES entry (table is complete)', () => {
    for (const screen of ALL_SCREEN_NAMES) {
      expect(EDGES[screen], `missing EDGES entry for ${screen}`).toBeDefined();
    }
  });

  it('zero orphans: every screen has at least one inbound edge', () => {
    expect(isEdgeComplete(EDGES)).toBe(true);
    expect(assertNoOrphans(EDGES)).toEqual([]);
  });

  it('zero dead-ends: every screen has a BACK_MATRIX row', () => {
    expect(assertNoDeadEnds()).toEqual([]);
    for (const screen of ALL_SCREEN_NAMES) {
      expect(BACK_MATRIX[screen], `missing BACK_MATRIX row for ${screen}`).toBeDefined();
    }
  });

  it('the 3A wire-ups exist (orphan audit → real inbound edges)', () => {
    expect(EDGES.coach).toContain('results');
    expect(EDGES.achievements).toContain('results');
    expect(EDGES.share).toContain('results');
    expect(EDGES.landing).toContain('deep-link');
    expect(EDGES.consent).toContain('landing');
    expect(EDGES.message).toContain('consent');
    expect(EDGES['repair-tracking']).toContain('deep-link');
    expect(EDGES['sticker-scan']).toContain('deep-link');
    expect(EDGES['design-system-playground']).toContain('settings');
  });

  it('back targets resolve (no dangling backTarget)', () => {
    for (const screen of ALL_SCREEN_NAMES) {
      const row = BACK_MATRIX[screen];
      if (!row) continue;
      const bt = row.backTarget;
      if (bt === 'root' || bt === 'previous') continue;
      expect(ALL_SCREEN_NAMES).toContain(bt as ScreenName);
    }
  });

  it('every inbound edge source is a known screen or an allowed special entry', () => {
    const specials = new Set(['deep-link', 'protected-guard']);
    for (const screen of ALL_SCREEN_NAMES) {
      for (const source of EDGES[screen] ?? []) {
        expect(specials.has(source) || ALL_SCREEN_NAMES.includes(source as ScreenName))
          .toBe(true);
      }
    }
  });
});

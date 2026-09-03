/**
 * T4.5 Phase 10A — telemetry wiring coverage for approved Phase 10A items.
 *
 * Phase 10A wires a bounded set of real, previously-uncovered user actions using
 * ONLY existing taxonomy events (no migrations, no registry/allowlist edits, no
 * Supabase/RPC changes). This spec verifies:
 *
 *   1. ttt_game_create now carries size=9 (single-player TTT is a real 9×9 board).
 *   2. product_favorite — DEFERRED: the favorite surface is a placeholder
 *      ("قريباً" toast only, no persisted toggle), so telemetry is NOT invented.
 *   3. reaction-light `game_intro_view` producer { game: 'reaction-light' }.
 *   4. `ttt_invite_open` wired inside the real invite landing (guarded once).
 *   5. reaction-light `game_abandon` carries `turns` from real completed-round state.
 *   6. `product_image_view` producers extended to arrows/swipe/keyboard with the
 *      resulting `index` (manual navigation only; passive autoplay stays silent).
 *   7. listing-gallery `product_image_view` carries the listing entityId (not null).
 *   8. TTT results `game_result_view` fires exactly once (guarded against
 *      re-render duplicate) with { game: 'ttt' }.
 *
 * Wiring checks use static source analysis (mirroring T4.4 Phase 9) which is the
 * established cheap, robust convention in this suite; the TTT results duplicate
 * guarantee is additionally proven behaviorally.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { TicTacToeResultsScreen } from '../../screens/tic-tac-toe/TicTacToeResultsScreen';

function src(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

describe('T4.5 Phase 10A — item 1: ttt_game_create size 3→9', () => {
  it('multiplayer create reports the real 9×9 board dimension bound to BOARD_SIZE', () => {
    const s = src('../../../src/hooks/use-ttt-multiplayer.ts');
    expect(s).toContain("event: 'ttt_game_create'");
    // `size` is bound to the BOARD_SIZE constant (= 9) — not a literal — so a
    // future 3×3 regression cannot silently recur.
    expect(s).toContain('size: BOARD_SIZE');
    expect(s).toMatch(/import \{ BOARD_SIZE, type Board, type MovePosition \} from '\.\.\/core\/tic-tac-toe\/types'/);
    // The constant itself is 9 (single-player BOARD_SIZE, not the old 3).
    const core = src('../../../src/core/tic-tac-toe/types.ts');
    expect(core).toContain('export const BOARD_SIZE = 9;');
  });
});

describe('T4.5 Phase 10A — item 2: product_favorite is DEFERRED (no invented telemetry)', () => {
  it('the favorite surface is a placeholder, so no product_favorite producer exists', () => {
    const uh = src('../../../src/hooks/useFavorites.ts');
    // Placeholder only: save() surfaces a toast, no persisted favorite state toggle.
    expect(uh).not.toContain("event: 'product_favorite'");
    expect(uh).toMatch(/save/);
    const pds = src('../../../src/screens/showroom/ProductDetailsScreen.tsx');
    expect(pds).not.toContain("event: 'product_favorite'");
  });
});

describe('T4.5 Phase 10A — item 3: reaction-light game_intro_view producer', () => {
  it('reaction-light intro screen emits game_intro_view { game: reaction-light }', () => {
    const s = src('../../../src/screens/game-intro/GameIntroScreen.tsx');
    expect(s).toContain("event: 'game_intro_view'");
    expect(s).toContain("game: 'reaction-light'");
  });
});

describe('T4.5 Phase 10A — item 4: ttt_invite_open on the real invite landing', () => {
  it('invite landing wires ttt_invite_open (guarded once, no render-duplicate)', () => {
    const s = src('../../../src/screens/tic-tac-toe/TttInviteLandingScreen.tsx');
    expect(s).toContain("event: 'ttt_invite_open'");
    // Must be a single guarded emission (loadedRef / once-guard), never re-fired
    // on re-render and never duplicated across load/render paths.
    expect(s.match(/ttt_invite_open/g) ?? []).toHaveLength(1);
    expect(s).toMatch(/loadedRef|hasLoaded|\.current/);
  });
});

describe('T4.5 Phase 10A — item 5: reaction-light game_abandon carries turns', () => {
  it('every game_abandon in the reaction-light screen reports turns from real state', () => {
    const s = src('../../../src/screens/game/GameScreen.tsx');
    const abandonCount = (s.match(/event: 'game_abandon'/g) ?? []).length;
    expect(abandonCount).toBeGreaterThanOrEqual(1);
    // Every emission site includes the real `turns` control (completed rounds).
    expect((s.match(/turns: roundRef\.current/g) ?? []).length).toBe(abandonCount);
  });
});

describe('T4.5 Phase 10A — item 6: product_image_view arrows/swipe/keyboard with index', () => {
  it('gallery manual navigation reports the resulting index (no passive autoplay spam)', () => {
    const s = src('../../../src/components/showroom/ProductImageGallery.tsx');
    // Manual next/prev helpers report the target index through reportView.
    expect(s).toMatch(/manualNext\s*=\s*useCallback/);
    expect(s).toMatch(/manualPrev\s*=\s*useCallback/);
    // The reporting helper carries the correct structured `index`.
    expect(s).toMatch(/event: 'product_image_view'/);
    expect(s).toMatch(/index: idx/);
    // Manual drivers (swipe, keyboard, side-peek, arrows) route to the reporters.
    for (const driver of ['manualNext()', 'manualPrev()']) {
      const found = s.match(new RegExp(driver.replace(/[()]/g, '\\$&'), 'g')) ?? [];
      expect(found.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('T4.5 Phase 10A — item 7: listing-gallery product_image_view entityId', () => {
  it('listing details passes the listing id (not null) into the gallery emission', () => {
    const s = src('../../../src/screens/showroom/ListingDetailsScreen.tsx');
    expect(s).toMatch(/entityId=\{viewRecord\.id\}/);
  });
});

describe('T4.5 Phase 10A — item 8: TTT results game_result_view fires once (behavioral)', () => {
  const h = vi.hoisted(() => ({
    mockTrack: vi.fn(),
    navReplace: vi.fn(),
    state: {} as Record<string, unknown>,
  }));

  vi.mock('../../core/telemetry', () => ({ track: h.mockTrack }));
  vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
  vi.mock('../../hooks/useThemeColors', () => ({ useThemeColors: () => new Proxy({}, { get: () => '#111111' }) }));
  vi.mock('../../store/navigation', () => ({ useNavigate: () => ({ replace: h.navReplace, push: vi.fn() }) }));
  vi.mock('../../core/navigation/BackProvider', () => ({ useBackOverlay: () => undefined, useBackGuard: () => undefined }));
  vi.mock('../../screens/tic-tac-toe/TicTacToeContext', () => ({ useTicTacToeState: () => h.state }));

  beforeEach(() => {
    h.mockTrack.mockClear();
    h.navReplace.mockClear();
    h.state = {
      board: [],
      phase: 'active',
      matchMoves: [],
      matchResult: 'win',
      moveCount: 12,
      difficulty: 'medium',
      winningLine: null,
      sessionOutcome: 'human',
      humanMove: vi.fn(),
      aiMove: vi.fn(),
      reset: vi.fn(),
      setDifficulty: vi.fn(),
    };
  });

  function eventsOf(name: string): Array<Record<string, unknown>> {
    return (h.mockTrack.mock.calls as Array<[Record<string, unknown>]>).map((c) => c[0]).filter((e) => e.event === name);
  }

  it('fires game_result_view exactly once with { game: ttt }', () => {
    const { rerender } = render(<TicTacToeResultsScreen />);
    rerender(<TicTacToeResultsScreen />);
    rerender(<TicTacToeResultsScreen />);

    const evt = eventsOf('game_result_view');
    expect(evt).toHaveLength(1);
    expect(evt[0]).toMatchObject({
      event: 'game_result_view',
      entityType: 'game',
      properties: { game: 'ttt' },
    });
    const FORBIDDEN = ['board', 'moves', 'match', 'state', 'difficulty', 'move', 'email', 'phone', 'name'];
    for (const e of evt) {
      for (const k of Object.keys(e.properties ?? {})) {
        expect(FORBIDDEN.map((f) => f.toLowerCase())).not.toContain(k.toLowerCase());
      }
    }
  });
});

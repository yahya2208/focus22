import { describe, it, expect } from 'vitest';
import { computeTttCellSize, computeTttBoardSide } from '../../screens/tic-tac-toe/TicTacToeScreen';
import { BOARD_SIZE } from '../../core/tic-tac-toe/types';

const ROOT_PADDING_BUDGET = 40;
const RESERVED_VERTICAL_BUDGET = 196;

interface Viewport { readonly label: string; readonly width: number; readonly height: number; }

const VIEWPORTS: readonly Viewport[] = [
  { label: 'mobile-320', width: 320, height: 568 },
  { label: 'mobile-360', width: 360, height: 740 },
  { label: 'mobile-375', width: 375, height: 812 },
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'mobile-414', width: 414, height: 896 },
  { label: 'tablet-portrait', width: 768, height: 1024 },
  { label: 'tablet-landscape', width: 1024, height: 768 },
  { label: 'laptop', width: 1440, height: 900 },
  { label: 'desktop', width: 1920, height: 1080 },
];

describe('TicTacToeScreen — responsive 9x9 board sizing', () => {
  it.each(VIEWPORTS)(
    'keeps all $label ($width x $height) cells visible without horizontal or vertical overflow',
    ({ width, height }) => {
      const cell = computeTttCellSize(width, height);
      const board = computeTttBoardSide(cell);

      // Every cell is square — a single computed scalar sizes both axes.
      expect(board).toBe(cell * BOARD_SIZE + (BOARD_SIZE - 1) * 3 + 2 * 10);

      // Whole 9x9 board must fit the available width (root padding + edges).
      expect(board).toBeLessThanOrEqual(width - ROOT_PADDING_BUDGET);

      // Whole 9x9 board must fit the available height (header/counter/status):
      // no internal vertical scrollbar, bottom never clipped.
      expect(board).toBeLessThanOrEqual(height - RESERVED_VERTICAL_BUDGET);
    },
  );

  it('scales the board down on smaller viewports and caps at the design max on large ones', () => {
    const phone = computeTttCellSize(390, 844);
    const tablet = computeTttCellSize(1024, 768);
    const huge = computeTttCellSize(2000, 2000);

    // Phone-limited board is smaller than tablet-limitted board.
    expect(phone).toBeLessThanOrEqual(tablet);
    // Never exceed the original fixed 54px cell design max.
    expect(huge).toBeLessThanOrEqual(54);
    // Never shrink below a tappable floor.
    expect(phone).toBeGreaterThanOrEqual(20);
    expect(tablet).toBeGreaterThanOrEqual(20);
  });

  it('is limited by the smallest viewport dimension (height drives cell size in landscape)', () => {
    // In landscape (1024x768) the available HEIGHT is the binding constraint.
    const cell = computeTttCellSize(1024, 768);
    const board = computeTttBoardSide(cell);
    // The whole board must fit within the vertical budget without clipping.
    expect(board).toBeLessThanOrEqual(768 - RESERVED_VERTICAL_BUDGET);
    // And it is horizontally centered-fit as well.
    expect(board).toBeLessThanOrEqual(1024 - ROOT_PADDING_BUDGET);
  });

  it('never produces a non-positive cell size for real device widths', () => {
    for (const vp of VIEWPORTS) {
      expect(computeTttCellSize(vp.width, vp.height)).toBeGreaterThan(0);
    }
  });
});

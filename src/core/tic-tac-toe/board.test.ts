import { describe, it, expect } from 'vitest';
import {
  applyMove,
  checkWinner,
  checkWinningLine,
  checkWinningLineAt,
  isDraw,
  isGameOver,
  isBoardFull,
  getAvailableMoves,
  isValidMove,
} from './board';
import { Board, Cell, EMPTY_BOARD, BOARD_SIZE, CELL_COUNT, WIN_LENGTH } from './types';
import { indexToRowCol, rowColToIndex } from './types';

const row = (_n: number, ch: string) => ch.repeat(BOARD_SIZE);

/** Places marks from a compact string grid of 9x9 ('.' = empty). */
function buildFromGrid(grid: string[]): Board {
  const b: Cell[] = Array.from({ length: CELL_COUNT }, () => null);
  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowStr = grid[r];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const ch = rowStr?.[c];
      if (ch === 'X' || ch === 'O') {
        b[rowColToIndex(r, c)] = ch;
      }
    }
  }
  return b as Board;
}

describe('schema', () => {
  it('board has 81 cells and EMPTY_BOARD is all null', () => {
    expect(CELL_COUNT).toBe(81);
    expect(EMPTY_BOARD).toHaveLength(81);
    expect(EMPTY_BOARD.every((c) => c === null)).toBe(true);
  });

  it('WIN_LENGTH is 4', () => {
    expect(WIN_LENGTH).toBe(4);
  });

  it('index <-> row/col roundtrip', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      const [r, c] = indexToRowCol(i);
      expect(rowColToIndex(r, c)).toBe(i);
    }
  });
});

describe('applyMove', () => {
  it('places X/O on empty cells and preserves marks', () => {
    const b1 = applyMove(EMPTY_BOARD, 0, 'X');
    const b2 = applyMove(b1, 40, 'O');
    expect(b2[0]).toBe('X');
    expect(b2[40]).toBe('O');
  });

  it('throws on occupied cell', () => {
    const b = applyMove(EMPTY_BOARD, 10, 'X');
    expect(() => applyMove(b, 10, 'O')).toThrow('Cell 10 is occupied');
  });

  it('throws on out-of-range cell', () => {
    expect(() => applyMove(EMPTY_BOARD, 81, 'X')).toThrow();
  });

  it('does not mutate original', () => {
    const b = applyMove(EMPTY_BOARD, 0, 'X');
    expect(EMPTY_BOARD[0]).toBeNull();
    void b;
  });
});

describe('checkWinner / checkWinningLine — 4 in a row', () => {
  it('returns null on empty board', () => {
    expect(checkWinner(EMPTY_BOARD)).toBeNull();
  });

  it('row win — 4 in a row', () => {
    const g = [
      row(3, 'X').slice(0, 3) + 'XXXX' + row(3, 'X').slice(7),
      ...Array(8).fill(row(9, '.')),
    ];
    const b = buildFromGrid(g);
    expect(checkWinner(b)).toBe('X');
  });

  it('does NOT win with only 3 in a row', () => {
    const g = ['XXX' + row(9, '.').slice(3), ...Array(8).fill(row(9, '.'))];
    expect(checkWinner(buildFromGrid(g))).toBeNull();
  });

  it('column win — 4 in a column', () => {
    const g = [...Array(4).fill('XXXX' + row(9, '.').slice(4)), ...Array(5).fill(row(9, '.'))];
    expect(checkWinner(buildFromGrid(g))).toBe('X');
  });

  it('diagonal ↘ win', () => {
    const g = Array(9).fill(row(9, '.'));
    for (let i = 0; i < 4; i++) {
      const r = row(9, '.');
      g[i] = r.slice(0, i) + 'X' + r.slice(i + 1);
    }
    expect(checkWinner(buildFromGrid(g))).toBe('X');
  });

  it('diagonal ↙ win', () => {
    const g = Array(9).fill(row(9, '.'));
    for (let i = 0; i < 4; i++) {
      const r = row(9, '.');
      const c = 4 - i;
      g[i] = r.slice(0, c) + 'X' + r.slice(c + 1);
    }
    expect(checkWinner(buildFromGrid(g))).toBe('X');
  });

  it('win with 5+ in a row still counts (run >= 4)', () => {
    const g = ['XXXXX' + row(9, '.').slice(5), ...Array(8).fill(row(9, '.'))];
    expect(checkWinner(buildFromGrid(g))).toBe('X');
  });

  it('O wins when O has 4 in a row', () => {
    const g = ['OOOO' + row(9, '.').slice(4), ...Array(8).fill(row(9, '.'))];
    expect(checkWinner(buildFromGrid(g))).toBe('O');
  });

  it('returns the winning line only', () => {
    const g = ['XXXX' + row(9, '.').slice(4), ...Array(8).fill(row(9, '.'))];
    const line = checkWinningLine(buildFromGrid(g));
    expect(line).not.toBeNull();
    expect(line!.player).toBe('X');
    expect(line!.cells).toEqual([0, 1, 2, 3]);
  });
});

describe('checkWinningLineAt — move-centric detection', () => {
  it('detects a horizontal run through the placed cell', () => {
    const g = ['XXXX' + row(9, '.').slice(4), ...Array(8).fill(row(9, '.'))];
    const b = buildFromGrid(g);
    // the last placed mark is index 3 — a horizontal win through it
    expect(checkWinningLineAt(b, 3)).not.toBeNull();
    // a non-winning empty cell has no line
    expect(checkWinningLineAt(b, 80)).toBeNull();
    // an isolated X not part of 4 has no line
    const g2 = ['X' + row(9, '.').slice(1), ...Array(8).fill(row(9, '.'))];
    expect(checkWinningLineAt(buildFromGrid(g2), 0)).toBeNull();
  });
});

describe('isDraw', () => {
  it('false on empty board', () => {
    expect(isDraw(EMPTY_BOARD)).toBe(false);
  });

  it('false when a winner exists', () => {
    const g = ['XXXX' + row(9, '.').slice(4), ...Array(8).fill(row(9, '.'))];
    expect(isDraw(buildFromGrid(g))).toBe(false);
  });

  it('false on partial board', () => {
    const g = ['X' + row(9, '.').slice(1), ...Array(8).fill(row(9, '.'))];
    expect(isDraw(buildFromGrid(g))).toBe(false);
  });

  it('true only when all 81 cells are full with no winner', () => {
    // full but no 4-in-a-row anywhere (period-5 pattern in both axes)
    const full = Array.from({ length: 81 }, (_, i) => {
      const r = Math.floor(i / BOARD_SIZE);
      const c = i % BOARD_SIZE;
      return (((r + 2 * c) % 5) < 2 ? 'X' : 'O') as 'X' | 'O';
    });
    expect(checkWinner(full as unknown as Board)).toBeNull();
    expect(isBoardFull(full as unknown as Board)).toBe(true);
    expect(isDraw(full as unknown as Board)).toBe(true);
  });
});

describe('isGameOver / isBoardFull', () => {
  it('false on empty', () => {
    expect(isGameOver(EMPTY_BOARD)).toBe(false);
  });

  it('true on win', () => {
    const g = ['XXXX' + row(9, '.').slice(4), ...Array(8).fill(row(9, '.'))];
    expect(isGameOver(buildFromGrid(g))).toBe(true);
  });

  it('true on full board (draw)', () => {
    const full = Array.from({ length: 81 }, (_, i) => {
      const r = Math.floor(i / BOARD_SIZE);
      const c = i % BOARD_SIZE;
      return (((r + 2 * c) % 5) < 2 ? 'X' : 'O') as 'X' | 'O';
    });
    expect(isGameOver(full as unknown as Board)).toBe(true);
  });

  it('isBoardFull reflects 81/81', () => {
    const full = Array.from({ length: 81 }, () => 'X' as 'X' | 'O');
    expect(isBoardFull(full as unknown as Board)).toBe(true);
    expect(isBoardFull(EMPTY_BOARD)).toBe(false);
  });
});

describe('getAvailableMoves', () => {
  it('returns all 81 on empty board', () => {
    expect(getAvailableMoves(EMPTY_BOARD)).toEqual(Array.from({ length: 81 }, (_, i) => i));
  });

  it('returns [] on full board', () => {
    const full = Array.from({ length: 81 }, (_, i) => (i % 2 === 0 ? 'X' : 'O') as 'X' | 'O');
    expect(getAvailableMoves(full as unknown as Board)).toEqual([]);
  });

  it('excludes occupied cells', () => {
    const b = applyMove(EMPTY_BOARD, 0, 'X');
    const av = getAvailableMoves(b);
    expect(av).not.toContain(0);
    expect(av).toHaveLength(80);
  });
});

describe('isValidMove', () => {
  it('accepts empty in-range cells (0..80)', () => {
    expect(isValidMove(EMPTY_BOARD, 0)).toBe(true);
    expect(isValidMove(EMPTY_BOARD, 40)).toBe(true);
    expect(isValidMove(EMPTY_BOARD, 80)).toBe(true);
  });

  it('rejects occupied', () => {
    const b = applyMove(EMPTY_BOARD, 5, 'X');
    expect(isValidMove(b, 5)).toBe(false);
  });

  it('rejects out-of-range', () => {
    expect(isValidMove(EMPTY_BOARD, -1)).toBe(false);
    expect(isValidMove(EMPTY_BOARD, 81)).toBe(false);
  });
});

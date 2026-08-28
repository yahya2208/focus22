import {
  Board,
  Cell,
  MovePosition,
  EMPTY_BOARD,
  WIN_LENGTH,
} from '../tic-tac-toe/types';
import {
  checkWinningLine,
  isBoardFull,
  getAvailableMoves,
} from '../tic-tac-toe/board';
import type { TttPersistedMove, TttWinner, TttRole } from './types';

/** X always moves first (mapping: creator -> 'X', joiner -> 'O'). */
export const CREATOR_MARK = 'X' as const;
export const JOINER_MARK = 'O' as const;

/** Builds a 9x9 Board from the authoritative persisted move list. */
export function boardFromMoves(moves: readonly TttPersistedMove[]): Board {
  if (!moves || moves.length === 0) return EMPTY_BOARD;
  const cells: Cell[] = [...EMPTY_BOARD];
  for (const m of moves) {
    if (m.pos >= 0 && m.pos < cells.length) {
      // defensive: only accept valid marks (server guarantees this, but stay safe)
      cells[m.pos] = m.mark === 'X' || m.mark === 'O' ? m.mark : null;
    }
  }
  return cells;
}

/** The mark a given role plays with. */
export function markForRole(role: TttRole | null): 'X' | 'O' {
  return role === 'joiner' ? JOINER_MARK : CREATOR_MARK;
}

/** True when the game is over with a decisive (non-draw) winner. */
export function hasWinner(winner: TttWinner): boolean {
  return winner === 'creator' || winner === 'joiner';
}

/** Local convenience so consumers do not import board helpers directly. */
export function availableMoves(board: Board): MovePosition[] {
  return getAvailableMoves(board);
}

export function boardIsFull(board: Board): boolean {
  return isBoardFull(board);
}

/** Winning run on the current board, if any (local render hint only). */
export function currentWinningLine(board: Board): readonly number[] | null {
  return checkWinningLine(board)?.cells ?? null;
}

export { WIN_LENGTH };

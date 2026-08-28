import { describe, it, expect } from 'vitest';
import {
  boardFromMoves,
  markForRole,
  hasWinner,
  availableMoves,
  boardIsFull,
  currentWinningLine,
  CREATOR_MARK,
  JOINER_MARK,
  WIN_LENGTH,
} from '../../core/ttt-multiplayer/board';
import type { TttPersistedMove } from '../../core/ttt-multiplayer/types';

const XM = (pos: number): TttPersistedMove => ({ pos, mark: 'X', player_id: 'u1' });
const OM = (pos: number): TttPersistedMove => ({ pos, mark: 'O', player_id: 'u1' });

describe('ttt-multiplayer/board — pure helpers', () => {
  it('builds a full 9x9 empty board from no moves', () => {
    const b = boardFromMoves([]);
    expect(b).toHaveLength(81);
    expect(b.every((c) => c === null)).toBe(true);
  });

  it('places moves at the right positions and preserves marks', () => {
    const b = boardFromMoves([XM(0), OM(10)]);
    expect(b[0]).toBe('X');
    expect(b[10]).toBe('O');
    expect(b[1]).toBeNull();
  });

  it('defensively ignores out-of-range positions and invalid marks', () => {
    const b = boardFromMoves([XM(0), { ...OM(500) }, { pos: 1, mark: 'Z' as 'X', player_id: 'u1' }]);
    expect(b).toHaveLength(81);
    expect(b[0]).toBe('X');
    expect(b[1]).toBeNull();
    expect(b[500]).toBeUndefined();
  });

  it('last move wins the board when later moves overwrite a cell', () => {
    const b = boardFromMoves([XM(5), OM(5)]);
    expect(b[5]).toBe('O');
  });

  it('maps creator->X and joiner->O, defaulting unknown/null to X', () => {
    expect(markForRole('creator')).toBe('X');
    expect(markForRole('joiner')).toBe('O');
    expect(markForRole(null)).toBe('X');
  });

  it('hasWinner only for decisive outcomes', () => {
    expect(hasWinner('creator')).toBe(true);
    expect(hasWinner('joiner')).toBe(true);
    expect(hasWinner('draw')).toBe(false);
    expect(hasWinner(null)).toBe(false);
  });

  it('exposes the shared 4-in-a-row win length', () => {
    expect(WIN_LENGTH).toBe(4);
    expect(CREATOR_MARK).toBe('X');
    expect(JOINER_MARK).toBe('O');
  });

  it('reports available moves and full board from built state', () => {
    const b = boardFromMoves([XM(0), OM(1), XM(2)]);
    expect(availableMoves(b)).toHaveLength(81 - 3);
    expect(boardIsFull(b)).toBe(false);
    expect(availableMoves(b)).not.toContain(1);
  });

  it('detects a 4-in-a-row for the creator (X) via the shared engine', () => {
    // 9x9 grid, row 4: positions 36..39 are four consecutive cells.
    const moves: TttPersistedMove[] = [XM(36), OM(0), XM(37), OM(1), XM(38), OM(2), XM(39)];
    const b = boardFromMoves(moves);
    expect(currentWinningLine(b)).toEqual([36, 37, 38, 39]);
  });
});

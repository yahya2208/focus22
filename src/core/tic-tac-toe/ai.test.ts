import { describe, it, expect } from 'vitest';
import { getAIMove, getAIMoveAsync } from './ai';
import { applyMove, checkWinner } from './board';
import { EMPTY_BOARD, Board, rowColToIndex } from './types';

const AI: 'O' = 'O';
const HUM: 'X' = 'X';

function boardWith(pairs: readonly [number, 'X' | 'O'][]): Board {
  let b = EMPTY_BOARD;
  for (const [pos, player] of pairs) {
    b = applyMove(b, pos, player);
  }
  return b;
}

describe('getAIMove — opening', () => {
  it('plays the central cell on an empty board', () => {
    expect(getAIMove(EMPTY_BOARD, 'hard')).toBe(rowColToIndex(4, 4));
  });
});

describe('getAIMove — immediate win (all difficulties)', () => {
  it('takes a 3-in-a-row to win (returned move wins for AI)', () => {
    const b = boardWith([
      [rowColToIndex(4, 4), AI],
      [rowColToIndex(4, 3), AI],
      [rowColToIndex(4, 2), AI],
    ]);
    const move = getAIMove(b, 'medium');
    expect(checkWinner(applyMove(b, move, AI))).toBe(AI);
  });

  it('takes a 3-in-a-row completing 4 (multi-difficulty)', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const b = boardWith([
        [rowColToIndex(3, 0), AI],
        [rowColToIndex(3, 1), AI],
        [rowColToIndex(3, 2), AI],
      ]);
      const move = getAIMove(b, d);
      expect(checkWinner(applyMove(b, move, AI))).toBe(AI);
    }
  });
});

describe('getAIMove — blocking (medium & hard)', () => {
  it('medium blocks the human 4-in-a-row threat', () => {
    // (5,3) occupied by AI => the ONLY human-winning slot is (5,7)
    const b = boardWith([
      [rowColToIndex(5, 4), HUM],
      [rowColToIndex(5, 5), HUM],
      [rowColToIndex(5, 6), HUM],
      [rowColToIndex(5, 3), AI],
    ]);
    expect(getAIMove(b, 'medium')).toBe(rowColToIndex(5, 7));
  });

  it('hard blocks the human 4-in-a-row threat', () => {
    const b = boardWith([
      [rowColToIndex(2, 2), HUM],
      [rowColToIndex(2, 3), HUM],
      [rowColToIndex(2, 4), HUM],
      [rowColToIndex(2, 1), AI],
    ]);
    expect(getAIMove(b, 'hard')).toBe(rowColToIndex(2, 5));
  });

  it('medium prefers blocking over building its own threat', () => {
    const b = boardWith([
      [rowColToIndex(6, 0), AI],
      [rowColToIndex(6, 1), AI],
      [rowColToIndex(8, 1), HUM],
      [rowColToIndex(8, 2), HUM],
      [rowColToIndex(8, 3), HUM],
      [rowColToIndex(8, 0), AI],
    ]);
    expect(getAIMove(b, 'medium')).toBe(rowColToIndex(8, 4));
  });
});

describe('getAIMoveAsync — non-blocking yield', () => {
  it('resolves to a valid move and yields without blocking', async () => {
    const b = boardWith([
      [rowColToIndex(0, 1), AI],
      [rowColToIndex(0, 2), AI],
      [rowColToIndex(0, 3), AI],
    ]);
    const move = await getAIMoveAsync(b, 'hard');
    expect(checkWinner(applyMove(b, move, AI))).toBe(AI);
  });
});

describe('AI — never returns an occupied/out-of-range cell', () => {
  it('for all difficulties returns a valid empty cell', () => {
    const b = boardWith([
      [rowColToIndex(2, 2), AI],
      [rowColToIndex(3, 3), HUM],
      [rowColToIndex(4, 4), AI],
    ]);
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const move = getAIMove(b, d);
      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThanOrEqual(80);
      expect(b[move]).toBeNull();
    }
  });
});


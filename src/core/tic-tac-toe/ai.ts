import { Board, Difficulty, MovePosition, Player } from './types';
import { getAvailableMoves } from './board';
import { BOARD_SIZE, CELL_COUNT, DIRECTIONS, WIN_LENGTH, indexToRowCol, rowColToIndex } from './types';

const AI_PLAYER: Player = 'O';
const HUMAN_PLAYER: Player = 'X';

const WIN_SCORE = 1_000_000;
const OPEN_THREE = 8_000;
const CLOSED_THREE = 1_500;
const OPEN_TWO = 350;
const CLOSED_TWO = 90;
const OPEN_ONE = 30;
const CENTER_BONUS = 8;
const ADJACENCY_BONUS = 6;

/**
 * Evaluates the offensive value of `player` placing at `pos`:
 * the strongest formation (consecutive run + open ends) across all 4
 * directions through the cell. Deterministic and fast (O(4*directions)).
 */
function formationThreat(board: Board, pos: MovePosition, player: Player): number {
  const [r0, c0] = indexToRowCol(pos);
  let best = 0;

  for (const [dr, dc] of DIRECTIONS) {
    let n = 1;
    let open = 0;

    for (const sign of [1, -1] as const) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      let consecutive = 0;
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r * BOARD_SIZE + c] === player) {
        consecutive++;
        r += dr * sign;
        c += dc * sign;
      }
      n += consecutive;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r * BOARD_SIZE + c] === null) {
        open++;
      }
    }

    let value = 0;
    if (n >= WIN_LENGTH) {
      value = WIN_SCORE;
    } else if (n === WIN_LENGTH - 1) {
      value = open === 2 ? OPEN_THREE : open === 1 ? CLOSED_THREE : 0;
    } else if (n === WIN_LENGTH - 2) {
      value = open === 2 ? OPEN_TWO : open === 1 ? CLOSED_TWO : 0;
    } else {
      value = open === 2 ? OPEN_ONE : 0;
    }

    if (value > best) best = value;
  }

  return best;
}

function findImmediateWin(board: Board, player: Player): MovePosition | null {
  for (const pos of getAvailableMoves(board)) {
    if (formationThreat(board, pos, player) >= WIN_SCORE) return pos;
  }
  return null;
}

function findImmediateBlock(board: Board, opponent: Player): MovePosition | null {
  for (const pos of getAvailableMoves(board)) {
    if (formationThreat(board, pos, opponent) >= WIN_SCORE) return pos;
  }
  return null;
}

function hasNeighbor(board: Board, pos: MovePosition): boolean {
  const [r0, c0] = indexToRowCol(pos);
  for (const [dr, dc] of DIRECTIONS) {
    for (const sign of [1, -1] as const) {
      const r = r0 + dr * sign;
      const c = c0 + dc * sign;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r * BOARD_SIZE + c] !== null) {
        return true;
      }
    }
  }
  return false;
}

function centerDistanceScore(pos: MovePosition): number {
  const [r, c] = indexToRowCol(pos);
  const mid = (BOARD_SIZE - 1) / 2;
  return CENTER_BONUS - Math.round(Math.abs(r - mid) + Math.abs(c - mid));
}

function scoreCell(board: Board, pos: MovePosition, difficulty: Difficulty): number {
  const aiOffense = formationThreat(board, pos, AI_PLAYER);
  const humanThreat = formationThreat(board, pos, HUMAN_PLAYER);
  const defenseMultiplier = difficulty === 'easy' ? 0.55 : difficulty === 'medium' ? 0.85 : 1.0;
  let score = aiOffense + humanThreat * defenseMultiplier;
  score += centerDistanceScore(pos);
  if (hasNeighbor(board, pos)) score += ADJACENCY_BONUS;
  return score;
}

function pickRandom<T>(arr: readonly T[]): T {
  const array = new Uint32Array(1);
  array[0] = (Math.random() * 0xffffffff) >>> 0;
  const idx = array[0] % arr.length;
  const value: T | undefined = arr[idx];
  if (value === undefined) throw new Error('Empty selection');
  return value;
}

/** reasonable early-game pool — near existing marks or center region */
function sensiblePool(board: Board): MovePosition[] {
  const all = getAvailableMoves(board);
  return all.filter((p) => hasNeighbor(board, p) || centerDistanceScore(p) > CENTER_BONUS - 6);
}

function findDoubleThreatBlock(board: Board): MovePosition | null {
  let best: MovePosition | null = null;
  let bestScore = -1;
  for (const pos of getAvailableMoves(board)) {
    const threat = formationThreat(board, pos, HUMAN_PLAYER);
    if (threat === OPEN_THREE && threat > bestScore) {
      bestScore = threat;
      best = pos;
    }
  }
  return best;
}

function pickBestScore(board: Board, difficulty: Difficulty, topK: number): MovePosition {
  const candidates = getAvailableMoves(board)
    .map((pos) => ({ pos, score: scoreCell(board, pos, difficulty) }))
    .sort((a, b) => b.score - a.score);
  if (difficulty === 'easy') {
    const pool = candidates.slice(0, Math.min(topK, Math.max(1, candidates.length)));
    return pickRandom(pool.map((c) => c.pos));
  }
  const top = candidates.slice(0, Math.min(topK, candidates.length)).map((c) => c.pos);
  return top[0] as MovePosition;
}

/**
 * Deterministic, bounded heuristic move selection for a 9x9 board.
 * No minimax — single-pass scoring over <=81 cells => fast, never freezes.
 */
export function getAIMove(board: Board, difficulty: Difficulty): MovePosition {
  const moves = getAvailableMoves(board);
  if (moves.length === 0) throw new Error('No available moves');
  if (moves.length === CELL_COUNT) {
    return rowColToIndex(4, 4); // strong opening
  }

  const win = findImmediateWin(board, AI_PLAYER);
  if (win !== null) return win;

  switch (difficulty) {
    case 'easy': {
      const block = findImmediateBlock(board, HUMAN_PLAYER);
      if (block !== null && Math.random() >= 0.35) return block;
      if (Math.random() < 0.3) return pickRandom(sensiblePool(board));
      return pickBestScore(board, difficulty, 5);
    }
    case 'medium': {
      const block = findImmediateBlock(board, HUMAN_PLAYER);
      if (block !== null) return block;
      return pickBestScore(board, difficulty, 3);
    }
    case 'hard': {
      const block = findImmediateBlock(board, HUMAN_PLAYER);
      if (block !== null) return block;
      const defensive = findDoubleThreatBlock(board);
      if (defensive !== null) return defensive;
      return pickBestScore(board, difficulty, 1);
    }
  }
}

/**
 * Asynchronous, non-blocking variant. Yields to the event loop so the UI can
 * paint the "thinking" state before the bounded heuristic runs. A Web Worker
 * would only replace this body if benchmarking proves it necessary.
 */
export async function getAIMoveAsync(board: Board, difficulty: Difficulty): Promise<MovePosition> {
  await new Promise<void>((resolve) => {
    if (typeof setTimeout === 'function') setTimeout(resolve, 0);
    else resolve();
  });
  return getAIMove(board, difficulty);
}

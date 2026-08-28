export type Player = 'X' | 'O';
export type Cell = Player | null;
export type Board = readonly Cell[];
export type MovePosition = number;
export type Difficulty = 'easy' | 'medium' | 'hard';
export type MatchResult = 'win' | 'loss' | 'draw';
export type GamePhase = 'active' | 'ai-thinking' | 'session-complete';
export type SessionOutcome = 'pending' | 'human' | 'ai' | 'draw';

export interface WinningLine {
  readonly player: Player;
  readonly cells: readonly number[];
}

export interface Move {
  readonly moveIndex: number;
  readonly player: 'human' | 'ai';
  readonly position: MovePosition;
  readonly thinkingTimeMs: number;
}

export interface MatchData {
  readonly matchIndex: number;
  readonly moves: readonly Move[];
  readonly result: MatchResult;
  readonly moveCount: number;
  readonly durationMs: number;
  readonly aiDifficulty: Difficulty;
  readonly winningLine: readonly number[] | null;
}

export const BOARD_SIZE = 9;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
export const WIN_LENGTH = 4;

export const EMPTY_BOARD: Board = Array.from({ length: CELL_COUNT }, () => null);

export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 0], [1, 1], [1, -1],
];

export function indexToRowCol(index: number): readonly [number, number] {
  return [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];
}

export function rowColToIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

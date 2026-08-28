import { Board, Cell, MovePosition, Player, WinningLine, WIN_LENGTH, BOARD_SIZE, CELL_COUNT, DIRECTIONS, indexToRowCol } from './types';

export function applyMove(board: Board, pos: MovePosition, player: Player): Board {
  if (!isValidMove(board, pos)) {
    throw new Error(`Cell ${pos} is occupied`);
  }
  const cells: Cell[] = [...board];
  cells[pos] = player;
  return cells;
}

function rowColInBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/**
 * Returns the contiguous winning run (length >= WIN_LENGTH) through `pos` for
 * the mark at that cell, or null if `pos` is not part of any 4-in-a-row.
 * O(4 directions * 9 cells) — efficient enough to call after every move.
 */
export function checkWinningLineAt(board: Board, pos: MovePosition): WinningLine | null {
  if (pos < 0 || pos >= CELL_COUNT) return null;
  const mark = board[pos];
  if (mark == null) return null;

  const [row, col] = indexToRowCol(pos);

  for (const [dr, dc] of DIRECTIONS) {
    const run: number[] = [pos];

    for (const sign of [1, -1] as const) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (rowColInBounds(r, c) && board[r * BOARD_SIZE + c] === mark) {
        run.push(r * BOARD_SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }

    if (run.length >= WIN_LENGTH) {
      run.sort((a, b) => a - b);
      return { player: mark, cells: run };
    }
  }

  return null;
}

export function checkWinningLine(board: Board): WinningLine | null {
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] !== null) {
      const line = checkWinningLineAt(board, i);
      if (line !== null) return line;
    }
  }
  return null;
}

export function checkWinner(board: Board): Player | null {
  return checkWinningLine(board)?.player ?? null;
}

export function isDraw(board: Board): boolean {
  return checkWinner(board) === null && board.every((cell): cell is Cell => cell !== null);
}

export function isGameOver(board: Board): boolean {
  return checkWinner(board) !== null || board.every((cell): cell is Cell => cell !== null);
}

export function isBoardFull(board: Board): boolean {
  return board.every((cell): cell is Cell => cell !== null);
}

export function getAvailableMoves(board: Board): MovePosition[] {
  const moves: MovePosition[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i] === null) {
      moves.push(i);
    }
  }
  return moves;
}

export function isValidMove(board: Board, pos: MovePosition): boolean {
  return pos >= 0 && pos < CELL_COUNT && board[pos] === null;
}

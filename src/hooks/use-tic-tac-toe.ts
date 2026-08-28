import { useCallback, useReducer, useRef } from 'react';
import {
  Board,
  Difficulty,
  GamePhase,
  Move,
  MovePosition,
  SessionOutcome,
  EMPTY_BOARD,
} from '../core/tic-tac-toe/types';
import { applyMove, checkWinningLineAt, isBoardFull, isValidMove } from '../core/tic-tac-toe/board';
import { getAIMoveAsync } from '../core/tic-tac-toe/ai';

const HUMAN_PLAYER = 'X' as const;
const AI_PLAYER = 'O' as const;

interface State {
  readonly board: Board;
  readonly phase: GamePhase;
  readonly moveCount: number;
  readonly matchMoves: readonly Move[];
  readonly matchResult: 'pending' | 'win' | 'loss' | 'draw';
  readonly difficulty: Difficulty;
  readonly sessionOutcome: SessionOutcome;
  readonly winningLine: readonly number[] | null;
}

type Action =
  | { type: 'HUMAN_MOVE'; position: MovePosition; timestampMs: number }
  | { type: 'AI_MOVE'; position: MovePosition; timestampMs: number; thinkingTimeMs: number }
  | { type: 'SET_DIFFICULTY'; difficulty: Difficulty }
  | { type: 'RESET' };

function initialState(difficulty: Difficulty): State {
  return {
    board: EMPTY_BOARD,
    phase: 'active',
    moveCount: 0,
    matchMoves: [],
    matchResult: 'pending',
    difficulty,
    sessionOutcome: 'pending',
    winningLine: null,
  };
}

function conclude(state: State, board: Board, matchMoves: readonly Move[], moveCount: number, lastPos: MovePosition): State {
  const line = checkWinningLineAt(board, lastPos);
  const draw = line === null && isBoardFull(board);
  let matchResult: 'pending' | 'win' | 'loss' | 'draw' = 'pending';
  let sessionOutcome: SessionOutcome = 'pending';
  let winningLine: readonly number[] | null = null;

  if (line !== null) {
    winningLine = line.cells;
    matchResult = line.player === HUMAN_PLAYER ? 'win' : 'loss';
    sessionOutcome = line.player === HUMAN_PLAYER ? 'human' : 'ai';
  } else if (draw) {
    matchResult = 'draw';
    sessionOutcome = 'draw';
  }

  if (matchResult === 'pending') {
    return { ...state, board, matchMoves, moveCount };
  }

  return {
    ...state,
    board,
    matchMoves,
    moveCount,
    matchResult,
    sessionOutcome,
    winningLine,
    phase: 'session-complete',
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HUMAN_MOVE': {
      if (state.phase !== 'active') return state;
      if (!isValidMove(state.board, action.position)) return state;

      const board = applyMove(state.board, action.position, HUMAN_PLAYER);
      const move: Move = {
        moveIndex: state.moveCount,
        player: 'human',
        position: action.position,
        thinkingTimeMs: 0,
      };
      const matchMoves = [...state.matchMoves, move] as readonly Move[];
      const moveCount = state.moveCount + 1;

      const next = conclude(state, board, matchMoves, moveCount, action.position);
      if (next.phase === 'session-complete') return next;
      return { ...next, phase: 'ai-thinking' };
    }

    case 'AI_MOVE': {
      if (state.phase !== 'ai-thinking') return state;

      const board = applyMove(state.board, action.position, AI_PLAYER);
      const move: Move = {
        moveIndex: state.moveCount,
        player: 'ai',
        position: action.position,
        thinkingTimeMs: action.thinkingTimeMs,
      };
      const matchMoves = [...state.matchMoves, move] as readonly Move[];
      const moveCount = state.moveCount + 1;

      const next = conclude(state, board, matchMoves, moveCount, action.position);
      if (next.phase === 'session-complete') return next;
      return { ...next, phase: 'active' };
    }

    case 'SET_DIFFICULTY': {
      if (state.phase !== 'session-complete') return state;
      return { ...state, difficulty: action.difficulty };
    }

    case 'RESET': {
      return initialState(state.difficulty);
    }

    default:
      return state;
  }
}

export interface UseTicTacToeReturn {
  readonly board: Board;
  readonly phase: GamePhase;
  readonly moveCount: number;
  readonly matchMoves: readonly Move[];
  readonly matchResult: 'pending' | 'win' | 'loss' | 'draw';
  readonly difficulty: Difficulty;
  readonly sessionOutcome: SessionOutcome;
  readonly winningLine: readonly number[] | null;
  readonly humanMove: (position: MovePosition) => void;
  readonly aiMove: () => void;
  readonly setDifficulty: (difficulty: Difficulty) => void;
  readonly reset: () => void;
}

export function useTicTacToe(initialDifficulty: Difficulty = 'medium'): UseTicTacToeReturn {
  const [state, dispatch] = useReducer(reducer, initialDifficulty, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastHumanTimeRef = useRef<number>(0);

  const humanMove = useCallback((position: MovePosition) => {
    lastHumanTimeRef.current = Date.now();
    dispatch({ type: 'HUMAN_MOVE', position, timestampMs: Date.now() });
  }, []);

  const aiMove = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'ai-thinking') return;
    const started = lastHumanTimeRef.current;
    void getAIMoveAsync(current.board, current.difficulty).then((position) => {
      const now = Date.now();
      if (stateRef.current.phase !== 'ai-thinking') return;
      dispatch({
        type: 'AI_MOVE',
        position,
        timestampMs: now,
        thinkingTimeMs: Math.max(started > 0 ? now - started : 0, 1),
      });
    });
  }, []);

  const reset = useCallback(() => {
    lastHumanTimeRef.current = 0;
    dispatch({ type: 'RESET' });
  }, []);

  const setDifficulty = useCallback((difficulty: Difficulty) => {
    dispatch({ type: 'SET_DIFFICULTY', difficulty });
  }, []);

  return {
    board: state.board,
    phase: state.phase,
    moveCount: state.moveCount,
    matchMoves: state.matchMoves,
    matchResult: state.matchResult,
    difficulty: state.difficulty,
    sessionOutcome: state.sessionOutcome,
    winningLine: state.winningLine,
    humanMove,
    aiMove,
    setDifficulty,
    reset,
  };
}

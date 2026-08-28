import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTicTacToe } from '../../hooks/use-tic-tac-toe';
import { EMPTY_BOARD } from '../../core/tic-tac-toe/types';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Flush the async AI computation (getAIMoveAsync yields via setTimeout). */
async function flushAi(result: { current: ReturnType<typeof useTicTacToe> }) {
  await act(async () => {
    result.current.aiMove();
    await tick();
    await tick();
  });
}

async function playToCompletion(result: { current: ReturnType<typeof useTicTacToe> }, difficulty: string) {
  let safety = 0;
  while (result.current.phase !== 'session-complete' && safety < 300) {
    safety++;
    if (result.current.phase === 'active') {
      const pos = result.current.board.findIndex((c) => c === null);
      act(() => result.current.humanMove(pos));
    } else if (result.current.phase === 'ai-thinking') {
      await flushAi(result);
    } else {
      break;
    }
  }
  void difficulty;
}

describe('useTicTacToe (9x9 competitive redesign)', () => {
  describe('initial state', () => {
    it('starts with empty 9x9 board, active phase, pending outcome', () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      expect(result.current.board).toEqual(EMPTY_BOARD);
      expect(result.current.board).toHaveLength(81);
      expect(result.current.phase).toBe('active');
      expect(result.current.moveCount).toBe(0);
      expect(result.current.matchMoves).toHaveLength(0);
      expect(result.current.matchResult).toBe('pending');
      expect(result.current.sessionOutcome).toBe('pending');
      expect(result.current.winningLine).toBeNull();
      expect(result.current.difficulty).toBe('medium');
    });

    it('accepts custom initial difficulty', () => {
      const { result } = renderHook(() => useTicTacToe('hard'));
      expect(result.current.difficulty).toBe('hard');
    });
  });

  describe('human move', () => {
    it('applies human move and transitions to ai-thinking', () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(40));
      expect(result.current.board[40]).toBe('X');
      expect(result.current.phase).toBe('ai-thinking');
      expect(result.current.moveCount).toBe(1);
      expect(result.current.matchMoves).toHaveLength(1);
      expect(result.current.matchMoves[0]!.player).toBe('human');
      expect(result.current.matchMoves[0]!.position).toBe(40);
    });

    it('ignores move during ai-thinking phase', () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(40));
      expect(result.current.phase).toBe('ai-thinking');
      act(() => result.current.humanMove(0));
      expect(result.current.board[0]).toBeNull();
      expect(result.current.moveCount).toBe(1);
    });

    it('ignores move on occupied cell', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(40));
      await flushAi(result);
      act(() => result.current.humanMove(40));
      expect(result.current.moveCount).toBe(2);
    });
  });

  describe('AI move', () => {
    it('applies AI move and transitions back to active', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(0));
      expect(result.current.phase).toBe('ai-thinking');
      await flushAi(result);
      expect(result.current.phase).toBe('active');
      expect(result.current.moveCount).toBe(2);
      expect(result.current.matchMoves).toHaveLength(2);
      expect(result.current.matchMoves[1]!.player).toBe('ai');
    });

    it('AI places O on a valid cell different from human', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(40));
      await flushAi(result);
      const aiPos = result.current.matchMoves[1]!.position;
      expect(result.current.board[aiPos]).toBe('O');
      expect(aiPos).not.toBe(40);
      expect(result.current.board[40]).toBe('X');
    });

    it('ignores aiMove when phase is active', () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.aiMove());
      expect(result.current.moveCount).toBe(0);
    });

    it('records a positive thinking time for AI moves', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(0));
      await flushAi(result);
      expect(result.current.matchMoves[1]!.thinkingTimeMs).toBeGreaterThanOrEqual(1);
    });
  });

  describe('full game — single continuous match completes', () => {
    it('reaches session-complete with a non-pending outcome', async () => {
      const { result } = renderHook(() => useTicTacToe('easy'));
      await playToCompletion(result, 'easy');
      expect(result.current.phase).toBe('session-complete');
      expect(['human', 'ai', 'draw']).toContain(result.current.sessionOutcome);
      expect(['win', 'loss', 'draw']).toContain(result.current.matchResult);
    });

    it('winningLine is set exactly when the result is a win/loss', async () => {
      const { result } = renderHook(() => useTicTacToe('easy'));
      await playToCompletion(result, 'easy');
      if (result.current.matchResult !== 'draw') {
        expect(result.current.winningLine).not.toBeNull();
        expect(result.current.winningLine!.length).toBeGreaterThanOrEqual(4);
      } else {
        expect(result.current.winningLine).toBeNull();
        expect(result.current.matchMoves).toHaveLength(81);
      }
    });
  });

  describe('move ordering & integrity', () => {
    it('matchMoves alternate human then AI with correct indices', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(0));
      await flushAi(result);
      act(() => result.current.humanMove(1));
      await flushAi(result);
      expect(result.current.matchMoves[0]!.player).toBe('human');
      expect(result.current.matchMoves[1]!.player).toBe('ai');
      expect(result.current.matchMoves[2]!.player).toBe('human');
      expect(result.current.matchMoves[3]!.player).toBe('ai');
      expect(result.current.matchMoves.map((m) => m.moveIndex)).toEqual([0, 1, 2, 3]);
    });

    it('board cells match move history', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      act(() => result.current.humanMove(0));
      await flushAi(result);
      expect(result.current.board[0]).toBe('X');
      const aiPos = result.current.matchMoves[1]!.position;
      expect(result.current.board[aiPos]).toBe('O');
      expect(result.current.board.filter((c) => c !== null)).toHaveLength(2);
    });
  });

  describe('reset', () => {
    it('resets the single-match session to initial state (preserving difficulty)', async () => {
      const { result } = renderHook(() => useTicTacToe('hard'));
      act(() => result.current.humanMove(0));
      await flushAi(result);
      act(() => result.current.reset());
      expect(result.current.board).toEqual(EMPTY_BOARD);
      expect(result.current.phase).toBe('active');
      expect(result.current.moveCount).toBe(0);
      expect(result.current.matchMoves).toHaveLength(0);
      expect(result.current.matchResult).toBe('pending');
      expect(result.current.sessionOutcome).toBe('pending');
      expect(result.current.winningLine).toBeNull();
      expect(result.current.difficulty).toBe('hard');
    });
  });

  describe('setDifficulty', () => {
    it('changes difficulty only on session-complete', async () => {
      const { result } = renderHook(() => useTicTacToe('medium'));
      // ignored while active
      act(() => result.current.setDifficulty('hard'));
      expect(result.current.difficulty).toBe('medium');
      // applied once the single match completes
      await playToCompletion(result, 'medium');
      expect(result.current.phase).toBe('session-complete');
      act(() => result.current.setDifficulty('hard'));
      expect(result.current.difficulty).toBe('hard');
      // reset keeps the new difficulty
      act(() => result.current.reset());
      expect(result.current.difficulty).toBe('hard');
      expect(result.current.phase).toBe('active');
    });
  });
});

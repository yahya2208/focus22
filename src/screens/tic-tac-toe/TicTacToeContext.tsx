import { createContext, useContext, type ReactNode } from 'react';
import { useTicTacToe } from '../../hooks/use-tic-tac-toe';
import { useAppState } from '../../store/navigation';
import type { Difficulty } from '../../core/tic-tac-toe/types';

type TicTacToeValue = ReturnType<typeof useTicTacToe>;

const TicTacToeCtx = createContext<TicTacToeValue | null>(null);

export function TicTacToeProvider({ children }: { readonly children: ReactNode }) {
  const { routeParams } = useAppState();
  const difficulty = (routeParams.difficulty as Difficulty) ?? 'medium';
  const value = useTicTacToe(difficulty);
  return <TicTacToeCtx.Provider value={value}>{children}</TicTacToeCtx.Provider>;
}

export function useTicTacToeState(): TicTacToeValue {
  const ctx = useContext(TicTacToeCtx);
  if (!ctx) throw new Error('useTicTacToeState must be used within TicTacToeProvider');
  return ctx;
}

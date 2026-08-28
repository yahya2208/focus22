import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../core/auth/AuthProvider';
import {
  tttCreateGame,
  tttJoinGame,
  tttPlayMove,
  tttGetGame,
  tttAbandonGame,
  tttGetInvite,
} from '../services/ttt-multiplayer-sender';
import { boardFromMoves, currentWinningLine } from '../core/ttt-multiplayer/board';
import type {
  TttGameState,
  TttRole,
  TttGameStatus,
  TttWinner,
  TttCreateGameResult,
  TttInviteInfo,
  TttJoinGameResult,
} from '../core/ttt-multiplayer/types';
import type { Board, MovePosition } from '../core/tic-tac-toe/types';

export type TttMultiplayerStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface UseTttMultiplayerOptions {
  /** Adopt an existing game (from route params) so a remounted screen resumes polling. */
  readonly gameId?: string | null;
  /** Adopt a known role (e.g. joiner after join). Creator is inferred server-side. */
  readonly role?: TttRole | null;
}

interface UseTttMultiplayerReturn {
  readonly status: TttMultiplayerStatus;
  readonly error: string | null;
  readonly board: Board;
  readonly gameId: string | null;
  readonly role: TttRole | null;
  readonly myMark: 'X' | 'O';
  readonly gameStatus: TttGameStatus | null;
  readonly winner: TttWinner;
  readonly winningLine: readonly number[] | null;
  readonly isMyTurn: boolean;
  readonly opponentJoined: boolean;
  readonly myPerspective: 'win' | 'loss' | 'draw' | 'pending';
  readonly createGame: () => Promise<TttCreateGameResult>;
  readonly joinGame: (inviteToken: string) => Promise<TttJoinGameResult>;
  readonly loadInvite: (inviteToken: string) => Promise<TttInviteInfo>;
  readonly play: (position: MovePosition) => Promise<void>;
  readonly abandon: () => Promise<void>;
}

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    const raw = (e as { message: unknown }).message;
    return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
  }
  return fallback;
}

function roleFor(myUid: string, state: TttGameState | null): TttRole | null {
  if (!state) return null;
  if (state.createdBy === myUid) return 'creator';
  if (state.joinerId === myUid) return 'joiner';
  return null;
}

export function useTttMultiplayer(options: UseTttMultiplayerOptions = {}): UseTttMultiplayerReturn {
  const initialGameId = options.gameId ?? null;
  const initialRole = options.role ?? null;

  const { state: authState, service } = useAuth();

  const [status, setStatus] = useState<TttMultiplayerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(initialGameId);
  const [role, setRole] = useState<TttRole | null>(initialRole);
  const [gameState, setGameState] = useState<TttGameState | null>(null);

  const uid = authState.user?.id ?? null;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;

  const gameRef = useRef<TttGameState | null>(gameState);
  gameRef.current = gameState;

  const creatingRef = useRef(false);

  /** Ensure a Supabase identity (guest auto-sign-in when not signed in). */
  const ensureAuth = useCallback(async (): Promise<string | null> => {
    if (uidRef.current) return uidRef.current;
    if (authState.status === 'loading') return null;
    if (authState.status === 'unauthenticated' && service.signInAsGuest) {
      try {
        const user = await service.signInAsGuest();
        return user.id;
      } catch {
        setStatus('error');
        setError('Guest sign-in unavailable. Please try again.');
        return null;
      }
    }
    return uidRef.current;
  }, [authState.status, service]);

  const poll = useCallback(async (gid: string, myUid: string) => {
    try {
      const next = await tttGetGame(gid);
      setGameState(next);
      setRole(roleFor(myUid, next));
    } catch {
      // transient poll failures are tolerated
    }
  }, []);

  // When adopting an existing game id (remount from route params), poll immediately.
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const myUid = uidRef.current;
    if (!myUid) return;

    const tick = () => {
      if (cancelled) return;
      void poll(gameId, myUid);
    };
    tick();
    const iv = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [gameId, poll]);

  const createGame = useCallback(async (): Promise<TttCreateGameResult> => {
    if (creatingRef.current) throw new Error('A game is already being created');
    creatingRef.current = true;
    try {
      const myUid = await ensureAuth();
      if (!myUid) throw new Error('Authentication required');
      setStatus('pending');
      setError(null);
      const result = await tttCreateGame();
      setGameId(result.gameId);
      setRole('creator');
      setStatus('ready');
      setGameState({
        gameId: result.gameId,
        status: 'waiting',
        createdBy: myUid,
        joinerId: null,
        moves: [],
        winner: null,
        winningLine: null,
        createdAt: result.createdAt,
        finishedAt: null,
      });
      return result;
    } catch (e) {
      const msg = messageOf(e, 'Failed to start game');
      setStatus('error');
      setError(msg);
      throw e;
    } finally {
      creatingRef.current = false;
    }
  }, [ensureAuth]);

  const loadInvite = useCallback(async (token: string): Promise<TttInviteInfo> => {
    return tttGetInvite(token);
  }, []);

  const joinGame = useCallback(async (token: string): Promise<TttJoinGameResult> => {
    const myUid = await ensureAuth();
    if (!myUid) throw new Error('Authentication required');
    setStatus('pending');
    setError(null);
    try {
      const result = await tttJoinGame(token);
      setGameId(result.gameId);
      setRole('joiner');
      setStatus('ready');
      const state: TttGameState = {
        gameId: result.gameId,
        status: result.status,
        createdBy: result.creatorUid,
        joinerId: result.joinerUid ?? myUid,
        moves: [],
        winner: null,
        winningLine: null,
        createdAt: '',
        finishedAt: null,
      };
      setGameState(state);
      return result;
    } catch (e) {
      const msg = messageOf(e, 'Failed to join game');
      setStatus('error');
      setError(msg);
      throw e;
    }
  }, [ensureAuth]);

  const play = useCallback(async (position: MovePosition) => {
    const gid = gameIdRef.current;
    if (!gid) return;
    const result = await tttPlayMove(gid, position);
    const current = gameRef.current;
    if (current) {
      const mark: 'X' | 'O' = role === 'joiner' ? 'O' : 'X';
      const updated: TttGameState = {
        ...current,
        status: result.status,
        winner: result.winner,
        winningLine: result.winningLine,
        moves: [...current.moves, { pos: position, mark, player_id: uidRef.current ?? '' }],
      };
      setGameState(updated);
    }
    if (uidRef.current) void poll(gid, uidRef.current);
  }, [role, poll]);

  const abandon = useCallback(async () => {
    const gid = gameIdRef.current;
    if (!gid) return;
    try {
      await tttAbandonGame(gid);
      setGameState((prev) => (prev ? { ...prev, status: 'abandoned' } : prev));
    } catch {
      // best effort
    }
  }, []);

  const board = useMemo(() => boardFromMoves(gameState?.moves ?? []), [gameState]);
  const myMark: 'X' | 'O' = role === 'joiner' ? 'O' : 'X';
  const myUid = uidRef.current;

  const moves = gameState?.moves ?? [];
  const lastMark = moves.length > 0 ? moves[moves.length - 1]!.mark : null;
  const isMyTurn = useMemo(() => {
    if (!myUid) return false;
    if (!gameState || gameState.status !== 'active') return false;
    const isCreator = gameState.createdBy === myUid;
    if (moves.length === 0) return isCreator;
    return lastMark === (isCreator ? 'O' : 'X');
  }, [gameState, myUid, moves.length, lastMark]);

  const winningLine = useMemo(
    () => (gameState ? gameState.winningLine ?? (gameState.winner ? currentWinningLine(board) : null) : null),
    [gameState, board],
  );

  const myPerspective: 'win' | 'loss' | 'draw' | 'pending' = (() => {
    if (!gameState || gameState.status !== 'completed') return 'pending';
    const w = gameState.winner;
    if (!w) return 'pending';
    if (w === 'draw') return 'draw';
    const myRole = role ?? roleFor(myUid ?? '', gameState);
    if (myRole === w) return 'win';
    return 'loss';
  })();

  return {
    status,
    error,
    board,
    gameId,
    role,
    myMark,
    gameStatus: gameState?.status ?? null,
    winner: gameState?.winner ?? null,
    winningLine,
    isMyTurn,
    opponentJoined: !!gameState?.joinerId && gameState.status !== 'waiting',
    myPerspective,
    createGame,
    joinGame,
    loadInvite,
    play,
    abandon,
  };
}

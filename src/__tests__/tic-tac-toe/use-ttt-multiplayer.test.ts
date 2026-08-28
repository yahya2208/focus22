import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => {
  const useAuth = {
    state: { status: 'unauthenticated', user: null as { id: string } | null, error: null as string | null },
    service: { signInAsGuest: vi.fn() },
  };
  return { useAuth, create: vi.fn(), join: vi.fn(), playMove: vi.fn(), getGame: vi.fn(), abandon: vi.fn(), getInvite: vi.fn() };
});

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => mocks.useAuth,
}));

vi.mock('../../services/ttt-multiplayer-sender', () => ({
  tttCreateGame: mocks.create,
  tttJoinGame: mocks.join,
  tttPlayMove: mocks.playMove,
  tttGetGame: mocks.getGame,
  tttAbandonGame: mocks.abandon,
  tttGetInvite: mocks.getInvite,
}));

import { useTttMultiplayer } from '../../hooks/use-ttt-multiplayer';
import type { TttGameState } from '../../core/ttt-multiplayer/types';

const GAME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TOKEN = '11111111-2222-4333-8444-555555555555';

function completedState(winner: TttGameState['winner']): TttGameState {
  return {
    gameId: GAME,
    status: 'completed',
    createdBy: 'me',
    joinerId: 'friend',
    moves: [{ pos: 0, mark: 'X', player_id: 'me' }],
    winner,
    winningLine: winner && winner !== 'draw' ? [0, 1, 2, 3] : null,
    createdAt: 't',
    finishedAt: 't',
  };
}

const guest = () =>
  ({ status: 'unauthenticated' as const, user: null, error: null });

beforeEach(() => {
  mocks.useAuth.state = guest();
  mocks.useAuth.service.signInAsGuest.mockReset();
  mocks.useAuth.service.signInAsGuest.mockResolvedValue({ id: 'guest-1' });
  for (const fn of [mocks.create, mocks.join, mocks.playMove, mocks.getGame, mocks.abandon, mocks.getInvite]) {
    fn.mockReset();
  }
});

/**
 * TIC TAC TOE FRIEND PLAY — hook lifecycle (00049).
 * Covers zero-friction auto guest sign-in, create/join state, and deriving the
 * local perspective + turn from the server-authoritative polled state.
 */
describe('useTttMultiplayer', () => {
  it('createGame auto-signs-in a guest, sets creator role and idle board', async () => {
    mocks.create.mockResolvedValue({ gameId: GAME, inviteToken: TOKEN, status: 'waiting', createdBy: 'guest-1', createdAt: 't' });
    mocks.getGame.mockResolvedValue({ ...completedState(null), status: 'waiting', createdBy: 'guest-1', joinerId: null });

    const { result } = renderHook(() => useTttMultiplayer());
    await act(async () => {
      await result.current.createGame();
    });

    expect(mocks.useAuth.service.signInAsGuest).toHaveBeenCalledTimes(1);
    expect(result.current.gameId).toBe(GAME);
    expect(result.current.role).toBe('creator');
    expect(result.current.myMark).toBe('X');
    expect(result.current.gameStatus).toBe('waiting');
    expect(result.current.board).toHaveLength(81);
    expect(result.current.status).toBe('ready');
  });

  it('joinGame auto-signs-in a guest and adopts joiner role', async () => {
    mocks.join.mockResolvedValue({ gameId: GAME, status: 'active', creatorUid: 'creator', joinerUid: 'guest-1' });

    const { result } = renderHook(() => useTttMultiplayer());
    await act(async () => {
      await result.current.joinGame(TOKEN);
    });

    expect(mocks.useAuth.service.signInAsGuest).toHaveBeenCalledTimes(1);
    expect(result.current.role).toBe('joiner');
    expect(result.current.myMark).toBe('O');
    expect(result.current.gameId).toBe(GAME);
  });

  it('joinGame surfaces a typed error and stays in error state when it fails', async () => {
    mocks.join.mockRejectedValue({ code: 'GAME_NOT_WAITING', message: 'GAME_NOT_WAITING' });

    const { result } = renderHook(() => useTttMultiplayer());
    await act(async () => {
      await expect(result.current.joinGame(TOKEN)).rejects.toMatchObject({ code: 'GAME_NOT_WAITING' });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('GAME_NOT_WAITING');
  });

  it('joiner wins when polled state marks the joiner as winner', async () => {
    mocks.useAuth.state = { status: 'authenticated', user: { id: 'friend' }, error: null };
    mocks.getGame.mockResolvedValue({ ...completedState('joiner'), joinerId: 'friend' });

    const { result } = renderHook(() => useTttMultiplayer({ gameId: GAME, role: 'joiner' }));
    await act(async () => {});
    await act(async () => {});

    expect(result.current.myPerspective).toBe('win');
    expect(result.current.gameStatus).toBe('completed');
    expect(result.current.winner).toBe('joiner');
    expect(result.current.winningLine).toEqual([0, 1, 2, 3]);
  });

  it('creator loses when polled state marks the joiner as winner', async () => {
    mocks.useAuth.state = { status: 'authenticated', user: { id: 'me' }, error: null };
    mocks.getGame.mockResolvedValue(completedState('joiner'));

    const { result } = renderHook(() => useTttMultiplayer({ gameId: GAME, role: 'creator' }));
    await act(async () => {});
    await act(async () => {});

    expect(result.current.myPerspective).toBe('loss');
  });

  it('reports draw perspective for a draw', async () => {
    mocks.useAuth.state = { status: 'authenticated', user: { id: 'me' }, error: null };
    mocks.getGame.mockResolvedValue(completedState('draw'));

    const { result } = renderHook(() => useTttMultiplayer({ gameId: GAME, role: 'creator' }));
    await act(async () => {});
    await act(async () => {});
    expect(result.current.myPerspective).toBe('draw');
  });

  it('creator moves first in an active game with no moves', async () => {
    mocks.useAuth.state = { status: 'authenticated', user: { id: 'me' }, error: null };
    mocks.getGame.mockResolvedValue({
      gameId: GAME,
      status: 'active',
      createdBy: 'me',
      joinerId: 'friend',
      moves: [],
      winner: null,
      winningLine: null,
      createdAt: 't',
      finishedAt: null,
    });

    const { result } = renderHook(() => useTttMultiplayer({ gameId: GAME, role: 'creator' }));
    await act(async () => {});
    await act(async () => {});
    expect(result.current.isMyTurn).toBe(true);
    expect(result.current.opponentJoined).toBe(true);
  });

  it('Play Again resets a completed game to a fresh waiting game with a new server game ID', async () => {
    mocks.useAuth.state = { status: 'authenticated', user: { id: 'me' }, error: null };
    const NEW_GAME = 'bbbbbbbb-0000-4000-8000-ffffffffffff';
    mocks.create.mockResolvedValue({ gameId: NEW_GAME, inviteToken: TOKEN, status: 'waiting', createdBy: 'me', createdAt: 't' });
    mocks.getGame.mockImplementation((gid: string) => {
      if (gid === GAME) return Promise.resolve(completedState('joiner'));
      return Promise.resolve({ gameId: gid, status: 'waiting', createdBy: 'me', joinerId: null, moves: [], winner: null, winningLine: null, createdAt: 't', finishedAt: null });
    });
    mocks.playMove.mockResolvedValue({ gameId: NEW_GAME, status: 'active', winner: null, winningLine: null });

    const { result } = renderHook(() => useTttMultiplayer({ gameId: GAME, role: 'creator' }));
    await act(async () => {});
    await act(async () => {});
    expect(result.current.gameStatus).toBe('completed');

    await act(async () => {
      await result.current.createGame();
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result.current.gameId).toBe(NEW_GAME);
    expect(result.current.role).toBe('creator');
    expect(result.current.gameStatus).toBe('waiting');
    expect(result.current.winner).toBeNull();
    expect(result.current.board.every((c) => c === null)).toBe(true);

    await act(async () => {
      await result.current.play(0);
    });
    expect(mocks.playMove).toHaveBeenCalledWith(NEW_GAME, 0);
    expect(mocks.playMove).not.toHaveBeenCalledWith(GAME, 0);
  });

  it('does not create a duplicate game when createGame is called while one is pending', async () => {
    mocks.useAuth.state = { status: 'authenticated', user: { id: 'me' }, error: null };
    const NEW_GAME = 'cccccccc-0000-4000-8000-ffffffffffff';
    let resolveCreate!: (v: { gameId: string; inviteToken: string; status: string; createdBy: string; createdAt: string }) => void;
    mocks.create.mockImplementation(
      () => new Promise((res) => { resolveCreate = res; }),
    );

    const { result } = renderHook(() => useTttMultiplayer());
    let first!: Promise<{ gameId: string; inviteToken: string; status: string; createdBy: string; createdAt: string }>;
    await act(async () => {
      first = result.current.createGame();
    });

    await act(async () => {
      await expect(result.current.createGame()).rejects.toThrow('already being created');
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ gameId: NEW_GAME, inviteToken: TOKEN, status: 'waiting', createdBy: 'me', createdAt: 't' });
      await first;
    });
    expect(result.current.gameId).toBe(NEW_GAME);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock.rpc }),
}));

import {
  tttCreateGame,
  tttGetInvite,
  tttJoinGame,
  tttPlayMove,
  tttGetGame,
  tttAbandonGame,
  tttAdminStats,
} from '../../services/ttt-multiplayer-sender';

const GAME_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INVITE = '11111111-2222-4333-8444-555555555555';

function okResolve(data: unknown, error: unknown = null) {
  rpcMock.rpc.mockResolvedValue({ data, error });
}

beforeEach(() => {
  rpcMock.rpc.mockReset();
});

/**
 * TIC TAC TOE FRIEND PLAY — client RPC wrapper contract (00049).
 * Asserts the exact RPC names + argument shapes, error-code mapping, and that
 * the client NEVER ships identity fields (server derives auth.uid()).
 */
describe('ttt-multiplayer-sender — RPC contract', () => {
  it('creates a game via ttt_create_game with no args', async () => {
    okResolve({ game_id: GAME_ID, invite_token: INVITE, status: 'waiting', created_by: 'u1', created_at: 't' });
    const out = await tttCreateGame();
    expect(rpcMock.rpc).toHaveBeenCalledTimes(1);
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_create_game');
    expect(out.gameId).toBe(GAME_ID);
    expect(out.createdBy).toBe('u1');
  });

  it('loads an invite via ttt_get_invite(p_invite_token)', async () => {
    okResolve({ game_id: GAME_ID, status: 'waiting', host_display_name: 'Ari', expires_at: null });
    const out = await tttGetInvite(INVITE);
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_get_invite');
    expect(rpcMock.rpc.mock.calls[0]![1]).toEqual({ p_invite_token: INVITE });
    expect(out.hostDisplayName).toBe('Ari');
  });

  it('joins a game via ttt_join_game(p_invite_token)', async () => {
    okResolve({ game_id: GAME_ID, status: 'active', creator_uid: 'u1', joiner_uid: 'u2' });
    const out = await tttJoinGame(INVITE);
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_join_game');
    expect(rpcMock.rpc.mock.calls[0]![1]).toEqual({ p_invite_token: INVITE });
    expect(out.creatorUid).toBe('u1');
    expect(out.joinerUid).toBe('u2');
  });

  it('plays a move via ttt_play_move(p_game_id, p_position)', async () => {
    okResolve({ game_id: GAME_ID, status: 'active', winner: null, winning_line: null, move_count: 1, last_mark: 'X' });
    await tttPlayMove(GAME_ID, 40);
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_play_move');
    expect(rpcMock.rpc.mock.calls[0]![1]).toEqual({ p_game_id: GAME_ID, p_position: 40 });
  });

  it('gets game via ttt_get_game(p_game_id)', async () => {
    okResolve({ game_id: GAME_ID, status: 'active', created_by: 'u1', joiner_id: 'u2', moves: [], winner: null, winning_line: null, created_at: 't', finished_at: null });
    const out = await tttGetGame(GAME_ID);
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_get_game');
    expect(rpcMock.rpc.mock.calls[0]![1]).toEqual({ p_game_id: GAME_ID });
    expect(out.status).toBe('active');
    expect(out.moves).toEqual([]);
  });

  it('abandons via ttt_abandon_game(p_game_id)', async () => {
    okResolve({ game_id: GAME_ID, status: 'abandoned' });
    const out = await tttAbandonGame(GAME_ID);
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_abandon_game');
    expect(out.status).toBe('abandoned');
  });

  it('reads admin stats via ttt_admin_stats with no args', async () => {
    okResolve({ total_games: 3, by_status: { completed: 2 }, by_winner: {}, avg_moves: 10, recent: [] });
    const out = await tttAdminStats();
    expect(rpcMock.rpc.mock.calls[0]![0]).toBe('ttt_admin_stats');
    expect(out.totalGames).toBe(3);
  });

  it('maps server error codes to typed TttMultiplayerError', async () => {
    rpcMock.rpc.mockResolvedValue({ data: null, error: { message: 'NOT_YOUR_TURN: wait for the other player' } });
    await expect(tttPlayMove(GAME_ID, 1)).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('maps CELL_OCCUPIED / NOT_A_PARTICIPANT / GAME_FULL codes', async () => {
    const cases: Array<[string, string]> = [
      ['CELL_OCCUPIED', 'CELL_OCCUPIED'],
      ['NOT_A_PARTICIPANT', 'NOT_A_PARTICIPANT'],
      ['GAME_FULL', 'GAME_FULL'],
      ['ADMIN_REQUIRED', 'ADMIN_REQUIRED'],
    ];
    for (const [msg, code] of cases) {
      rpcMock.rpc.mockResolvedValue({ data: null, error: { message: msg } });
      await expect(tttJoinGame(INVITE)).rejects.toMatchObject({ code });
    }
  });

  it('falls back to NETWORK_ERROR/UNKNOWN_ERROR on unexpected failures', async () => {
    rpcMock.rpc.mockRejectedValue(new Error('socket hang up'));
    await expect(tttGetGame(GAME_ID)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    rpcMock.rpc.mockResolvedValue({ data: null, error: { message: 'some unexpected thing' } });
    await expect(tttGetGame(GAME_ID)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    rpcMock.rpc.mockResolvedValue({ data: null, error: null });
    await expect(tttGetGame(GAME_ID)).rejects.toMatchObject({ code: 'UNKNOWN_ERROR' });
  });

  it('never sends user_id / email / token in any payload', () => {
    okResolve({ game_id: GAME_ID, invite_token: INVITE, status: 'waiting', created_by: 'u1', created_at: 't' });
    void tttCreateGame();
    void tttGetInvite(INVITE);
    void tttJoinGame(INVITE);
    void tttPlayMove(GAME_ID, 5);
    void tttGetGame(GAME_ID);
    void tttAbandonGame(GAME_ID);
    void tttAdminStats();
    for (const call of rpcMock.rpc.mock.calls) {
      const args = call[1] as Record<string, unknown>;
      const serialized = JSON.stringify(args);
      // No auth identity fields (user_id/email/password/tokens).
      for (const banned of ['user_id', 'user_uid', 'email', 'password', 'authToken', 'access_token', 'authorization']) {
        expect(serialized.includes(banned)).toBe(false);
      }
      // p_invite_token is a public invite UUID, never a JWT (no signature dots).
      if (args.p_invite_token) {
        const t = String(args.p_invite_token);
        expect(t.split('.').length).toBeLessThanOrEqual(1);
        expect(t).toMatch(/^[0-9a-fA-F-]+$/);
      }
    }
  });
});

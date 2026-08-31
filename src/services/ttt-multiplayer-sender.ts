import { getSupabaseClient } from '../core/supabase/client';
import type {
  TttCreateGameResult,
  TttInviteInfo,
  TttJoinGameResult,
  TttGameState,
  TttGameStatus,
  TttPlayMoveResult,
  TttAdminStats,
  TttPersistedMove,
  TttWinner,
  TttErrorCode,
} from '../core/ttt-multiplayer/types';

/**
 * TIC TAC TOE FRIEND PLAY — client RPC layer (00049).
 *
 * Thin wrapper over the SECURITY DEFINER RPCs. The client NEVER sends identity
 * fields (user_id/email); ownership & validation happen server-side via
 * auth.uid(). This mirrors the challenge-service client pattern.
 */

const ERROR_MAP: Readonly<Record<string, TttErrorCode>> = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  CANNOT_JOIN_OWN_GAME: 'CANNOT_JOIN_OWN_GAME',
  GAME_NOT_WAITING: 'GAME_NOT_WAITING',
  GAME_FULL: 'GAME_FULL',
  GAME_NOT_ACTIVE: 'GAME_NOT_ACTIVE',
  GAME_OVER: 'GAME_OVER',
  GAME_ABANDONED: 'GAME_ABANDONED',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
  INVALID_POSITION: 'INVALID_POSITION',
  CELL_OCCUPIED: 'CELL_OCCUPIED',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export interface TttMultiplayerError {
  readonly code: TttErrorCode;
  readonly message: string;
}

function mapError(error: unknown): TttMultiplayerError {
  if (error && typeof error === 'object') {
    const obj = error as { message?: unknown; code?: unknown };
    const existingCode = typeof obj.code === 'string' ? ERROR_MAP[obj.code] : undefined;
    if (existingCode) return { code: existingCode, message: String(obj.message ?? '') };
    if ('message' in obj) {
      const raw = String(obj.message);
      for (const key of Object.keys(ERROR_MAP)) {
        if (raw.includes(key)) return { code: ERROR_MAP[key]!, message: raw };
      }
    }
  }
  if (typeof error === 'string') {
    if (ERROR_MAP[error]) return { code: ERROR_MAP[error]!, message: error };
  }
  return { code: 'NETWORK_ERROR', message: 'Network error — please try again' };
}

type RecordMap = Readonly<Record<string, unknown>>;

/**
 * The RPCs return JSONB with snake_case keys (00049). Normalize each payload to
 * the camelCase domain contract here — the wire layer is the single choke point,
 * so callers always work with the typed Ttt* interfaces.
 */
function toCreateGameResult(d: RecordMap): TttCreateGameResult {
  return {
    gameId: d.game_id as string,
    inviteToken: d.invite_token as string,
    status: d.status as TttGameStatus,
    createdBy: d.created_by as string,
    createdAt: d.created_at as string,
  };
}

function toInviteInfo(d: RecordMap): TttInviteInfo {
  return {
    gameId: d.game_id as string,
    status: d.status as TttGameStatus,
    hostDisplayName: d.host_display_name as string,
    expiresAt: (d.expires_at as string | null) ?? null,
  };
}

function toJoinGameResult(d: RecordMap): TttJoinGameResult {
  const result: TttJoinGameResult = {
    gameId: d.game_id as string,
    status: d.status as TttGameStatus,
    creatorUid: d.creator_uid as string,
    joinerUid: (d.joiner_uid as string | null) ?? null,
    ...(d.already_joined != null ? { alreadyJoined: Boolean(d.already_joined) } : {}),
  };
  return result;
}

function toPlayMoveResult(d: RecordMap): TttPlayMoveResult {
  return {
    gameId: d.game_id as string,
    status: d.status as TttGameStatus,
    winner: d.winner as TttWinner,
    winningLine: (d.winning_line as readonly number[] | null) ?? null,
    moveCount: d.move_count as number,
    lastMark: d.last_mark as 'X' | 'O',
  };
}

function toGameState(d: RecordMap): TttGameState {
  return {
    gameId: d.game_id as string,
    status: d.status as TttGameStatus,
    createdBy: d.created_by as string,
    joinerId: (d.joiner_id as string | null) ?? null,
    moves: (d.moves as readonly TttPersistedMove[]) ?? [],
    winner: d.winner as TttWinner,
    winningLine: (d.winning_line as readonly number[] | null) ?? null,
    createdAt: d.created_at as string,
    finishedAt: (d.finished_at as string | null) ?? null,
  };
}

function toAbandonResult(d: RecordMap): { gameId: string; status: string } {
  return {
    gameId: d.game_id as string,
    status: d.status as string,
  };
}

function toAdminStats(d: RecordMap): TttAdminStats {
  const recent = ((d.recent as RecordMap[]) ?? []).map((r) => ({
    gameId: r.game_id as string,
    status: r.status as TttGameStatus,
    winner: r.winner as TttWinner,
    moveCount: r.move_count as number,
    createdAt: r.created_at as string,
  }));
  return {
    totalGames: d.total_games as number,
    byStatus: (d.by_status as Record<string, number>) ?? {},
    byWinner: (d.by_winner as Record<string, number>) ?? {},
    avgMoves: d.avg_moves as number,
    recent,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<RecordMap> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw mapError(error);
  if (data == null) {
    throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as TttMultiplayerError;
  }
  return data as RecordMap;
}

export async function tttCreateGame(): Promise<TttCreateGameResult> {
  try {
    return toCreateGameResult(await rpc('ttt_create_game', {}));
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttGetInvite(inviteToken: string): Promise<TttInviteInfo> {
  try {
    return toInviteInfo(await rpc('ttt_get_invite', { p_invite_token: inviteToken }));
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttJoinGame(inviteToken: string): Promise<TttJoinGameResult> {
  try {
    return toJoinGameResult(await rpc('ttt_join_game', { p_invite_token: inviteToken }));
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttPlayMove(
  gameId: string,
  position: number,
): Promise<TttPlayMoveResult> {
  try {
    const data = await rpc('ttt_play_move', {
      p_game_id: gameId,
      p_position: position,
    });
    return toPlayMoveResult(data);
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttGetGame(gameId: string): Promise<TttGameState> {
  try {
    return toGameState(await rpc('ttt_get_game', { p_game_id: gameId }));
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttAbandonGame(gameId: string): Promise<{ gameId: string; status: string }> {
  try {
    return toAbandonResult(await rpc('ttt_abandon_game', {
      p_game_id: gameId,
    }));
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttAdminStats(): Promise<TttAdminStats> {
  try {
    return toAdminStats(await rpc('ttt_admin_stats', {}));
  } catch (e) {
    throw mapError(e);
  }
}

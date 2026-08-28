import { getSupabaseClient } from '../core/supabase/client';
import type {
  TttCreateGameResult,
  TttInviteInfo,
  TttJoinGameResult,
  TttGameState,
  TttPlayMoveResult,
  TttAdminStats,
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

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw mapError(error);
  if (data == null) {
    throw { code: 'UNKNOWN_ERROR', message: 'No data returned from server' } as TttMultiplayerError;
  }
  return data as T;
}

export async function tttCreateGame(): Promise<TttCreateGameResult> {
  try {
    const data = await rpc<TttCreateGameResult>('ttt_create_game', {});
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttGetInvite(inviteToken: string): Promise<TttInviteInfo> {
  try {
    const data = await rpc<TttInviteInfo>('ttt_get_invite', { p_invite_token: inviteToken });
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttJoinGame(inviteToken: string): Promise<TttJoinGameResult> {
  try {
    const data = await rpc<TttJoinGameResult>('ttt_join_game', { p_invite_token: inviteToken });
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttPlayMove(
  gameId: string,
  position: number,
): Promise<TttPlayMoveResult> {
  try {
    const data = await rpc<TttPlayMoveResult>('ttt_play_move', {
      p_game_id: gameId,
      p_position: position,
    });
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttGetGame(gameId: string): Promise<TttGameState> {
  try {
    const data = await rpc<TttGameState>('ttt_get_game', { p_game_id: gameId });
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttAbandonGame(gameId: string): Promise<{ gameId: string; status: string }> {
  try {
    const data = await rpc<{ gameId: string; status: string }>('ttt_abandon_game', {
      p_game_id: gameId,
    });
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function tttAdminStats(): Promise<TttAdminStats> {
  try {
    const data = await rpc<TttAdminStats>('ttt_admin_stats', {});
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

/**
 * Tic Tac Toe — Friend Play / Multiplayer domain types.
 *
 * Mirrors the server-authoritative model in supabase/migrations/00049.
 * All identity is derived from auth.uid() on the server; the client only ever
 * holds opaque uuids returned by the RPCs. Never send identity fields.
 */

export type TttGameStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'abandoned';

export type TttWinner = 'creator' | 'joiner' | 'draw' | null;

/** A single move as stored in the authoritative game record. */
export interface TttPersistedMove {
  readonly pos: number;
  readonly mark: 'X' | 'O';
  readonly player_id: string;
}

/** What this participant is: the game creator (X, first) or the joiner (O). */
export type TttRole = 'creator' | 'joiner';

/** Create a game (host). */
export interface TttCreateGameResult {
  readonly gameId: string;
  readonly inviteToken: string;
  readonly status: TttGameStatus;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** Public, safe info for the invite landing page (never the host's own uid). */
export interface TttInviteInfo {
  readonly gameId: string;
  readonly status: TttGameStatus;
  readonly hostDisplayName: string;
  readonly expiresAt: string | null;
}

/** Join a waiting game (friend). */
export interface TttJoinGameResult {
  readonly gameId: string;
  readonly status: TttGameStatus;
  readonly creatorUid: string;
  readonly joinerUid: string | null;
  readonly alreadyJoined?: boolean;
}

/** Full authoritative game state used for polling / rendering the board. */
export interface TttGameState {
  readonly gameId: string;
  readonly status: TttGameStatus;
  readonly createdBy: string;
  readonly joinerId: string | null;
  readonly moves: readonly TttPersistedMove[];
  readonly winner: TttWinner;
  readonly winningLine: readonly number[] | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

/** Result of playing a move — server-computed outcome. */
export interface TttPlayMoveResult {
  readonly gameId: string;
  readonly status: TttGameStatus;
  readonly winner: TttWinner;
  readonly winningLine: readonly number[] | null;
  readonly moveCount: number;
  readonly lastMark: 'X' | 'O';
}

/** Admin aggregate statistics. */
export interface TttAdminStats {
  readonly totalGames: number;
  readonly byStatus: Record<string, number>;
  readonly byWinner: Record<string, number>;
  readonly avgMoves: number;
  readonly recent: ReadonlyArray<{
    readonly gameId: string;
    readonly status: TttGameStatus;
    readonly winner: TttWinner;
    readonly moveCount: number;
    readonly createdAt: string;
  }>;
}

export type TttErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVITE_NOT_FOUND'
  | 'CANNOT_JOIN_OWN_GAME'
  | 'GAME_NOT_WAITING'
  | 'GAME_FULL'
  | 'GAME_NOT_ACTIVE'
  | 'GAME_OVER'
  | 'GAME_ABANDONED'
  | 'GAME_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'NOT_A_PARTICIPANT'
  | 'INVALID_POSITION'
  | 'CELL_OCCUPIED'
  | 'ADMIN_REQUIRED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

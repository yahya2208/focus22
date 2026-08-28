import { getSupabaseClient } from '../core/supabase/client';

/**
 * TIC TAC TOE TELEMETRY CARVE-OUT — Gate 5, 2026-08-27.
 *
 * This file is the ONLY sanctioned runtime writer for Tic Tac Toe match data.
 * It calls exactly ONE approved SECURITY DEFINER RPC:
 *   record_tic_tac_toe_session(p_session_id, p_difficulty, p_matches)
 *
 * Hard contract:
 *   - Completion-only. No create / heartbeat / abandon persistence.
 *   - Fire-and-forget: never throws, never awaited, never blocks the UI.
 *   - user_id is derived SERVER-SIDE from auth.uid(); this client NEVER sends
 *     any identity field (no user_id, email, token).
 *   - No enable/disable runtime seams; tests isolate via mocking core/supabase/client only.
 */

export interface TicTacToeMoveData {
  readonly position: number;
  readonly player: 'human' | 'ai';
  readonly moveNumber: number;
}

export interface TicTacToeMatchData {
  readonly matchIndex: number;
  readonly result: 'win' | 'loss' | 'draw';
  readonly moveCount: number;
  readonly moves: readonly TicTacToeMoveData[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface TicTacToeSessionPayload {
  readonly sessionId: string;
  readonly difficulty: 'easy' | 'medium' | 'hard';
  readonly matches: readonly TicTacToeMatchData[];
}

interface RecordTicTacToeSessionArgs {
  p_session_id: string;
  p_difficulty: string;
  p_matches: Array<{
    match_index: number;
    result: string;
    move_count: number;
    moves: Array<{
      position: number;
      player: string;
      move_number: number;
    }>;
    started_at: string;
    finished_at: string;
  }>;
}

async function submitTicTacToeSession(args: RecordTicTacToeSessionArgs): Promise<void> {
  const { error } =
    await getSupabaseClient().rpc('record_tic_tac_toe_session', args);

  if (error) {
    console.error('[tic-tac-toe] RPC failed:', error.code, error.message, error.details);
  }
}

export function sendTicTacToeSession(payload: TicTacToeSessionPayload): void {
  try {
    const { sessionId, difficulty, matches } = payload;
    if (!sessionId || !difficulty || !matches || matches.length === 0) return;

    const validDifficulties = ['easy', 'medium', 'hard'] as const;
    if (!validDifficulties.includes(difficulty)) return;

    void submitTicTacToeSession({
      p_session_id: sessionId,
      p_difficulty: difficulty,
      p_matches: matches.map((m) => ({
        match_index: m.matchIndex,
        result: m.result,
        move_count: m.moveCount,
        moves: m.moves.map((mv) => ({
          position: mv.position,
          player: mv.player,
          move_number: mv.moveNumber,
        })),
        started_at: m.startedAt,
        finished_at: m.finishedAt,
      })),
    }).catch(() => {});
  } catch {
    // fire-and-forget: never throws
  }
}

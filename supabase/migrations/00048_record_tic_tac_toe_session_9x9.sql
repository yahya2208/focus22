-- ============================================================================
-- 00048 — TIC TAC TOE COMPETITIVE REDESIGN (9x9, 4-in-a-row) TELEMETRY
-- SUPERSEDES the replay geometry established in 00047 (which remains frozen).
--
-- Context: The game moved from 3x3/3-in-a-row to a 9x9 board with a 4-in-a-row
-- winning condition, played as ONE continuous match per authenticated session.
-- This migration REPLACES record_tic_tac_toe_session() to keep the server-side
-- replay authoritative under the new rules. 00047 is left untouched (frozen);
-- when this migration runs it simply redefines the same function with 9x9 logic.
--
-- Scope: ONE SECURITY DEFINER RPC for Tic Tac Toe per-session persistence.
--   record_tic_tac_toe_session() is the ONLY runtime write path for TTT data,
--   mirroring the completion-only pattern of 00041 and 00047:
--   startSession() is IN-MEMORY ONLY. The sessions row is INSERTed once, with
--   status='completed', when this RPC fires at session end. There is NO second
--   or parallel session and no 'running' row.
--
-- Contract (3 params):
--   p_session_id  text  — UUID format, session identifier
--   p_difficulty  text  — 'easy' | 'medium' | 'hard' (server-validated)
--   p_matches     jsonb — array of 1..5 match objects (client sends exactly 1)
--
-- Match object JSONB schema (9x9):
--   {
--     "match_index":  int (contiguous unique, 0-based),
--     "result":       text ('win'|'loss'|'draw'),
--     "move_count":   int (1..81),
--     "moves":        [{ "position": int(0..80), "player": text('human'|'ai'), "move_number": int }],
--     "started_at":   text (ISO timestamp),
--     "finished_at":  text (ISO timestamp)
--   }
--
-- Server-side validation (ALL invariants from 00047 preserved, geometry updated):
--   - Authentication: auth.uid() MUST be non-null (authenticated scientific session).
--   - Ownership: existing sessions row for p_session_id must belong to caller.
--   - Difficulty: easy/medium/hard
--   - Result: win/loss/draw
--   - match_index: contiguous 0..v_n-1
--   - Moves: non-empty (1..81), positions 0-80, human(X) first, strict
--     alternation, no duplicate positions, no moves after conclusion
--   - REAL SERVER-SIDE REPLAY on a 9x9 board: reconstruct the board from moves,
--     detect 4-in-a-row (rows, columns, both diagonals, run length >= 4) for the
--     winning outcome, draw only when all 81 cells are full, and verify the
--     claimed result matches the recomputed outcome (RESULT_MISMATCH).
--
-- Idempotency (exact-match, same as 00041/00047):
--   Same session_id + same payload → silent no-op
--   Same session_id + different payload → SESSION_ID_CONFLICT
--
-- Security:
--   SECURITY DEFINER — user_id from auth.uid(), never client-supplied
--   REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated
--
-- Storage:
--   Existing sessions table:
--     id → p_session_id
--     user_id → auth.uid()  (always non-null)
--     plugin_id → 'tic-tac-toe'
--     status → 'completed'
--     measurements → { difficulty, match_count }
--     scientific_results → { matches: [...] }
--     metadata → { version: '2.0', source: 'web-app', game: 'tic-tac-toe',
--                  board: '9x9', win: 'four-in-a-row' }
--
-- Rollback:
--   Re-apply the 00047 migration (it keeps a 3x3 definition) or
--   DROP FUNCTION record_tic_tac_toe_session(text, text, jsonb);
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.record_tic_tac_toe_session(
  p_session_id  text,
  p_difficulty  text,
  p_matches     jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_n         integer;
  v_match     jsonb;
  v_moves     jsonb;
  v_mn        integer;
  v_pos       integer;
  v_row       integer;
  v_col       integer;
  v_player    text;
  v_mark      text;
  v_seen_pos  boolean[];
  v_board     text[];
  v_winner    text;
  v_actual    text;
  v_full      boolean;
  v_result    text;
  v_match_idx integer;
  v_dir_rows  integer[];
  v_dir_cols  integer[];
  i           integer;
  j           integer;
  k           integer;
  d           integer;
  v_dr        integer;
  v_dc        integer;
  v_r         integer;
  v_c         integer;
  v_cnt       integer;
  v_existing  public.sessions%ROWTYPE;
BEGIN
  -- ---- authentication (Gate 0: authenticated scientific session) ----------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- ---- session ID format ---------------------------------------------------
  IF p_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'INVALID_SESSION_ID';
  END IF;

  -- ---- difficulty ----------------------------------------------------------
  IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'INVALID_DIFFICULTY';
  END IF;

  -- ---- matches array -------------------------------------------------------
  IF jsonb_typeof(p_matches) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_MATCHES';
  END IF;

  v_n := jsonb_array_length(p_matches);
  IF v_n < 1 OR v_n > 5 THEN
    RAISE EXCEPTION 'INVALID_MATCH_COUNT';
  END IF;

  -- 9x9 board: four directions (right, down, diag-down-right, diag-down-left)
  v_dir_rows := ARRAY[0, 1, 1, 1];
  v_dir_cols := ARRAY[1, 0, 1, -1];

  -- ---- per-match validation -------------------------------------------------
  FOR i IN 0..v_n - 1 LOOP
    v_match := p_matches->i;

    -- match_index: strict contiguous 0..v_n-1, no gaps, no duplicates
    v_match_idx := (v_match->>'match_index')::int;
    IF v_match_idx IS NULL OR v_match_idx <> i THEN
      RAISE EXCEPTION 'INVALID_MATCH_ORDER';
    END IF;

    -- result
    v_result := v_match->>'result';
    IF v_result NOT IN ('win', 'loss', 'draw') THEN
      RAISE EXCEPTION 'INVALID_MATCH_RESULT';
    END IF;

    -- moves array
    v_moves := v_match->'moves';
    IF jsonb_typeof(v_moves) <> 'array' THEN
      RAISE EXCEPTION 'INVALID_MOVES';
    END IF;

    v_mn := jsonb_array_length(v_moves);
    IF v_mn < 1 OR v_mn > 81 THEN
      RAISE EXCEPTION 'INVALID_MOVE_COUNT';
    END IF;

    -- move_count consistency
    IF (v_match->>'move_count')::int <> v_mn THEN
      RAISE EXCEPTION 'MOVE_COUNT_MISMATCH';
    END IF;

    -- reset replay board for this match (0-based array, 81 cells)
    v_board := array_fill(''::text, ARRAY[81], ARRAY[0]);
    v_winner := NULL;
    v_seen_pos := ARRAY_FILL(FALSE, ARRAY[81], ARRAY[0]);

    -- replay moves
    FOR j IN 0..v_mn - 1 LOOP
      v_pos := (v_moves->j->>'position')::int;
      v_player := v_moves->j->>'player';

      -- position range (9x9 => 0..80)
      IF v_pos < 0 OR v_pos > 80 THEN
        RAISE EXCEPTION 'INVALID_POSITION';
      END IF;

      -- player vocabulary
      IF v_player NOT IN ('human', 'ai') THEN
        RAISE EXCEPTION 'INVALID_PLAYER';
      END IF;

      -- first move must be human (X)
      IF j = 0 AND v_player <> 'human' THEN
        RAISE EXCEPTION 'FIRST_MOVE_MUST_BE_HUMAN';
      END IF;

      -- strict alternation
      IF j > 0 AND v_player = (v_moves->(j - 1)->>'player') THEN
        RAISE EXCEPTION 'INVALID_ALTERNATION';
      END IF;

      -- duplicate position within this match
      IF v_seen_pos[v_pos] THEN
        RAISE EXCEPTION 'DUPLICATE_POSITION';
      END IF;
      v_seen_pos[v_pos] := TRUE;

      -- no move after the match has already concluded
      IF v_winner IS NOT NULL THEN
        RAISE EXCEPTION 'MOVE_AFTER_GAME_OVER';
      END IF;

      -- place mark
      v_mark := CASE WHEN v_player = 'human' THEN 'X' ELSE 'O' END;
      v_board[v_pos] := v_mark;

      -- 4-in-a-row detection from the just-placed cell (row/col/diag, run >= 4)
      v_row := v_pos / 9;
      v_col := v_pos % 9;
      FOR d IN 1..4 LOOP
        v_dr := v_dir_rows[d];
        v_dc := v_dir_cols[d];
        v_cnt := 1;
        -- forward
        v_r := v_row + v_dr;
        v_c := v_col + v_dc;
        WHILE v_r >= 0 AND v_r <= 8 AND v_c >= 0 AND v_c <= 8
              AND v_board[v_r * 9 + v_c] = v_mark LOOP
          v_cnt := v_cnt + 1;
          v_r := v_r + v_dr;
          v_c := v_c + v_dc;
        END LOOP;
        -- backward
        v_r := v_row - v_dr;
        v_c := v_col - v_dc;
        WHILE v_r >= 0 AND v_r <= 8 AND v_c >= 0 AND v_c <= 8
              AND v_board[v_r * 9 + v_c] = v_mark LOOP
          v_cnt := v_cnt + 1;
          v_r := v_r - v_dr;
          v_c := v_c - v_dc;
        END LOOP;
        IF v_cnt >= 4 THEN
          v_winner := CASE WHEN v_player = 'human' THEN 'win' ELSE 'loss' END;
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

    -- conclude the match: winner already set, or draw if ALL 81 cells full
    IF v_winner IS NULL THEN
      v_full := TRUE;
      FOR k IN 0..80 LOOP
        IF v_board[k] = '' OR v_board[k] IS NULL THEN
          v_full := FALSE;
        END IF;
      END LOOP;
      IF v_full THEN
        v_actual := 'draw';
      ELSE
        RAISE EXCEPTION 'INCOMPLETE_MATCH';
      END IF;
    ELSE
      v_actual := v_winner;
    END IF;

    -- claimed result must match the replayed outcome
    IF v_actual <> v_result THEN
      RAISE EXCEPTION 'RESULT_MISMATCH';
    END IF;
  END LOOP;

  -- ---- ownership + idempotency (exact-match, same pattern as 00041/00047) ---
  SELECT * INTO v_existing FROM public.sessions WHERE id = p_session_id;
  IF FOUND THEN
    -- the caller must OWN this session
    IF v_existing.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'FOREIGN_SESSION';
    END IF;
    -- exact idempotent replay
    IF v_existing.status = 'completed'
       AND v_existing.plugin_id IS NOT DISTINCT FROM 'tic-tac-toe'
       AND v_existing.measurements IS NOT DISTINCT FROM
           jsonb_build_object('difficulty', p_difficulty, 'match_count', v_n)
       AND v_existing.scientific_results IS NOT DISTINCT FROM
           jsonb_build_object('matches', p_matches) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'SESSION_ID_CONFLICT';
  END IF;

  -- ---- insert into sessions table (single completion writer) ---------------
  BEGIN
    INSERT INTO public.sessions
      (id, user_id, plugin_id, status, measurements, scientific_results,
       metadata, created_at, updated_at, finished_at, version)
    VALUES (
      p_session_id,
      v_uid,
      'tic-tac-toe',
      'completed',
      jsonb_build_object('difficulty', p_difficulty, 'match_count', v_n),
      jsonb_build_object('matches', p_matches),
      jsonb_build_object('version', '2.0', 'source', 'web-app', 'game', 'tic-tac-toe',
                         'board', '9x9', 'win', 'four-in-a-row'),
      now(),
      now(),
      now(),
      '2.0'
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SESSION_ID_CONFLICT';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tic_tac_toe_session(text, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_tic_tac_toe_session(text, text, jsonb)
  TO anon, authenticated;

COMMIT;

-- ============================================================================
-- 00047 — TIC TAC TOE SESSION TELEMETRY
-- GATE 5 (Correction 1): Telemetry / RPC / Migration (2026-08-27)
--
-- Scope: ONE SECURITY DEFINER RPC for Tic Tac Toe per-session persistence.
--   record_tic_tac_toe_session() is the ONLY runtime write path for TTT data.
--   It follows the SAME completion pattern as 00041_record_scientific_session:
--   startSession() is IN-MEMORY ONLY (no DB row at start). The sessions row is
--   INSERTed once, with status='completed', when this RPC fires at session end.
--   There is therefore NO second/parallel session — this RPC does not create a
--   'running' row anywhere; it is the single completion writer for the session.
--
-- Contract (3 params):
--   p_session_id  text  — UUID format, session identifier
--   p_difficulty   text  — 'easy' | 'medium' | 'hard' (server-validated)
--   p_matches      jsonb — array of 1-5 match objects
--
-- Match object JSONB schema:
--   {
--     "match_index":  int (0..match_count-1, contiguous unique),
--     "result":       text ('win'|'loss'|'draw'),
--     "move_count":   int (1..9),
--     "moves":        [{ "position": int(0..8), "player": text('human'|'ai'), "move_number": int }],
--     "started_at":   text (ISO timestamp),
--     "finished_at":  text (ISO timestamp)
--   }
--
-- Server-side validation:
--   - Authentication: auth.uid() MUST be non-null (Tic Tac Toe is an
--     AUTHENTICATED scientific session per Gate 0). No anonymous persistence.
--   - Ownership: if a sessions row already exists for p_session_id, its user_id
--     must be the caller's auth.uid(); foreign sessions are rejected.
--   - Difficulty: must be easy/medium/hard
--   - Result per match: must be win/loss/draw
--   - match_index: contiguous 0..match_count-1, no gaps, no duplicates
--   - Moves: non-empty, positions 0-8, human(X) first, strict alternation,
--     no duplicate positions, no moves after the game has already concluded
--   - REAL SERVER-SIDE REPLAY: reconstruct the board from moves and verify the
--     claimed result matches the outcome computed from the moves (win/loss/draw),
--     and that no extra moves follow a winning/losing/draw-concluding move.
--
-- Idempotency (exact-match, same pattern as 00041):
--   Same session_id + same payload (difficulty + matches) → silent no-op
--   Same session_id + different payload → SESSION_ID_CONFLICT
--
-- Security:
--   SECURITY DEFINER — user_id derived from auth.uid(), never client-supplied
--   GROUPS are revoked; only anon + authenticated may EXECUTE (same as 00041)
--   The runtime 'sessions' table has NO RLS (writes via SECURITY DEFINER only)
--
-- Storage:
--   Uses existing sessions table:
--     id → p_session_id
--     user_id → auth.uid()  (always non-null: authenticated)
--     plugin_id → 'tic-tac-toe'
--     status → 'completed'
--     measurements → { difficulty, match_count }
--     scientific_results → { matches: [...] }
--     metadata → { version: '1.0', source: 'web-app', game: 'tic-tac-toe' }
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_tic_tac_toe_session(text, text, jsonb);
--
-- Post-apply verification:
--   SELECT proname FROM pg_proc WHERE proname = 'record_tic_tac_toe_session';
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.record_tic_tac_toe_session(
  p_session_id  text,
  p_difficulty   text,
  p_matches      jsonb
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
  v_player    text;
  v_seen_pos  boolean[];
  v_board     text[];
  v_winner    text;
  v_actual    text;
  v_full      boolean;
  v_result    text;
  v_match_idx integer;
  i           integer;
  j           integer;
  k           integer;
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
    IF v_mn < 1 OR v_mn > 9 THEN
      RAISE EXCEPTION 'INVALID_MOVE_COUNT';
    END IF;

    -- move_count consistency
    IF (v_match->>'move_count')::int <> v_mn THEN
      RAISE EXCEPTION 'MOVE_COUNT_MISMATCH';
    END IF;

    -- reset replay board for this match (0-based array, 9 cells)
    v_board := array_fill(''::text, ARRAY[9], ARRAY[0]);
    v_winner := NULL;
    v_seen_pos := ARRAY_FILL(FALSE, ARRAY[9], ARRAY[0]);

    -- replay moves
    FOR j IN 0..v_mn - 1 LOOP
      v_pos := (v_moves->j->>'position')::int;
      v_player := v_moves->j->>'player';

      -- position range
      IF v_pos < 0 OR v_pos > 8 THEN
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
      v_board[v_pos] := CASE WHEN v_player = 'human' THEN 'X' ELSE 'O' END;

      -- check if this move creates a win (3-in-a-row of the same mark)
      IF (v_board[0] <> '' AND v_board[0] = v_board[1] AND v_board[1] = v_board[2])
         OR (v_board[3] <> '' AND v_board[3] = v_board[4] AND v_board[4] = v_board[5])
         OR (v_board[6] <> '' AND v_board[6] = v_board[7] AND v_board[7] = v_board[8])
         OR (v_board[0] <> '' AND v_board[0] = v_board[3] AND v_board[3] = v_board[6])
         OR (v_board[1] <> '' AND v_board[1] = v_board[4] AND v_board[4] = v_board[7])
         OR (v_board[2] <> '' AND v_board[2] = v_board[5] AND v_board[5] = v_board[8])
         OR (v_board[0] <> '' AND v_board[0] = v_board[4] AND v_board[4] = v_board[8])
         OR (v_board[2] <> '' AND v_board[2] = v_board[4] AND v_board[4] = v_board[6]) THEN
        v_winner := CASE WHEN v_player = 'human' THEN 'win' ELSE 'loss' END;
      END IF;
    END LOOP;

    -- conclude the match: winner already set, or draw if board full
    IF v_winner IS NULL THEN
      v_full := TRUE;
      FOR k IN 0..8 LOOP
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

  -- ---- ownership + idempotency (exact-match, same pattern as 00041) --------
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
      jsonb_build_object('version', '1.0', 'source', 'web-app', 'game', 'tic-tac-toe'),
      now(),
      now(),
      now(),
      '1.0'
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
